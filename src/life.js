// Finn's inner life: needs, goals, and what each activity does to him.

export const ACTIVITIES = {
  build: 'design new tiles and objects and build something (the only activity that changes the world)',
  explore: 'go on a walk around your world, look closely at what is there, and maybe name places',
  sniff: 'a slow sniffing tour of interesting spots; good for noticing details and getting ideas',
  play: 'play fetch with a tennis ball from your box (or chase your tail if the box is empty)',
  nap: 'curl up for a nap in a nice spot (restores energy)',
  reflect: 'sit and think about your life, your work and your plans; update your goals',
};

// How each activity changes his needs (0-100 scales)
const EFFECTS = {
  build: { energy: -20, curiosity: -15, happiness: 6 },
  explore: { energy: -10, curiosity: -25, happiness: 5 },
  sniff: { energy: -5, curiosity: -12, happiness: 6 },
  play: { energy: -12, happiness: 18, boredom: -25 },
  nap: { energy: 45, happiness: 2 },
  reflect: { curiosity: 5, happiness: 4 },
};

const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));

export function normLife(S) {
  S.needs ||= { energy: 80, happiness: 60, curiosity: 55, boredom: 15 };
  S.goals ||= { today: 'Make this empty void feel like home', week: '', masterpiece: '' };
  S.memory ||= { days: [], weeks: [], story: '', lastDailyT: Date.now(), lastWeeklyT: Date.now() };
  S.activities ||= [];
  S.finn.activity ||= 'idle';
  return S;
}

export function bump(S, key, by) {
  S.needs[key] = clamp((S.needs[key] || 0) + by);
}

/** Apply an activity's effects, plus the slow drift that happens every turn. */
export function applyActivity(S, kind) {
  const recent = S.activities.slice(-3).map((a) => a.kind);
  const repeats = recent.filter((k) => k === kind).length;
  bump(S, 'curiosity', 8); // curiosity always creeps up
  bump(S, 'happiness', -4); // and happiness slowly fades unless something nice happens
  bump(S, 'boredom', repeats >= 2 ? 20 : repeats === 1 ? 8 : -12);
  for (const [k, v] of Object.entries(EFFECTS[kind] || {})) bump(S, k, v);
  S.activities.push({ kind, t: Date.now(), turn: S.turn });
  if (S.activities.length > 100) S.activities = S.activities.slice(-100);
}

function label(key, v) {
  const L = {
    energy: [[20, 'exhausted'], [45, 'tired'], [75, 'fine'], [101, 'full of beans']],
    happiness: [[30, 'grumpy'], [60, 'content'], [85, 'happy'], [101, 'ecstatic']],
    curiosity: [[35, 'settled'], [70, 'curious'], [101, 'itching to try something new']],
    boredom: [[30, 'engaged'], [60, 'a bit samey'], [101, 'bored of repeating himself']],
  }[key];
  return L.find(([max]) => v < max)[1];
}

export function needsText(S) {
  return Object.entries(S.needs).map(([k, v]) => `${k} ${v}/100 (${label(k, v)})`).join(', ');
}

export function recentActivitiesText(S) {
  const a = S.activities.slice(-8).map((x) => x.kind);
  return a.length ? a.join(' → ') : '(nothing yet)';
}
