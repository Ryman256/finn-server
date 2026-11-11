import 'dotenv/config';
import path from 'node:path';

const num = (v, d) => (v === undefined || v === '' || isNaN(Number(v)) ? d : Number(v));
const bool = (v, d) => (v === undefined || v === '' ? d : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase()));

export const config = {
  port: num(process.env.PORT, 3000),
  dataDir: path.resolve(process.env.DATA_DIR || './data'),
  apiKey: process.env.ANTHROPIC_API_KEY || '',
  mock: bool(process.env.MOCK_CLAUDE, false),

  // Models and their prices in USD per million tokens. Check current prices at
  // https://www.anthropic.com/pricing (or the Claude docs) and update if they change.
  planModel: process.env.PLAN_MODEL || 'claude-sonnet-5-5',
  planPriceIn: num(process.env.PLAN_PRICE_IN, 2.0),
  planPriceOut: num(process.env.PLAN_PRICE_OUT, 10.0),
  chatModel: process.env.CHAT_MODEL || 'claude-haiku-5-5',
  chatPriceIn: num(process.env.CHAT_PRICE_IN, 0.1),
  chatPriceOut: num(process.env.CHAT_PRICE_OUT, 0.5),

  // Finn's routine
  turnIntervalMinutes: num(process.env.TURN_INTERVAL_MINUTES, 60),
  critique: bool(process.env.CRITIQUE, true),
  sleepStartHour: num(process.env.SLEEP_START_HOUR, 23), // local time (set TZ)
  sleepEndHour: num(process.env.SLEEP_END_HOUR, 7),
  startPaused: bool(process.env.START_PAUSED, false),

  // Spending and abuse limits
  dailyBudgetUsd: num(process.env.DAILY_BUDGET_USD, 1.5),
  chatPerVisitorPer10Min: num(process.env.CHAT_PER_VISITOR_PER_10_MIN, 5),
  chatPerVisitorPerDay: num(process.env.CHAT_PER_VISITOR_PER_DAY, 30),
  chatGlobalPerHour: num(process.env.CHAT_GLOBAL_PER_HOUR, 120),

  // Tennis balls visitors can hide for Finn
  ballsMaxInWorld: num(process.env.BALLS_MAX_IN_WORLD, 5),
  ballsPerVisitorPerDay: num(process.env.BALLS_PER_VISITOR_PER_DAY, 1),

  adminToken: process.env.ADMIN_TOKEN || '',
  keepSnapshots: num(process.env.KEEP_SNAPSHOTS, 72),
};

if (!config.mock && !config.apiKey) {
  console.warn('[finn] No ANTHROPIC_API_KEY set. Set it in .env, or run with MOCK_CLAUDE=1 to test without Claude.');
}
