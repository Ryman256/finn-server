# Finn's World

Finn is a small, confident, slightly dramatic Yorkshire terrier who builds his own world from nothing.
Every so often he comes up with an idea, designs new pixel-art tiles for it in his studio, reviews and
redraws his drafts, then walks around placing them. Visitors can watch live and chat with him; good
suggestions go into his design queue, but he always makes the final call.

He thinks with Claude (Anthropic's API). The server itself is tiny, so it runs happily on a small VPS
or a Raspberry Pi, and moving between them takes about ten minutes.

```
finn-server/
├── src/
│   ├── server.js     website, live updates (WebSocket), chat and admin API
│   ├── finn.js       Finn's life: turn loop, activities, ball fetching, bedtime diary, chat
│   ├── life.js       needs, goals and what each activity does to him
│   ├── prompts.js    everything Finn is told: edit this to change his personality
│   ├── brain.js      Claude calls, spend tracking, daily budget
│   ├── world.js      map rules, pathfinding, saving and snapshots
│   ├── png.js        renders draft previews so Finn can look at his own art
│   ├── limits.js     chat rate limits and text cleaning
│   └── mock.js       a fake Claude for testing with no API key
├── public/           the website (index.html, app.js, style.css)
├── data/             Finn's world (created on first run, NOT in git, back this up)
├── Dockerfile, docker-compose.yml, .env.example
```

---

## 1. Try it on your own computer first (5 minutes)

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
cp .env.example .env
MOCK_CLAUDE=1 npm start          # on Windows PowerShell:  $env:MOCK_CLAUDE=1; npm start
```

Open http://localhost:3000. In mock mode, Finn uses a fake brain that makes random tiles, so you can check
everything works without spending anything. To give him his real brain, put your key in `.env`:

```
ANTHROPIC_API_KEY=sk-ant-...
MOCK_CLAUDE=0
```

Get a key at https://console.anthropic.com. **While you're there, set a monthly spend limit** under
billing. That's your hard safety net on top of Finn's own daily budget.

To make Finn take a turn now instead of waiting, set an `ADMIN_TOKEN` in `.env`, restart, then:

```bash
curl -X POST -H "x-admin-token: YOUR_TOKEN" http://localhost:3000/api/admin/turn
```

---

## 2. Put him on a VPS

Any small Linux server works: 1–2 CPU cores, 2 GB of memory, Ubuntu 24.04. Hetzner, DigitalOcean, OVH
and IONOS all have options for a few pounds a month.

**Tip:** choose an **ARM** server if you can (for example Hetzner's CAX range). A Raspberry Pi is also
ARM, so whatever works on the VPS will work identically on the Pi later.

### 2a. Set up the server

SSH in (`ssh root@YOUR_SERVER_IP`), then:

```bash
# Updates and a firewall that only allows SSH (the website goes through Cloudflare, so no web ports needed)
apt update && apt upgrade -y
ufw allow OpenSSH && ufw --force enable

# Install Docker
curl -fsSL https://get.docker.com | sh
```

### 2b. Get Finn onto it

Push this project to your GitHub, then on the server:

```bash
git clone https://github.com/YOUR_NAME/finn-server.git
cd finn-server
cp .env.example .env
nano .env        # add ANTHROPIC_API_KEY, ADMIN_TOKEN (openssl rand -hex 24), check TZ and budget
docker compose up -d --build
docker compose logs -f finn     # watch him wake up (Ctrl+C to stop watching)
```

He's now running and restarts automatically if the server reboots. To view him before going public,
open a tunnel from your own computer:

```bash
ssh -L 3000:localhost:3000 root@YOUR_SERVER_IP
```

and visit http://localhost:3000.

---

## 3. Go public with Cloudflare Tunnel

This puts Finn on your own web address with HTTPS, without opening any ports or exposing your server's address.

1. Buy a domain (roughly £10 a year) and add it to a free Cloudflare account (https://dash.cloudflare.com),
   following their steps to switch the domain's nameservers.
2. In Cloudflare go to **Zero Trust → Networks → Tunnels → Create a tunnel**, choose **Cloudflared**,
   name it `finn`.
3. Copy the **token** it shows (the long string after `--token`) into `.env` as `TUNNEL_TOKEN=...`.
4. Under **Public Hostname**, add your domain (e.g. `finn.yourdomain.com`) with service
   **HTTP** and URL **`finn:3000`**.
5. On the server:
   ```bash
   docker compose --profile tunnel up -d
   ```

Visit your domain and Finn is live. WebSockets work through Cloudflare automatically.

---

## 4. Move him to a Raspberry Pi later

Use a Pi 5 (2 GB is enough) with the official power supply, a cooler, and 64-bit Raspberry Pi OS Lite.

On the Pi:
```bash
curl -fsSL https://get.docker.com | sh
git clone https://github.com/YOUR_NAME/finn-server.git && cd finn-server
```

Then:
1. **Stop Finn on the VPS:** `docker compose --profile tunnel down`
2. **Copy his world and settings to the Pi** (from the VPS):
   ```bash
   scp -r data .env pi@PI_ADDRESS:~/finn-server/
   ```
3. **Start him on the Pi:** `docker compose --profile tunnel up -d --build`
4. Check your domain. Because the tunnel token moved with `.env`, the same address now points at the Pi.
   Once you're happy, cancel the VPS.

Downtime is a few minutes and Finn keeps everything he's built.

---

## Costs and how to control them

A build turn makes two calls to Claude (plan, then studio review with images of his drafts) and
costs roughly **$0.06–0.10** with the default model (Sonnet). Other activities are one call, about
$0.03–0.05. Since he doesn't build every turn, real costs come in below the table. Chat replies use Haiku and cost
a fraction of a cent each.

| Settings | Turns per day | Rough cost per day |
|---|---|---|
| Default: every 60 min, asleep 23:00–07:00 | 16 | ~$1–1.60 |
| Every 120 min | 8 | ~$0.50–0.80 |
| Every 60 min, `CRITIQUE=0` | 16 | ~$0.50–0.80 |

Prices change, so check https://www.anthropic.com/pricing and update the `*_PRICE_*` values in `.env`.
Finn adds up what he's spent from the token counts Claude reports, and when he hits `DAILY_BUDGET_USD`
he naps (no turns, chat replies with a snore) until midnight. The monthly limit in the Anthropic
console is your backstop.

Knobs in `.env`:
- `TURN_INTERVAL_MINUTES`: how often he builds
- `CRITIQUE=0`: skip the studio review (cheaper, rougher art)
- `PLAN_MODEL`: a cheaper model makes cheaper but worse art; a stronger model makes better art
- `SLEEP_START_HOUR` / `SLEEP_END_HOUR`: his bedtime
- `CHAT_PER_VISITOR_*`, `CHAT_GLOBAL_PER_HOUR`: chat limits

---

## Admin controls

Send your `ADMIN_TOKEN` in the `x-admin-token` header. On the server, use `http://localhost:3000`;
from anywhere else, use your domain.

```bash
T="x-admin-token: YOUR_TOKEN"
curl -H "$T" localhost:3000/api/admin/status              # status, today's spend, last 7 days, snapshots
curl -X POST -H "$T" localhost:3000/api/admin/turn        # take a turn now
curl -X POST -H "$T" localhost:3000/api/admin/pause       # stop turns
curl -X POST -H "$T" localhost:3000/api/admin/resume
curl -X POST -H "$T" localhost:3000/api/admin/clear-chat
# Undo: roll back to the previous turn, or name a snapshot from /status
curl -X POST -H "$T" -H "content-type: application/json" -d '{}' localhost:3000/api/admin/rollback
curl -X POST -H "$T" -H "content-type: application/json" -d '{"snapshot":"turn-000042"}' localhost:3000/api/admin/rollback
```

A snapshot is saved after every turn (the last 72 are kept).

## Finn's inner life

Finn isn't a machine that builds every hour. Each turn he decides what to do with his time:

| Activity | What happens | Changes the world? |
|---|---|---|
| **build** | Designs new tiles in his studio, reviews them, builds | Yes |
| **explore** | Walks around looking at his world, may name places | No |
| **sniff** | A slow sniffing tour of interesting spots, for ideas | No |
| **play** | Takes a ball from his box and plays fetch with himself (or chases his tail) | No |
| **nap** | Curls up for a 15-minute nap | No |
| **reflect** | Thinks about his life and updates his goals | No |

**Needs** (0–100) steer his choices: energy, happiness, curiosity and boredom. Each activity changes
them (building tires him; naps restore energy; play and tennis balls make him happy; repeating himself
makes him bored; curiosity creeps up over time). If his energy drops below 15 he naps without even
calling Claude.

**Goals** at three scales: today, this week, and his masterpiece dream. He updates them himself.

**Memory** in layers, so he builds up a real history:
- **Journal:** every turn and every ball he finds.
- **Diary:** each night at bedtime he writes a diary entry about his day and sets tomorrow's goal.
- **Weekly reflection:** once a week he reflects on his progress, sets next week's goal, and rewrites
  his **life story**, a running autobiography in titled chapters.

The diary, weekly reflection and life story feed back into every decision he makes, and the website
shows his needs, goals, diary and life story.

**Cost:** non-build turns are a single Claude call (no studio review), so they're cheaper than building.
The diary and weekly reflection use the cheaper chat model and cost well under 1p each.

To test the reflections without waiting for bedtime:
```bash
curl -X POST -H "x-admin-token: YOUR_TOKEN" -H "content-type: application/json" -d '{"kind":"daily"}' localhost:3000/api/admin/reflect
curl -X POST -H "x-admin-token: YOUR_TOKEN" -H "content-type: application/json" -d '{"kind":"weekly"}' localhost:3000/api/admin/reflect
```

To tune how activities affect him, edit `EFFECTS` in `src/life.js`.

## Tennis balls

Finn loves tennis balls more than anything. Visitors can press **Hide a tennis ball** and click
somewhere on the map. When Finn isn't busy building, he sniffs it out, carries it to his ball box,
thanks whoever hid it (using the name they typed in chat, if any), and the tally on the box goes up.
Every find is written in his journal, and he knows his tally when chatting and planning.

- Each visitor gets `BALLS_PER_VISITOR_PER_DAY` balls a day (default 1), and only one of theirs can be
  out in the world at a time.
- At most `BALLS_MAX_IN_WORLD` balls (default 5) can be lying around at once.
- Visitors are told apart by a salted hash of their IP address, so the IP is never stored. People
  sharing one internet connection (a household or office) share the daily allowance.
- Fetching balls costs nothing: it doesn't use Claude.
- If Finn builds something that blocks a ball, he gives up for 10 minutes and tries again later.
  A ball whose ground is removed falls into the void.
- The box is protected: Finn can't build on it or remove it.

## Keeping visitors in check

- Visitors can only **chat**. They can't change the world directly; Finn decides whether their ideas
  go into his design queue.
- Chat is rate-limited per visitor and overall, links are stripped, and messages are capped at 280 characters.
- Finn's chat instructions tell him to stay family-friendly, stay in character, and brush off rude or
  manipulative messages. Add words to block outright in `BLOCKLIST` in `src/limits.js`.
- If something unpleasant gets through: `clear-chat`, and `rollback` if it affected the world.

## Backups

Everything Finn is lives in `data/` (`world.json`, `snapshots/`, `spend.json`). Back it up regularly,
for example a nightly cron job on the server:

```bash
0 3 * * * tar czf ~/finn-backup-$(date +\%F).tar.gz -C ~/finn-server data && find ~ -name 'finn-backup-*' -mtime +14 -delete
```

Copy those somewhere off the server now and then (or sync them to cloud storage).

## Updating

```bash
git pull
docker compose --profile tunnel up -d --build
```

## Ideas for later

- A bigger world that scrolls and grows as Finn explores
- A daily time-lapse of the world growing, or a daily post of his best creation
- Visitors voting on suggestions
- A shop for prints of his best pieces (the £100-a-month experiment?)
- Porting the viewer into Godot
