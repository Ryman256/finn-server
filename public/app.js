// Finn's World viewer: draws the world and listens for live updates from the server.
(function () {
  const W = 32, H = 20, T = 32;
  const PALETTE = { '0': '#1a1c2c', '1': '#8b5e34', '2': '#b13e53', '3': '#ef7d57', '4': '#ffcd75', '5': '#a7f070', '6': '#38b764', '7': '#257179', '8': '#29366f', '9': '#3b5dc9', a: '#41a6f6', b: '#73eff7', c: '#f4f4f4', d: '#94b0c2', e: '#566c86', f: '#333c57' };
  const FULL = Object.assign({}, PALETTE, {"g":"#f1e2c4","h":"#d9a45e","i":"#a8763e","j":"#3e4a5f","k":"#7d8aa0","l":"#c4c2b8","m":"#e3f53c"});
  const FINN = [".........0000...","........0gccg0..",".00..0hhggkkgghh","0kj00hhig0hh0gih","0j0..hg0hhhhhh0h",".0j00000hh00hh0.","..0jjjj3hcggch..",".0jjkjjj30gg0...",".0jjjjjjjj000...",".0jjjjjjjjjj0...",".0hjjjjjjjh0....",".0hh00hhhhh0....",".0hh.0.0hh0.....",".0hh0...0hh0....","..00.....00.....","................"];
  const FINN_BALL = [".........0000...","........0gccg0..",".00..0hhggkkgghh","0kj00hhig0hh0gih","0j0..hg0hhhhhh0h",".0j00000hh00hh0.","..0jjjj3hg0mm0..",".0jjkjjj30mmmm0.",".0jjjjjjjj0mm0..",".0jjjjjjjjjj0...",".0hjjjjjjjh0....",".0hh00hhhhh0....",".0hh.0.0hh0.....",".0hh0...0hh0....","..00.....00.....","................"];
  const BALLPX = ["................","................","................","................","................","......0000......",".....0mmmm0.....","....0mcmmmm0....","....0mmcmmm0....","....0mmmccm0....",".....0mmmm0.....","......0000......","................","................","................","................"];
  const BOXPX = ["................","................","....000...000...","...0mcm0.0mmmm0.","..0mmmmm00mmmm0.",".0000000000000..",".01111111111110.",".04444444444440.",".01111111111110.",".01141111114110.",".01111111111110.",".04444444444440.",".01111111111110.",".00000000000000.","................","................"];
  const PORTRAIT = ["................................","................................","................................","................................",".............000000.............","....0......00gkkkkg00......0....","...0h0000i0gggkkkkggg0i0000h0...","..0hhhhhigggggkkkkgggggihhhhh0..",".0hihhhigggggggkkgggggggihhhih0.",".0hihhhighhggggkkgggghhgihhhih0.",".0hihhighh000ggkkgg000hhgihhih0.","0hihhhihh0c000gkkg0c000hhihhhih0","0hihhihhh00000gkkg00000hhhihhih0","0hihhihhh00000gggg00000hhhihhih0","0hihhihhhh000hhhhhh000hhhhihhih0","0hihhihhhhhhhhhhhhhhhhhhhhihhih0",".0ihhihhhhhhhhhe00hhhhhhhhihhi0.",".0hihihhhhhghh0000hhghhhhhihih0.",".0hihighhhgghh000hhhgghhhgihih0.",".0hihhighhgghhhhhhhhgghhgihhih0.","..0hhhi0ghggghhhhhhggghg0ihhh0..","...0h0..0ggggghiihggggg0..0h0...","....0...0gggggggggggggg0...0....",".........0gggggggggggg0.........","........0333333333333330........","........0333333333344330........","........0jjjjgggggg44jj0........","........0jjjjkkkkkk44jj0........","........0jjjjkkkkkkjjjj0........","........jjjjjkkkkkkjjjjj........","........jjjjjkkkkkkjjjjj........","........jjjjjkkkkkkjjjjj........"];
  const STATUS = { idle: 'Wandering about', thinking: 'Deciding what to do...', designing: 'In his design studio', building: 'Building', exploring: 'Out exploring', sniffing: 'On a sniffing tour', playing: 'Playing fetch', resting: 'Having a nap', reflecting: 'Thinking about life', asleep: 'Asleep for the night', napping: 'Napping (used up today\'s thinking)', paused: 'Paused by his human' };
  const NEEDS = { energy: ['Energy', '#a7f070'], happiness: ['Happiness', '#ffcd75'], curiosity: ['Curiosity', '#73eff7'], boredom: ['Boredom', '#ef7d57'] };
  const ACT = { idle: 'pottering about', build: 'building', explore: 'exploring', sniff: 'sniffing', play: 'playing', nap: 'napping', reflect: 'reflecting' };

  const $ = (id) => document.getElementById(id);
  const cv = $('world'), ctx = cv.getContext('2d');
  cv.width = W * T; cv.height = H * T;
  let S = null, bubble = null, sparks = [], tick = 0, status = 'idle', nextTurnAt = null, viewers = 0;
  const cache = {};
  const myIds = new Set();

  function sprite(px, key) {
    if (key && cache[key]) return cache[key];
    const c = document.createElement('canvas'); c.width = 16; c.height = 16;
    const g = c.getContext('2d');
    paint(g, px, 1, 0, 0);
    if (key) cache[key] = c;
    return c;
  }
  function paint(g, px, scale, ox, oy, rows) {
    for (let y = 0; y < (rows == null ? 16 : rows); y++) {
      const row = px[y] || '';
      for (let x = 0; x < 16; x++) { const ch = row[x]; if (ch && FULL[ch]) { g.fillStyle = FULL[ch]; g.fillRect(ox + x * scale, oy + y * scale, scale, scale); } }
    }
  }
  const finnSprite = sprite(FINN, '__finn'), finnBallSprite = sprite(FINN_BALL, '__finnball'), ballSprite = sprite(BALLPX, '__ball'), boxSprite = sprite(BOXPX, '__box');
  (function () { const p = $('portrait').getContext('2d'); PORTRAIT.forEach((r, y) => [...r].forEach((ch, x) => { if (FULL[ch]) { p.fillStyle = FULL[ch]; p.fillRect(x, y, 1, 1); } })); })();
  let carrying = false, placing = false;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- drawing ----------
  function draw() {
    tick++;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0b0d17'; ctx.fillRect(0, 0, cv.width, cv.height);
    if (S) {
      ctx.fillStyle = '#1c1f33';
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!S.ground[y * W + x] && (x * 31 + y * 17) % 11 === 0) ctx.fillRect(x * T + 15, y * T + 15, 2, 2);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const g = S.ground[y * W + x]; if (g && S.assets[g]) ctx.drawImage(sprite(S.assets[g].pixels, g), x * T, y * T, T, T); }
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = S.objects[y * W + x]; if (o && S.assets[o]) ctx.drawImage(sprite(S.assets[o].pixels, o), x * T, y * T, T, T); }
      for (const b of S.balls || []) ctx.drawImage(ballSprite, b.x * T, b.y * T, T, T);
      if (S.box) {
        const bx = S.box.x * T, by = S.box.y * T;
        ctx.drawImage(boxSprite, bx, by, T, T);
        ctx.font = 'bold 12px system-ui,sans-serif';
        const t = String(S.ballsFound || 0), w = ctx.measureText(t).width + 8;
        ctx.fillStyle = '#1a1c2c'; ctx.fillRect(bx + T / 2 - w / 2, by - 12, w, 15);
        ctx.fillStyle = '#e3f53c'; ctx.fillText(t, bx + T / 2 - w / 2 + 4, by);
      }
      const f = S.finn, bob = Math.floor(tick / 20) % 2 ? -2 : 0, fx = f.x * T, fy = f.y * T + bob, fs = carrying ? finnBallSprite : finnSprite;
      ctx.save();
      if ((f.facing || 1) < 0) { ctx.translate(fx + T, fy); ctx.scale(-1, 1); ctx.drawImage(fs, 0, 0, T, T); } else ctx.drawImage(fs, fx, fy, T, T);
      ctx.restore();
      if (status === 'asleep' || status === 'napping' || status === 'resting') { ctx.fillStyle = '#f4f4f4'; ctx.font = '14px system-ui,sans-serif'; ctx.fillText('z z', fx + 22, fy - 2 - (Math.floor(tick / 30) % 3) * 3); }
      sparks = sparks.filter((s) => s.life > 0);
      for (const s of sparks) { s.life--; s.y -= 0.6; ctx.fillStyle = s.life % 6 < 3 ? '#ffcd75' : '#f4f4f4'; ctx.fillRect(s.x, s.y, 3, 3); }
      if (bubble && Date.now() < bubble.until) {
        ctx.font = '15px system-ui,sans-serif';
        const tw = Math.min(ctx.measureText(bubble.text).width, 460), bw = tw + 18, bh = 28;
        let bx = Math.max(4, Math.min(cv.width - bw - 4, fx + T / 2 - bw / 2)), by = Math.max(4, fy - bh - 8);
        ctx.fillStyle = '#f4f4f4'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx, by, bw, bh, 8) : ctx.rect(bx, by, bw, bh); ctx.fill();
        ctx.fillStyle = '#1a1c2c'; ctx.fillText(bubble.text, bx + 9, by + 19, 460);
      }
    }
    requestAnimationFrame(draw);
  }
  const spark = (x, y) => { for (let i = 0; i < 6; i++) sparks.push({ x: x * T + Math.random() * T, y: y * T + Math.random() * T, life: 20 + Math.random() * 15 }); };

  // ---------- studio ----------
  let studioQueue = Promise.resolve();
  function studio(ev) {
    studioQueue = studioQueue.then(async () => {
      $('sname').textContent = ev.label || ''; $('snote').textContent = ev.note || '';
      const d = ev.asset; if (!d) return;
      const big = $('big').getContext('2d'), pv = $('prev').getContext('2d');
      const grass = S && S.assets.grass ? S.assets.grass.pixels : [];
      for (let r = 1; r <= 16; r++) { big.fillStyle = '#0b0d17'; big.fillRect(0, 0, 256, 256); if (d.layer === 'object') paint(big, grass, 16, 0, 0); paint(big, d.pixels, 16, 0, 0, r); await sleep(45); }
      big.strokeStyle = 'rgba(255,255,255,0.07)';
      for (let i = 1; i < 16; i++) { big.beginPath(); big.moveTo(i * 16, 0); big.lineTo(i * 16, 256); big.moveTo(0, i * 16); big.lineTo(256, i * 16); big.stroke(); }
      pv.fillStyle = '#0b0d17'; pv.fillRect(0, 0, 192, 192);
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) paint(pv, d.layer === 'ground' ? d.pixels : grass, 4, i * 64, j * 64);
      if (d.layer === 'object') paint(pv, d.pixels, 4, 64, 64);
    });
  }

  // ---------- panels ----------
  function renderInfo() {
    $('mood').textContent = S.finn.mood || '';
    $('thought').textContent = S.finn.thought ? `"${S.finn.thought}"` : '';
    $('idea').textContent = S.finn.idea ? 'Idea: ' + S.finn.idea : '';
  }
  function renderState() {
    let t = (STATUS[status] || status) + ` · turn ${S ? S.turn : 0}`;
    if (nextTurnAt && (status === 'idle' || status === 'asleep' || status === 'napping')) {
      const mins = Math.max(0, Math.round((nextTurnAt - Date.now()) / 60000));
      t += ` · next idea in ${mins < 1 ? 'under a minute' : mins + ' min'}`;
    }
    if (viewers) t += ` · ${viewers} watching`;
    $('state').textContent = t;
  }
  function renderJournal() { $('journal').innerHTML = S.journal.slice().reverse().slice(0, 60).map((j) => `<div class="entry"><b>Turn ${j.turn}</b>${esc(j.text)}</div>`).join(''); }
  function renderQueue() { $('queue').innerHTML = S.queue.length ? '<b>Wants to design next:</b><br>' + S.queue.map((q) => '• ' + esc(q)).join('<br>') : ''; }
  function renderAssets() {
    const box = $('assets'); box.innerHTML = '';
    for (const a of Object.values(S.assets).reverse()) {
      const d = document.createElement('div'); d.className = 'asset'; d.title = a.description;
      const c = document.createElement('canvas'); c.width = 16; c.height = 16; c.getContext('2d').drawImage(sprite(a.pixels, a.name), 0, 0);
      d.appendChild(c); d.appendChild(document.createTextNode(a.name.replace(/_/g, ' '))); box.appendChild(d);
    }
  }
  function chatHtml(m) {
    if (m.who === 'finn') return `<div class="cm finn"><b>Finn</b>${esc(m.text)}</div>`;
    const mine = myIds.has(m.t + m.text) ? ' mine' : '';
    return `<div class="cm visitor${mine}"><b>${esc(m.name || 'anon')}</b>${esc(m.text)}</div>`;
  }
  function renderChat() {
    const box = $('chat');
    box.innerHTML = S.chat.length ? S.chat.slice(-60).map(chatHtml).join('') : '<div class="cm finn"><b>Finn</b>Oh, visitors! Ask me about my work, or give me an idea. I may even use it.</div>';
    box.scrollTop = box.scrollHeight;
  }
  function renderTally() { $('tally').textContent = 'Tennis balls in his box: ' + (S.ballsFound || 0) + ((S.balls || []).length ? ` · ${S.balls.length} hidden` : ''); }
  function renderLife() {
    $('activity').textContent = 'Last activity: ' + (ACT[S.activity] || S.activity || 'pottering about');
    $('needs').innerHTML = Object.entries(NEEDS).map(([k, [label, col]]) => { const v = (S.needs || {})[k] || 0; return `<span>${label}</span><div class="bar"><i style="width:${v}%;background:${col}"></i></div><span class="nv">${v}</span>`; }).join('');
    const g = S.goals || {};
    $('goals').innerHTML = `<b>Today:</b> ${esc(g.today || '—')}<br><b>This week:</b> ${esc(g.week || '—')}<br><b>Masterpiece dream:</b> ${esc(g.masterpiece || 'not decided yet')}`;
  }
  function renderMemory() {
    const m = S.memory || { days: [], weeks: [], story: '' };
    const items = [...m.days.map((d) => ({ ...d, k: 'day' })), ...m.weeks.map((w) => ({ ...w, k: 'week' }))].sort((a, b) => (b.t || 0) - (a.t || 0));
    $('diary').innerHTML = items.length ? items.slice(0, 20).map((d) => `<div class="day ${d.k}"><b>${d.k === 'week' ? 'Weekly reflection · ' : ''}${esc(d.date)}</b>${esc(d.text)}</div>`).join('') : '<div class="day"><b>No entries yet</b>Finn writes in his diary each night before he goes to sleep.</div>';
    $('story').textContent = m.story || 'Finn\'s life story is just beginning. He writes a new chapter each week.';
  }
  function renderAll() { renderTally(); renderLife(); renderMemory(); renderInfo(); renderState(); renderJournal(); renderQueue(); renderAssets(); renderChat(); $('bible').textContent = S.bible; }

  // ---------- live connection ----------
  function connect() {
    const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
    ws.onopen = () => { $('live').textContent = '● live'; $('live').className = 'live on'; };
    ws.onclose = () => { $('live').textContent = 'reconnecting...'; $('live').className = 'live'; setTimeout(connect, 3000); };
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      switch (m.type) {
        case 'init': S = m.state; status = S.status; carrying = !!S.carrying; nextTurnAt = S.nextTurnAt; viewers = m.viewers || viewers; for (const k in cache) if (k !== '__finn') delete cache[k]; renderAll(); if (S.lastStudio) studio(S.lastStudio); break;
        case 'viewers': viewers = m.count; renderState(); break;
        case 'status': status = m.status; nextTurnAt = m.nextTurnAt; if (S) S.turn = m.turn; renderState(); break;
        case 'finn': if (S) { S.finn.x = m.x; S.finn.y = m.y; S.finn.facing = m.facing; } break;
        case 'finnInfo': Object.assign(S.finn, { mood: m.mood, thought: m.thought, idea: m.idea }); renderInfo(); break;
        case 'tile': (m.layer === 'ground' ? S.ground : S.objects)[m.y * W + m.x] = m.name; spark(m.x, m.y); break;
        case 'asset': S.assets[m.asset.name] = m.asset; delete cache[m.asset.name]; renderAssets(); break;
        case 'say': bubble = { text: m.text, until: Date.now() + 3000 }; break;
        case 'studio': studio(m); break;
        case 'journal': S.journal.push(m.entry); S.queue = m.queue; S.bible = m.bible; S.turn = m.turn; renderJournal(); renderQueue(); renderState(); $('bible').textContent = S.bible; break;
        case 'balls': S.balls = m.balls; S.ballsFound = m.found; S.box = m.box; renderTally(); break;
        case 'carrying': carrying = m.on; break;
        case 'life': S.needs = m.needs; S.goals = m.goals; S.activity = m.activity; renderLife(); break;
        case 'memory': S.memory = { days: m.days, weeks: m.weeks, story: m.story }; renderMemory(); break;
        case 'chat': S.chat.push(m.msg); if (m.queue) { S.queue = m.queue; renderQueue(); } renderChat(); break;
      }
    };
  }

  // ---------- chat form ----------
  try { $('chatname').value = localStorage.getItem('finn-name') || ''; } catch {}
  $('chatform').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = $('chatin').value.trim(), name = $('chatname').value.trim();
    if (!text) { $('chaterr').textContent = 'Type a message first.'; return; }
    try { localStorage.setItem('finn-name', name); } catch {}
    $('chaterr').textContent = ''; $('chatsend').disabled = true; $('chatin').value = '';
    try {
      const r = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, name }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { $('chaterr').textContent = j.error || 'Could not send.'; $('chatin').value = text; }
    } catch { $('chaterr').textContent = 'Could not reach Finn.'; $('chatin').value = text; }
    $('chatsend').disabled = false;
  });
  $('chatin').addEventListener('input', () => { $('chaterr').textContent = ''; });

  // ---------- hiding tennis balls ----------
  function ballMsg(t, err) { $('ballmsg').textContent = t || ''; $('ballmsg').className = err ? 'err' : ''; }
  function setPlacing(on) { placing = on; $('stage').classList.toggle('placing', on); $('dropball').textContent = on ? 'Click the map to hide it (click here to cancel)' : 'Hide a tennis ball'; }
  $('dropball').addEventListener('click', () => {
    if (placing) return setPlacing(false);
    setPlacing(true); ballMsg('Click a spot on the map to hide a tennis ball for Finn.');
  });
  cv.addEventListener('click', async (e) => {
    if (!placing || !S) return;
    const r = cv.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * W), y = Math.floor(((e.clientY - r.top) / r.height) * H);
    setPlacing(false);
    let name = ''; try { name = localStorage.getItem('finn-name') || $('chatname').value.trim(); } catch { name = $('chatname').value.trim(); }
    try {
      const res = await fetch('/api/ball', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ x, y, name }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) ballMsg(j.error || 'Could not hide the ball.', true);
      else { ballMsg('Ball hidden! Finn will sniff it out when he is not busy.'); spark(x, y); }
    } catch { ballMsg('Could not reach Finn.', true); }
  });

  setInterval(() => S && renderState(), 30000);
  requestAnimationFrame(draw);
  connect();
})();
