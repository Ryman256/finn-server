// Finn's world: state, persistence, snapshots and the rules of the map.
import fs from 'node:fs';
import path from 'node:path';
import { normLife } from './life.js';

export const W = 32;
export const H = 20;
export const PALETTE = {
  '0': '#1a1c2c', '1': '#8b5e34', '2': '#b13e53', '3': '#ef7d57', '4': '#ffcd75', '5': '#a7f070',
  '6': '#38b764', '7': '#257179', '8': '#29366f', '9': '#3b5dc9', a: '#41a6f6', b: '#73eff7',
  c: '#f4f4f4', d: '#94b0c2', e: '#566c86', f: '#333c57',
};
export const PAL_DESC =
  '0 near-black, 1 brown, 2 red, 3 orange/tan, 4 yellow, 5 light green, 6 green, 7 teal, 8 navy, 9 blue, a light blue, b cyan, c white, d light grey, e grey, f dark grey, . transparent';

function grassPixels() {
  const r = [];
  for (let y = 0; y < 16; y++) {
    let s = '';
    for (let x = 0; x < 16; x++) {
      const h = (x * 7 + y * 13 + x * y) % 17;
      s += h === 0 ? '5' : h === 5 ? '7' : '6';
    }
    r.push(s);
  }
  return r;
}

export function newWorld() {
  const ground = Array(W * H).fill(null);
  const objects = Array(W * H).fill(null);
  for (let y = 6; y < 14; y++) for (let x = 11; x < 21; x++) ground[y * W + x] = 'grass';
  return {
    turn: 0,
    finn: { x: 15, y: 9, facing: 1, mood: 'curious', thought: 'Where am I? It smells of... nothing. I should fix that.', idea: '' },
    ground,
    objects,
    assets: {
      grass: { name: 'grass', layer: 'ground', walkable: true, description: 'Plain grass. The only thing that existed at the start.', pixels: grassPixels(), turn: 0 },
    },
    journal: [{ turn: 0, text: 'I woke up on a tiny patch of grass in an endless dark nothing. This is my world now. It needs work.', t: Date.now() }],
    bible: 'World name: not decided yet.\nStyle: 16x16 pixel art, bright and cheerful, seen from above.\nRegions: one small grass patch.\nAmbitions: none yet.',
    queue: ['a dirt path for walkies', 'something to sniff'],
    uses: {},
    chat: [],
    balls: [],        // tennis balls hidden by visitors: {id, x, y, by, t, giver}
    ballsFound: 0,
    ballDay: { date: '', givers: [] },
    box: { x: 12, y: 7 }, // Finn's ball box
  };
}

export function norm(s) {
  s.queue = Array.isArray(s.queue) ? s.queue : [];
  s.uses = s.uses || {};
  s.chat = Array.isArray(s.chat) ? s.chat : [];
  s.journal = Array.isArray(s.journal) ? s.journal : [];
  s.finn.facing = s.finn.facing || 1;
  s.balls = Array.isArray(s.balls) ? s.balls : [];
  s.ballsFound = s.ballsFound || 0;
  s.ballDay = s.ballDay || { date: '', givers: [] };
  if (!s.box) {
    // older worlds: put the box on the nearest free bit of ground
    outer: for (let r = 0; r < 12; r++)
      for (let y = Math.max(0, 9 - r); y <= Math.min(H - 1, 9 + r); y++)
        for (let x = Math.max(0, 15 - r); x <= Math.min(W - 1, 15 + r); x++) {
          const i = y * W + x;
          if (s.ground[i] && !s.objects[i] && !(x === s.finn.x && y === s.finn.y)) { s.box = { x, y }; break outer; }
        }
    if (!s.box) s.box = { x: 12, y: 7 };
  }
  return normLife(s);
}

export const idx = (x, y) => y * W + x;
export const inB = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
export const isBox = (S, x, y) => !!S.box && S.box.x === x && S.box.y === y;

export function walkable(S, x, y) {
  if (!inB(x, y) || isBox(S, x, y)) return false;
  const g = S.ground[idx(x, y)];
  if (!g) return false;
  const ga = S.assets[g];
  if (ga && ga.walkable === false) return false;
  const o = S.objects[idx(x, y)];
  if (o) {
    const oa = S.assets[o];
    if (!oa || oa.walkable !== true) return false;
  }
  return true;
}

// Breadth-first search to the target, or to the closest reachable tile if the target can't be reached.
export function findPath(S, tx, ty) {
  const start = idx(S.finn.x, S.finn.y);
  const prev = new Map([[start, -1]]);
  const q = [start];
  let best = start;
  let bd = Math.abs(S.finn.x - tx) + Math.abs(S.finn.y - ty);
  while (q.length) {
    const c = q.shift();
    const cx = c % W, cy = (c / W) | 0;
    const d = Math.abs(cx - tx) + Math.abs(cy - ty);
    if (d < bd) { bd = d; best = c; }
    if (d === 0) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (!walkable(S, nx, ny)) continue;
      const n = idx(nx, ny);
      if (prev.has(n)) continue;
      prev.set(n, c);
      q.push(n);
    }
  }
  const out = [];
  let c = best;
  while (c !== start && c !== -1) { out.unshift(c); c = prev.get(c); }
  return out;
}

export const cleanName = (n) => String(n || '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30);

export function cleanPixels(p, layer) {
  const px = [];
  for (let y = 0; y < 16; y++) {
    const row = String((p && p[y]) || '').toLowerCase();
    let s = '';
    for (let x = 0; x < 16; x++) {
      let ch = row[x] || '.';
      if (!PALETTE[ch] && ch !== '.') ch = '.';
      if (layer === 'ground' && ch === '.') ch = '6';
      s += ch;
    }
    px.push(s);
  }
  return px;
}

export function validAsset(S, a) {
  if (!a || typeof a !== 'object') return null;
  const name = cleanName(a.name);
  if (!name || S.assets[name] || !Array.isArray(a.pixels)) return null;
  const layer = a.layer === 'object' ? 'object' : 'ground';
  return {
    name,
    layer,
    walkable: layer === 'ground' ? a.walkable !== false : a.walkable === true,
    description: String(a.description || '').slice(0, 160),
    pixels: cleanPixels(a.pixels, layer),
    turn: S.turn + 1,
  };
}

export function symbols(S) {
  const pool = 'abcdehijklmnopqrstuvwxyzABCDEGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&+?!'; // '=' is the box, '*' a ball
  const m = { grass: 'g' };
  let k = 0;
  for (const n of Object.keys(S.assets)) {
    if (n === 'grass') continue;
    let s = pool[k++] || '?';
    if (s === 'g') s = pool[k++] || '?';
    m[n] = s;
  }
  return m;
}

export function mapText(S) {
  const sym = symbols(S);
  let out = '';
  for (let y = 0; y < H; y++) {
    let row = '';
    for (let x = 0; x < W; x++) {
      if (x === S.finn.x && y === S.finn.y) { row += 'F'; continue; }
      if (isBox(S, x, y)) { row += '='; continue; }
      if (S.balls.some((b) => b.x === x && b.y === y)) { row += '*'; continue; }
      const o = S.objects[idx(x, y)], g = S.ground[idx(x, y)];
      row += o ? sym[o] : g ? sym[g] : '.';
    }
    out += String(y).padStart(2, '0') + ' ' + row + '\n';
  }
  return { out, sym };
}

// ---------- Persistence ----------
export class WorldStore {
  constructor(dataDir, keepSnapshots = 72) {
    this.dir = dataDir;
    this.snapDir = path.join(dataDir, 'snapshots');
    this.file = path.join(dataDir, 'world.json');
    this.keep = keepSnapshots;
    fs.mkdirSync(this.snapDir, { recursive: true });
    this.state = this.load();
  }
  load() {
    try {
      return norm(JSON.parse(fs.readFileSync(this.file, 'utf8')));
    } catch {
      const s = norm(newWorld());
      this.writeAtomic(this.file, s);
      return s;
    }
  }
  writeAtomic(file, data) {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, file);
  }
  save() {
    this.writeAtomic(this.file, this.state);
  }
  snapshot() {
    const name = `turn-${String(this.state.turn).padStart(6, '0')}.json`;
    this.writeAtomic(path.join(this.snapDir, name), this.state);
    const all = this.listSnapshots();
    for (const old of all.slice(0, Math.max(0, all.length - this.keep))) fs.rmSync(path.join(this.snapDir, old), { force: true });
  }
  listSnapshots() {
    return fs.readdirSync(this.snapDir).filter((f) => f.endsWith('.json')).sort();
  }
  restore(name) {
    const all = this.listSnapshots();
    const pick = name ? all.find((f) => f === name || f === `${name}.json`) : all[all.length - 2] || all[all.length - 1];
    if (!pick) throw new Error('No snapshot found');
    this.state = norm(JSON.parse(fs.readFileSync(path.join(this.snapDir, pick), 'utf8')));
    this.save();
    return pick;
  }
}
