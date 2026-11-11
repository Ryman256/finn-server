// Keeps visitors (and bots) from running up your bill or spamming Finn.

export class RateLimiter {
  constructor(cfg) {
    this.cfg = cfg;
    this.visitors = new Map(); // ip -> timestamps
    this.global = [];
    setInterval(() => this.cleanup(), 10 * 60_000).unref();
  }
  check(ip) {
    const now = Date.now();
    const list = (this.visitors.get(ip) || []).filter((t) => now - t < 24 * 3600_000);
    if (list.filter((t) => now - t < 10 * 60_000).length >= this.cfg.chatPerVisitorPer10Min) return 'Finn needs a breather. Try again in a few minutes.';
    if (list.length >= this.cfg.chatPerVisitorPerDay) return 'You have chatted a lot today. Finn will be happy to talk again tomorrow.';
    this.global = this.global.filter((t) => now - t < 3600_000);
    if (this.global.length >= this.cfg.chatGlobalPerHour) return 'Finn is very popular right now. Try again later.';
    return null;
  }
  hit(ip) {
    const now = Date.now();
    this.visitors.set(ip, [...(this.visitors.get(ip) || []), now]);
    this.global.push(now);
  }
  cleanup() {
    const now = Date.now();
    for (const [ip, list] of this.visitors) {
      const keep = list.filter((t) => now - t < 24 * 3600_000);
      if (keep.length) this.visitors.set(ip, keep); else this.visitors.delete(ip);
    }
  }
}

// Words to block outright. Add your own, one per entry, lower case.
const BLOCKLIST = [];

export function cleanVisitorText(t) {
  let s = String(t || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/https?:\/\/\S+|www\.\S+/gi, '[link]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 280);
  const lower = s.toLowerCase();
  if (BLOCKLIST.some((w) => lower.includes(w))) return '';
  return s;
}

export function cleanName(n) {
  const s = String(n || '').replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 20);
  return s || 'anon';
}
