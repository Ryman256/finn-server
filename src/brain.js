// Talks to Claude, tracks spending, and enforces the daily budget.
import fs from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { mockReply } from './mock.js';

export class BudgetExceeded extends Error {}

export function parseJSON(t) {
  t = String(t || '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('Reply was not JSON');
  return JSON.parse(t.slice(a, b + 1));
}

export class Brain {
  constructor(config) {
    this.cfg = config;
    this.client = config.mock ? null : new Anthropic({ apiKey: config.apiKey });
    this.spendFile = path.join(config.dataDir, 'spend.json');
    this.spend = this.loadSpend();
  }

  today() {
    // Local date, so the budget resets at local midnight (set TZ in .env).
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  loadSpend() {
    try { return JSON.parse(fs.readFileSync(this.spendFile, 'utf8')); } catch { return { days: {} }; }
  }
  saveSpend() {
    try { fs.writeFileSync(this.spendFile, JSON.stringify(this.spend, null, 1)); } catch (e) { console.error('[finn] could not save spend', e.message); }
  }
  spentToday() {
    return this.spend.days[this.today()]?.usd || 0;
  }
  canSpend() {
    return this.spentToday() < this.cfg.dailyBudgetUsd;
  }
  record(kind, usage, priceIn, priceOut) {
    const day = this.today();
    const d = (this.spend.days[day] ||= { usd: 0, calls: 0, inputTokens: 0, outputTokens: 0 });
    const inT = usage?.input_tokens || 0, outT = usage?.output_tokens || 0;
    const cost = (inT * priceIn + outT * priceOut) / 1e6;
    d.usd = +(d.usd + cost).toFixed(5);
    d.calls++;
    d.inputTokens += inT;
    d.outputTokens += outT;
    // keep 90 days of history
    const keys = Object.keys(this.spend.days).sort();
    for (const k of keys.slice(0, Math.max(0, keys.length - 90))) delete this.spend.days[k];
    this.saveSpend();
    console.log(`[finn] ${kind}: ${inT} in / ${outT} out tokens, $${cost.toFixed(4)} (today $${d.usd.toFixed(3)})`);
  }

  /**
   * Ask Claude for a JSON answer.
   * kind: 'plan' | 'critique' | 'chat'  (chooses model and price)
   * content: string, or an array of Claude content blocks (text and images)
   */
  async json(kind, content, maxTokens = 8000) {
    if (!this.canSpend()) throw new BudgetExceeded('Daily budget reached');
    if (this.cfg.mock) return mockReply(kind, content);
    const isChat = kind === 'chat' || kind === 'reflect'; // diary and reflections use the cheaper model
    const model = isChat ? this.cfg.chatModel : this.cfg.planModel;
    const res = await this.client.messages.create({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content }],
    });
    this.record(kind, res.usage, isChat ? this.cfg.chatPriceIn : this.cfg.planPriceIn, isChat ? this.cfg.chatPriceOut : this.cfg.planPriceOut);
    const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    return parseJSON(text);
  }
}
