// A pretend Claude for testing your setup without an API key (MOCK_CLAUDE=1).
// It makes simple random tiles so you can check everything works end to end.
import { cleanName } from './world.js';

const rnd = (n) => Math.floor(Math.random() * n);
const pick = (a) => a[rnd(a.length)];
const COLS = '123456789abcdef';
const IDEAS = ['a mossy clearing', 'a pebble beach', 'a sniffing garden', 'a squirrel lookout', 'a sunbeam nap spot', 'a puddle park'];

function groundTile() {
  const base = pick(COLS), spot = pick(COLS);
  return Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => ((x * 5 + y * 3) % 7 === 0 ? spot : base)).join(''));
}
function objectTile() {
  const c = pick(COLS);
  return Array.from({ length: 16 }, (_, y) =>
    Array.from({ length: 16 }, (_, x) => {
      const d = Math.hypot(x - 7.5, y - 7.5);
      return d < 4.5 ? c : d < 5.5 ? '0' : '.';
    }).join('')
  );
}

export function mockReply(kind, content) {
  const text = typeof content === 'string' ? content : content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  if (kind === 'chat') {
    return { reply: pick(['*wags tail* Interesting idea. I shall consider it.', 'Art cannot be rushed. But yes, maybe.', 'Did someone say treats?']), add_to_design_queue: [] };
  }
  if (kind === 'reflect') {
    if (text.includes('A week has passed'))
      return { reflection: 'Mock week: I built things and fetched balls. Very proud.', story: 'Chapter 1: Waking up in the void. I made some mock tiles.\nChapter 2: The Mock Era. Still going.', week: 'build a mock beach', masterpiece: 'a giant tennis ball statue' };
    return { diary: 'Mock diary: a busy day of being brilliant. Found time for a nap.', tomorrow: 'try something new', mood: 'sleepy' };
  }
  if (kind === 'critique') {
    const names = [...text.matchAll(/^([a-z0-9_]+) \(layer=/gm)].map((m) => m[1]);
    return { assets: names.map((n) => ({ name: n, notes: 'Mock review: looks fine to me.', pixels: null })) };
  }
  // plan: find the edge of the land from the map text and extend it
  const rows = [...text.matchAll(/^(\d\d) (.{32})$/gm)].map((m) => m[2]);
  const land = [];
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.') land.push([x, y]); }));
  const [lx, ly] = pick(land.length ? land : [[15, 9]]);
  const dir = pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
  const x1 = Math.max(0, Math.min(31, lx + dir[0] * 2)), y1 = Math.max(0, Math.min(19, ly + dir[1] * 2));
  const x2 = Math.max(0, Math.min(31, x1 + dir[0] * 3 + (dir[0] ? 0 : 2))), y2 = Math.max(0, Math.min(19, y1 + dir[1] * 3 + (dir[1] ? 0 : 2)));
  const id = Date.now().toString(36).slice(-4);
  const g = cleanName('mock_ground_' + id), o = cleanName('mock_thing_' + id);
  const idea = pick(IDEAS);
  const activity = pick(['build', 'build', 'explore', 'sniff', 'play', 'nap', 'reflect']);
  if (activity !== 'build') {
    return {
      activity, mood: 'mock', thought: `Mock ${activity} time.`, idea: `Going to ${activity} for a bit.`, new_assets: [],
      actions: [{ do: 'say', text: `Time to ${activity}!` }], journal: `I decided to ${activity} (mock mode).`,
      goals: activity === 'reflect' ? { today: 'mock goal: be brilliant' } : undefined, bible: null,
    };
  }
  return {
    activity: 'build',
    mood: pick(['inspired', 'sleepy', 'zoomies', 'proud']),
    thought: 'This is a mock turn, but I am still very talented.',
    idea: `Building ${idea}.`,
    new_assets: [
      { name: g, layer: 'ground', walkable: true, description: `Mock ground for ${idea}`, pixels: groundTile() },
      { name: o, layer: 'object', walkable: false, description: 'A mock object', pixels: objectTile() },
    ],
    actions: [
      { do: 'say', text: 'Watch this.' },
      { do: 'fill', asset: g, x1, y1, x2, y2 },
      { do: 'place', asset: o, x: x2, y: y2 },
    ],
    journal: `Made ${idea} (mock mode, no real Claude involved).`,
    design_queue: ['real art, once my human adds an API key'],
    bible: null,
  };
}
