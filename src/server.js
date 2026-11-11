// Web server: the website, live updates over WebSocket, chat, and admin controls.
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer } from 'ws';
import { config } from './config.js';
import { WorldStore } from './world.js';
import { Brain } from './brain.js';
import { Finn } from './finn.js';
import crypto from 'node:crypto';
import { RateLimiter, cleanVisitorText, cleanName } from './limits.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const store = new WorldStore(config.dataDir, config.keepSnapshots);
const brain = new Brain(config);

const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '8kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const broadcast = (msg) => {
  const data = JSON.stringify(msg);
  for (const c of wss.clients) if (c.readyState === 1) c.send(data);
};

const finn = new Finn({ store, brain, config, broadcast });

function publicState() {
  const S = store.state;
  return {
    turn: S.turn, finn: S.finn, ground: S.ground, objects: S.objects, assets: S.assets,
    journal: S.journal.slice(-60), bible: S.bible, queue: S.queue,
    chat: S.chat.slice(-60).map(({ who, name, text, t }) => ({ who, name, text, t })),
    status: finn.status, paused: finn.paused, nextTurnAt: finn.nextTurnAt, lastStudio: finn.lastStudio || null,
    balls: finn.publicBalls(), ballsFound: S.ballsFound, box: S.box, carrying: finn.carrying,
    ballsMax: config.ballsMaxInWorld,
    needs: S.needs, goals: S.goals, activity: S.finn.activity,
    memory: { days: S.memory.days.slice(-14), weeks: S.memory.weeks.slice(-4), story: S.memory.story },
  };
}

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'init', state: publicState(), viewers: wss.clients.size }));
  broadcast({ type: 'viewers', count: wss.clients.size });
  ws.on('close', () => broadcast({ type: 'viewers', count: wss.clients.size }));
});

// ---------- chat ----------
const limiter = new RateLimiter(config);
const visitorIp = (req) => req.get('cf-connecting-ip') || req.ip || 'unknown';

app.post('/api/chat', async (req, res) => {
  const text = cleanVisitorText(req.body?.text);
  const name = cleanName(req.body?.name);
  if (!text) return res.status(400).json({ error: 'Say something first.' });
  const block = limiter.check(visitorIp(req));
  if (block) return res.status(429).json({ error: block });
  limiter.hit(visitorIp(req));
  try {
    const reply = await finn.chat(name, text);
    res.json({ ok: true, reply: reply.text });
  } catch (e) {
    res.status(500).json({ error: 'Finn could not answer right now.' });
  }
});

// ---------- tennis balls ----------
// Visitors are identified by a salted hash of their IP address (the IP itself is never stored).
const SALT = config.adminToken || 'finn';
const giverId = (req) => crypto.createHash('sha256').update(SALT + visitorIp(req)).digest('hex').slice(0, 16);
app.post('/api/ball', (req, res) => {
  const x = Number(req.body?.x), y = Number(req.body?.y);
  if (!Number.isInteger(x) || !Number.isInteger(y)) return res.status(400).json({ error: 'Pick a spot on the map.' });
  const err = finn.hideBall(x, y, cleanName(req.body?.name), giverId(req));
  if (err) return res.status(400).json({ error: err });
  res.json({ ok: true });
});

// ---------- admin (send header  x-admin-token: <ADMIN_TOKEN>) ----------
function admin(req, res, next) {
  if (!config.adminToken || req.get('x-admin-token') !== config.adminToken) return res.status(403).json({ error: 'forbidden' });
  next();
}
app.get('/api/admin/status', admin, (req, res) => {
  res.json({
    status: finn.status, paused: finn.paused, turn: store.state.turn, nextTurnAt: finn.nextTurnAt && new Date(finn.nextTurnAt).toISOString(),
    spentTodayUsd: +brain.spentToday().toFixed(4), dailyBudgetUsd: config.dailyBudgetUsd,
    last7Days: Object.fromEntries(Object.entries(brain.spend.days).slice(-7)),
    snapshots: store.listSnapshots().slice(-10), viewers: wss.clients.size,
  });
});
app.post('/api/admin/pause', admin, (req, res) => { finn.paused = true; finn.setStatus('paused'); res.json({ ok: true }); });
app.post('/api/admin/resume', admin, (req, res) => { finn.paused = false; finn.setStatus('idle'); finn.schedule(5000); res.json({ ok: true }); });
app.post('/api/admin/turn', admin, (req, res) => {
  if (finn.busy) return res.status(409).json({ error: 'Finn is busy' });
  finn.turn().then(() => finn.schedule());
  res.json({ ok: true, message: 'Turn started' });
});
app.post('/api/admin/rollback', admin, (req, res) => {
  if (finn.busy) return res.status(409).json({ error: 'Finn is busy' });
  try {
    const used = store.restore(req.body?.snapshot);
    broadcast({ type: 'init', state: publicState(), viewers: wss.clients.size });
    res.json({ ok: true, restored: used });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/admin/reflect', admin, async (req, res) => {
  if (finn.busy) return res.status(409).json({ error: 'Finn is busy' });
  const kind = req.body?.kind === 'weekly' ? 'weekly' : 'daily';
  await finn.reflectNow(kind);
  res.json({ ok: true, kind, memory: store.state.memory });
});
app.post('/api/admin/clear-chat', admin, (req, res) => {
  store.state.chat = []; store.save();
  broadcast({ type: 'init', state: publicState(), viewers: wss.clients.size });
  res.json({ ok: true });
});

app.get('/healthz', (req, res) => res.json({ ok: true, turn: store.state.turn, status: finn.status }));

server.listen(config.port, () => {
  console.log(`[finn] Finn's world is live on http://localhost:${config.port} ${config.mock ? '(MOCK mode: no real Claude)' : ''}`);
  finn.start();
});

const shutdown = () => { try { store.save(); } catch {} process.exit(0); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
