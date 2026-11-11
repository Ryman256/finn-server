// Finn's life: his turn loop (plan -> studio -> build), idle wandering, and chatting.
import { W, H, idx, inB, isBox, walkable, findPath, cleanName, cleanPixels, validAsset } from './world.js';
import { planPrompt, critiquePrompt, chatPrompt, dailyPrompt, weeklyPrompt } from './prompts.js';
import { ACTIVITIES, applyActivity, bump } from './life.js';
import { previewPNG } from './png.js';
import { BudgetExceeded } from './brain.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (v, lo, hi) => { v = Math.round(Number(v)); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : null; };

export class Finn {
  constructor({ store, brain, config, broadcast }) {
    this.store = store;
    this.brain = brain;
    this.cfg = config;
    this.broadcast = broadcast;
    this.busy = false;
    this.paused = config.startPaused;
    this.status = 'idle';
    this.nextTurnAt = null;
    this.timer = null;
    this.carrying = false;
    this.restingUntil = 0;
  }
  get S() { return this.store.state; }

  // ---------- schedule ----------
  start() {
    this.schedule(15_000);
    setInterval(() => this.wander(), 2500);
  }
  schedule(ms = this.cfg.turnIntervalMinutes * 60_000) {
    clearTimeout(this.timer);
    this.nextTurnAt = Date.now() + ms;
    this.timer = setTimeout(() => this.tick(), ms);
    this.pushStatus();
  }
  isSleepTime() {
    const h = new Date().getHours(), s = this.cfg.sleepStartHour, e = this.cfg.sleepEndHour;
    if (s === e) return false;
    return s < e ? h >= s && h < e : h >= s || h < e;
  }
  async tick() {
    if (this.paused) { this.setStatus('paused'); return this.schedule(); }
    if (this.busy) return this.schedule(20_000); // fetching a ball or mid-activity; try again shortly
    if (this.isSleepTime()) {
      this.setStatus('asleep');
      await this.bedtime();
      return this.schedule(10 * 60_000);
    }
    // never-sleeping setups still get a diary once a day
    if (Date.now() - this.S.memory.lastDailyT > 24 * 3600_000) await this.bedtime();
    if (!this.brain.canSpend()) { this.setStatus('napping'); return this.schedule(30 * 60_000); }
    await this.turn();
    this.schedule();
  }
  setStatus(s) { this.status = s; this.pushStatus(); }
  pushStatus() {
    this.broadcast({ type: 'status', status: this.status, paused: this.paused, nextTurnAt: this.nextTurnAt, turn: this.S.turn });
  }

  // ---------- one creative turn ----------
  async turn() {
    if (this.busy) return;
    this.busy = true;
    const S = this.S;
    try {
      // Too exhausted to think: he just naps (no Claude call, no cost)
      if (S.needs.energy < 15) {
        await this.runActivity('nap', { actions: [], journal: 'Too tired to do anything clever. Nap time.' }, []);
        return;
      }
      this.setStatus('thinking');
      const plan = await this.brain.json('plan', planPrompt(S));
      const activity = ACTIVITIES[plan.activity] ? plan.activity : 'build';
      S.finn.mood = String(plan.mood || S.finn.mood).slice(0, 20);
      S.finn.thought = String(plan.thought || '').slice(0, 200);
      S.finn.idea = String(plan.idea || '').slice(0, 240);
      S.finn.activity = activity;
      this.broadcast({ type: 'finnInfo', mood: S.finn.mood, thought: S.finn.thought, idea: S.finn.idea });
      if (plan.goals && typeof plan.goals === 'object') {
        for (const k of ['today', 'week', 'masterpiece']) if (typeof plan.goals[k] === 'string' && plan.goals[k].trim()) S.goals[k] = plan.goals[k].slice(0, 160);
      }
      if (Array.isArray(plan.design_queue)) S.queue = plan.design_queue.slice(0, 6).map((q) => String(q).slice(0, 80));
      if (typeof plan.bible === 'string' && plan.bible.trim()) S.bible = plan.bible.slice(0, 1500);
      if (activity !== 'build') {
        await this.runActivity(activity, plan, []);
        return;
      }

      const drafts = [];
      for (const a of (Array.isArray(plan.new_assets) ? plan.new_assets : []).slice(0, 3)) {
        const v = validAsset(S, a);
        if (v && !drafts.some((d) => d.name === v.name)) drafts.push(v);
      }

      this.setStatus('designing');
      await this.studio(drafts, plan.idea);
      for (const d of drafts) {
        const asset = { name: d.name, layer: d.layer, walkable: d.walkable, description: d.description, pixels: d.pixels, turn: d.turn };
        S.assets[d.name] = asset;
        this.broadcast({ type: 'asset', asset });
      }

      await this.runActivity('build', plan, drafts);
    } catch (e) {
      if (e instanceof BudgetExceeded) this.setStatus('napping');
      else { console.error('[finn] turn failed:', e.message); this.setStatus('idle'); }
      this.store.save();
    } finally {
      this.busy = false;
    }
  }

  /** Carry out an activity, update his needs, write the journal and save. */
  async runActivity(kind, plan, drafts) {
    const S = this.S;
    S.finn.activity = kind;
    this.pushLife();
    const acts = (Array.isArray(plan.actions) ? plan.actions : []).slice(0, 18);
    const safe = acts.filter((a) => a && (a.do === 'walk' || a.do === 'say'));
    if (kind === 'build') {
      this.setStatus('building');
      for (const a of acts) await this.doAction(a);
      if (drafts.length) bump(S, 'happiness', 4);
    } else if (kind === 'explore' || kind === 'sniff') {
      this.setStatus(kind === 'explore' ? 'exploring' : 'sniffing');
      for (const a of safe) await this.doAction(a);
      if (!safe.some((a) => a.do === 'walk')) await this.randomWalk(kind === 'explore' ? 4 : 3);
    } else if (kind === 'play') {
      this.setStatus('playing');
      for (const a of safe) await this.doAction(a);
      await this.playFetch();
    } else if (kind === 'nap') {
      this.setStatus('resting');
      for (const a of safe) await this.doAction(a);
      this.say('*curls up* zzz...');
      this.restingUntil = Date.now() + 15 * 60_000;
    } else if (kind === 'reflect') {
      this.setStatus('reflecting');
      for (const a of safe) await this.doAction(a);
      this.say('*stares thoughtfully into the distance*');
      await sleep(1500);
    }
    applyActivity(S, kind);
    S.turn++;
    const made = drafts.map((d) => d.name + (d.revised ? ' (redrawn)' : ''));
    const entry = { turn: S.turn, kind, text: String(plan.journal || '...').slice(0, 400) + (made.length ? ` (Invented: ${made.join(', ')}.)` : ''), t: Date.now() };
    S.journal.push(entry);
    if (S.journal.length > 500) S.journal = S.journal.slice(-500);
    this.store.save();
    this.store.snapshot();
    this.broadcast({ type: 'journal', entry, queue: S.queue, bible: S.bible, turn: S.turn });
    this.pushLife();
    this.setStatus(kind === 'nap' ? 'resting' : 'idle');
  }

  pushLife() {
    const S = this.S;
    this.broadcast({ type: 'life', needs: S.needs, goals: S.goals, activity: S.finn.activity });
  }
  pushMemory() {
    const m = this.S.memory;
    this.broadcast({ type: 'memory', days: m.days.slice(-14), weeks: m.weeks.slice(-4), story: m.story });
  }

  async randomWalk(stops) {
    const S = this.S;
    for (let i = 0; i < stops; i++) {
      const spots = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (walkable(S, x, y) && Math.abs(x - S.finn.x) + Math.abs(y - S.finn.y) <= 8) spots.push([x, y]);
      if (!spots.length) return;
      const [x, y] = spots[Math.floor(Math.random() * spots.length)];
      await this.walkTo(x, y);
      this.say(['*sniff*', '*sniff sniff*', 'Hmm.', 'Interesting...', '*tail wag*'][Math.floor(Math.random() * 5)]);
      await sleep(1200);
    }
  }

  /** Throws a ball from his box and fetches it (reuses the ball-hunting code). */
  async playFetch() {
    const S = this.S;
    if (!S.ballsFound) {
      this.say('No balls in the box... I shall chase my tail instead!');
      for (let i = 0; i < 6; i++) { this.moveTo(S.finn.x, S.finn.y, i % 2 ? 1 : -1); await sleep(300); }
      return;
    }
    await this.walkTo(S.box.x, S.box.y);
    S.ballsFound--;
    this.setCarrying(true);
    this.pushBalls();
    this.say('One ball, please. For practice.');
    await sleep(1000);
    const spots = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const d = Math.abs(x - S.finn.x) + Math.abs(y - S.finn.y);
      if (walkable(S, x, y) && d >= 3 && d <= 7 && !S.balls.some((b) => b.x === x && b.y === y)) spots.push([x, y]);
    }
    this.setCarrying(false);
    if (!spots.length) { S.ballsFound++; this.pushBalls(); return; }
    const [x, y] = spots[Math.floor(Math.random() * spots.length)];
    S.balls.push({ id: 'finn' + Date.now().toString(36), x, y, by: 'Finn', t: 0, giver: 'finn' });
    this.pushBalls();
    this.say('*flings ball* ...FETCH!');
    await sleep(800);
    this.busy = false; // huntBall manages busy itself
    await this.huntBall({ selfThrown: true });
    this.busy = true;
  }

  /** Bedtime: write the diary (and the weekly reflection when a week has passed). Cheap model. */
  async bedtime(forceWeekly = false) {
    const S = this.S, m = S.memory;
    const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    if (Date.now() - m.lastDailyT < 6 * 3600_000) return; // already wrote today's entry
    if (!this.brain.canSpend()) return;
    this.busy = true;
    try {
      const entries = S.journal.filter((j) => (j.t || 0) > m.lastDailyT);
      const r = await this.brain.json('reflect', dailyPrompt(S, entries), 800);
      m.days.push({ date: today, text: String(r.diary || '').slice(0, 900), t: Date.now() });
      if (m.days.length > 60) m.days = m.days.slice(-60);
      if (r.tomorrow) S.goals.today = String(r.tomorrow).slice(0, 160);
      if (r.mood) S.finn.mood = String(r.mood).slice(0, 20);
      m.lastDailyT = Date.now();
      bump(S, 'energy', 100); // a good night's sleep
      bump(S, 'boredom', -20);
      if (forceWeekly || (Date.now() - m.lastWeeklyT > 6.5 * 24 * 3600_000 && m.days.length >= 3)) {
        const w = await this.brain.json('reflect', weeklyPrompt(S), 2000);
        m.weeks.push({ date: today, text: String(w.reflection || '').slice(0, 900), t: Date.now() });
        if (m.weeks.length > 52) m.weeks = m.weeks.slice(-52);
        if (w.story) m.story = String(w.story).slice(0, 1800);
        if (w.week) S.goals.week = String(w.week).slice(0, 160);
        if (w.masterpiece) S.goals.masterpiece = String(w.masterpiece).slice(0, 160);
        m.lastWeeklyT = Date.now();
      }
      this.store.save();
      this.pushMemory();
      this.pushLife();
    } catch (e) {
      if (!(e instanceof BudgetExceeded)) console.error('[finn] bedtime reflection failed:', e.message);
    } finally {
      this.busy = false;
    }
  }

  /** For testing and admin: force a diary or weekly reflection now. */
  async reflectNow(kind) {
    const m = this.S.memory;
    m.lastDailyT = Math.min(m.lastDailyT, Date.now() - 7 * 3600_000);
    await this.bedtime(kind === 'weekly');
  }

  async studio(drafts, idea) {
    const showMs = 16 * 45 + 900; // matches the drawing animation on the website
    for (const d of drafts) {
      this.studioEvent({ label: 'Sketching: ' + d.name.replace(/_/g, ' '), note: d.description, asset: d });
      await sleep(showMs);
    }
    if (!this.cfg.critique || !drafts.length) return;
    this.broadcast({ type: 'studio', label: 'Squinting at his drafts...', note: '' });
    const grass = this.S.assets.grass?.pixels || [];
    const content = [
      ...drafts.map((d) => ({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: previewPNG(d, grass) } })),
      { type: 'text', text: critiquePrompt(drafts, idea, true) },
    ];
    let res;
    try { res = await this.brain.json('critique', content); } catch (e) { if (e instanceof BudgetExceeded) throw e; console.error('[finn] critique failed:', e.message); return; }
    for (const r of Array.isArray(res?.assets) ? res.assets : []) {
      const d = drafts.find((x) => x.name === cleanName(r.name));
      if (!d) continue;
      d.notes = String(r.notes || '').slice(0, 200);
      if (Array.isArray(r.pixels) && r.pixels.length >= 8) { d.pixels = cleanPixels(r.pixels, d.layer); d.revised = true; }
      this.studioEvent({ label: (d.revised ? 'Redrawn: ' : 'Approved: ') + d.name.replace(/_/g, ' '), note: d.notes, asset: d });
      await sleep(showMs);
    }
  }

  studioEvent(ev) {
    const { name, layer, pixels, description } = ev.asset;
    this.lastStudio = { label: ev.label, note: ev.note, asset: { name, layer, pixels, description } };
    this.broadcast({ type: 'studio', ...this.lastStudio });
  }

  // ---------- acting in the world ----------
  moveTo(x, y, facing) {
    const f = this.S.finn;
    if (facing) f.facing = facing; else if (x !== f.x) f.facing = x > f.x ? 1 : -1;
    f.x = x; f.y = y;
    this.broadcast({ type: 'finn', x, y, facing: f.facing });
  }
  async walkTo(x, y) {
    for (const c of findPath(this.S, x, y).slice(0, 60)) { this.moveTo(c % W, (c / W) | 0); await sleep(140); }
  }
  async stepOff(x, y, name) {
    const a = this.S.assets[name], f = this.S.finn;
    if (!a || a.walkable || f.x !== x || f.y !== y) return;
    for (const [dx, dy] of [[0, 1], [-1, 0], [1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      if (walkable(this.S, x + dx, y + dy)) { this.moveTo(x + dx, y + dy); await sleep(140); return; }
    }
  }
  setTile(layer, x, y, name) {
    const i = idx(x, y);
    if (layer === 'ground') this.S.ground[i] = name; else this.S.objects[i] = name;
    this.broadcast({ type: 'tile', layer, x, y, name });
    if (layer === 'ground' && !name) this.dropBallsAt(x, y); // balls fall into the void
  }
  placeAt(name, x, y) {
    const S = this.S, a = S.assets[name];
    if (!a) return;
    if (isBox(S, x, y) && a.layer === 'object') return;
    if (a.layer === 'ground') this.setTile('ground', x, y, name);
    else {
      if (!S.ground[idx(x, y)]) return;
      if (x === S.finn.x && y === S.finn.y && !a.walkable) return;
      this.setTile('object', x, y, name);
    }
    S.uses[name] = (S.uses[name] || 0) + 1;
  }
  say(text) { this.broadcast({ type: 'say', text: String(text).slice(0, 90) }); }

  async doAction(a) {
    if (!a || typeof a !== 'object') return;
    const S = this.S;
    const x = num(a.x, 0, W - 1), y = num(a.y, 0, H - 1);
    switch (a.do) {
      case 'walk': if (x !== null && y !== null) await this.walkTo(x, y); break;
      case 'say': this.say(a.text || ''); await sleep(1500); break;
      case 'place': {
        if (x === null || y === null) break;
        const n = cleanName(a.asset);
        await this.walkTo(x, y); await this.stepOff(x, y, n);
        this.placeAt(n, x, y); await sleep(200); break;
      }
      case 'fill': {
        const x1 = num(a.x1, 0, W - 1), y1 = num(a.y1, 0, H - 1), x2 = num(a.x2, 0, W - 1), y2 = num(a.y2, 0, H - 1);
        if ([x1, y1, x2, y2].includes(null)) break;
        const lx = Math.min(x1, x2), hx = Math.max(x1, x2), ly = Math.min(y1, y2), hy = Math.max(y1, y2);
        if ((hx - lx + 1) * (hy - ly + 1) > 120) break;
        const n = cleanName(a.asset), fa = S.assets[n];
        await this.walkTo((lx + hx) >> 1, (ly + hy) >> 1);
        if (fa && !fa.walkable && S.finn.x >= lx && S.finn.x <= hx && S.finn.y >= ly && S.finn.y <= hy) await this.walkTo(lx - 1, ly - 1);
        for (let yy = ly; yy <= hy; yy++) for (let xx = lx; xx <= hx; xx++) {
          if (fa && !fa.walkable && xx === S.finn.x && yy === S.finn.y) continue;
          this.placeAt(n, xx, yy); await sleep(30);
        }
        break;
      }
      case 'remove': {
        if (x === null || y === null || isBox(S, x, y)) break;
        await this.walkTo(x, y);
        const i = idx(x, y);
        if (S.objects[i]) this.setTile('object', x, y, null);
        else if (!(x === S.finn.x && y === S.finn.y)) this.setTile('ground', x, y, null);
        await sleep(200); break;
      }
    }
  }

  // ---------- tennis balls ----------
  publicBalls() { return this.S.balls.map(({ id, x, y, by }) => ({ id, x, y, by })); }
  pushBalls() { this.broadcast({ type: 'balls', balls: this.publicBalls(), found: this.S.ballsFound, box: this.S.box }); }
  dropBallsAt(x, y) {
    const before = this.S.balls.length;
    this.S.balls = this.S.balls.filter((b) => !(b.x === x && b.y === y));
    if (this.S.balls.length !== before) this.pushBalls();
  }
  /** A visitor hides a ball. Returns an error message, or null if it worked. */
  hideBall(x, y, by, giver) {
    const S = this.S;
    const today = new Date().toISOString().slice(0, 10);
    if (S.ballDay.date !== today) S.ballDay = { date: today, givers: [] };
    if (!inB(x, y) || !S.ground[idx(x, y)]) return 'Balls need solid ground, not the void!';
    if (isBox(S, x, y) || S.balls.some((b) => b.x === x && b.y === y) || (S.finn.x === x && S.finn.y === y)) return 'Pick a different spot.';
    if (S.balls.some((b) => b.giver === giver)) return 'Your ball is still out there. Let Finn find it first!';
    if (S.ballDay.givers.filter((g) => g === giver).length >= this.cfg.ballsPerVisitorPerDay) return 'You have already given Finn a ball today. Come back tomorrow!';
    if (S.balls.length >= this.cfg.ballsMaxInWorld) return 'There are already plenty of balls out there. Let Finn catch up!';
    S.balls.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), x, y, by, t: Date.now(), giver });
    S.ballDay.givers.push(giver);
    this.store.save();
    this.pushBalls();
    return null;
  }
  setCarrying(on) { this.carrying = on; this.broadcast({ type: 'carrying', on }); }
  async huntBall({ selfThrown = false } = {}) {
    const S = this.S, now = Date.now();
    const ready = S.balls.filter((b) => (selfThrown ? b.giver === 'finn' : now - b.t > 5000) && (b.giveUpUntil || 0) < now);
    if (!ready.length) return;
    this.busy = true;
    try {
      const dist = (b) => Math.abs(b.x - S.finn.x) + Math.abs(b.y - S.finn.y);
      const b = ready.reduce((a, c) => (dist(c) < dist(a) ? c : a));
      if (!selfThrown) { this.say('*sniff sniff* ...is that... a BALL?!'); await sleep(1200); }
      await this.walkTo(b.x, b.y);
      if (dist(b) > 1) { b.giveUpUntil = Date.now() + 10 * 60_000; this.say('I can smell it but I cannot reach it. Rude.'); return; }
      S.balls = S.balls.filter((x) => x !== b);
      this.pushBalls();
      this.setCarrying(true);
      this.say(b.giver === 'finn' ? 'Got it! I am excellent at fetch.' : b.by && b.by !== 'anon' ? `MINE! Thank you, ${b.by}!` : 'MINE! Thank you, mysterious stranger!'); await sleep(1500);
      await this.walkTo(S.box.x, S.box.y);
      this.setCarrying(false);
      S.ballsFound++;
      if (b.giver === 'finn') { this.say('Back in the box. Again! Again!'); this.store.save(); this.pushBalls(); return; }
      bump(S, 'happiness', 15);
      this.pushLife();
      this.say(S.ballsFound === 1 ? 'My very first ball in the box!' : `That is ${S.ballsFound} in the box!`);
      const entry = { turn: S.turn, text: `Found a tennis ball${b.by && b.by !== 'anon' ? ` from ${b.by}` : ''} and put it in my box. That makes ${S.ballsFound}. Best day ever.`, t: Date.now() };
      S.journal.push(entry);
      this.store.save();
      this.pushBalls();
      this.broadcast({ type: 'journal', entry, queue: S.queue, bible: S.bible, turn: S.turn });
    } finally {
      this.busy = false;
      this.setCarrying(false);
    }
  }

  wander() {
    if (this.busy || Date.now() < this.restingUntil) return;
    if (this.S.balls.length && !this.paused && !this.isSleepTime()) { this.huntBall(); return; }
    if (Math.random() < 0.5) return;
    const S = this.S, [dx, dy] = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(Math.random() * 4)];
    if (walkable(S, S.finn.x + dx, S.finn.y + dy)) this.moveTo(S.finn.x + dx, S.finn.y + dy, dx || S.finn.facing);
  }

  // ---------- chat ----------
  async chat(name, text) {
    const S = this.S;
    const msg = { who: 'visitor', name, text, t: Date.now() };
    bump(S, 'happiness', 2);
    S.chat.push(msg);
    this.broadcast({ type: 'chat', msg });
    let reply;
    try {
      const r = await this.brain.json('chat', chatPrompt(S), 600);
      reply = String(r.reply || '*wags tail*').slice(0, 500);
      if (Array.isArray(r.add_to_design_queue)) {
        for (const q of r.add_to_design_queue.slice(0, 1)) {
          const s = String(q).slice(0, 80).trim();
          if (s && !S.queue.includes(s)) S.queue.unshift(s);
        }
        S.queue = S.queue.slice(0, 8);
      }
    } catch (e) {
      reply = e instanceof BudgetExceeded ? '*snores* Finn is napping. He has used up today\'s thinking. Come back tomorrow!' : '*sneezes* Something went wrong. Try again in a moment?';
      if (!(e instanceof BudgetExceeded)) console.error('[finn] chat failed:', e.message);
    }
    const out = { who: 'finn', text: reply, t: Date.now() };
    S.chat.push(out);
    if (S.chat.length > 300) S.chat = S.chat.slice(-300);
    this.broadcast({ type: 'chat', msg: out, queue: S.queue });
    this.say(reply.length > 70 ? reply.slice(0, 67) + '...' : reply);
    this.store.save();
    return out;
  }
}
