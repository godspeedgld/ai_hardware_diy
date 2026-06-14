/* =======================================================================
   字母流星 · 打字练习游戏
   纯原生 JS + Canvas + Web Audio，无依赖。
   支持大小写、真实单词关卡、无限模式。
   ======================================================================= */

// ---------- 字母集 ----------
const L1 = "asdfjkl;";
const L2 = L1 + "rgvuhn";
const L3 = L2 + "qweiop";
const FULL = L3 + "zxcm,."; // 累加到底行 + 标点

// ---------- 单词池 ----------
const SHORT = ["cat","dog","sun","moon","star","fish","bird","tree","book","ball",
  "hand","milk","cake","jump","fast","slow","blue","rain","snow","wind","fire","lake",
  "hill","road","leaf","rock","seed","wing","duck","frog","bear","lion","wolf","deer",
  "seal","crab","crow","nest","bone","coin","gate","farm","barn","door","roof","ship",
  "boat","kite","gift","drum","lamp","desk","pen","cup","map","key","bus","car","van"];
const MID = ["apple","water","cloud","storm","space","earth","ocean","river","forest",
  "flower","garden","animal","monkey","tiger","panda","rabbit","rocket","meteor","galaxy",
  "comet","planet","jungle","castle","knight","dragon","wizard","pirate","school","pencil",
  "eraser","friend","family","mother","father","sister","brother","summer","winter","spring","autumn"];
const LONG = ["asteroid","universe","starlight","spaceship","supernova","telescope",
  "adventure","butterfly","elephant","kangaroo","dinosaur","rainbow","sunshine","thunder",
  "mountain","treasure","paradise","waterfall","moonbeam","starship","lightning","volcano",
  "penguin","happiness"];

// ---------- 关卡配置 ----------
// 头五关字母数翻倍；第5关起改用真实单词。
const LEVELS = [
  { id: 1, name: "主行键",   letters: L1,   comboLen: 1,                       spawnInterval: 1600, fallDuration: 6500,  spawnTarget: 36 },
  { id: 2, name: "上伸键",   letters: L2,   comboLen: 1,                       spawnInterval: 1400, fallDuration: 5800,  spawnTarget: 40 },
  { id: 3, name: "顶行键",   letters: L3,   comboLen: 1,                       spawnInterval: 1250, fallDuration: 5200,  spawnTarget: 44 },
  { id: 4, name: "底行键",   letters: FULL, comboLen: 1,                       spawnInterval: 1100, fallDuration: 4800,  spawnTarget: 48 },
  { id: 5, name: "短单词",   words: SHORT,                                     spawnInterval: 1900, fallDuration: 7800,  spawnTarget: 28 },
  { id: 6, name: "中单词",   words: MID,                                       spawnInterval: 2300, fallDuration: 9000,  spawnTarget: 18 },
  { id: 7, name: "长单词",   words: LONG,                                       spawnInterval: 2800, fallDuration: 10500, spawnTarget: 14 },
  { id: 8, name: "极速单词", words: SHORT.concat(MID),                          spawnInterval: 1500, fallDuration: 6000,  spawnTarget: 20 },
];
const PASS_RATE = 0.90;
const TOP_MARGIN = 72;
const INF_STEP = 50; // 无限模式每结算多少组升一级

// ---------- 状态 ----------
const State = { MENU: "menu", PLAYING: "playing", PAUSED: "paused", RESULT: "result" };
let state = State.MENU;
let mode = "level"; // 'level' | 'infinite'

let currentLevel = null;
let meteors = [];
let particles = [];
let stars = [];
let stats = { hit: 0, missed: 0 };
let spawned = 0;
let resolvedCount = 0;   // 无限模式：已结算（击中+漏掉）的流星数
let infDifficulty = 0;   // 无限模式当前难度（0 起）
let spawnTimer = 0;
let elapsed = 0;
let bottomFlash = 0;
let wrongFlash = 0;
let levelUpFlash = 0;
let colorIdx = 0;
let last = 0;
let animTime = 0;

// ---------- DOM ----------
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
let W = 0, H = 0, cellR = 26;
const el = (id) => document.getElementById(id);
const hud = el("hud"), menu = el("menu"), pauseOv = el("pause"), resultOv = el("result");

// ---------- 存档 ----------
const SAVE_KEY = "typing_game_progress";
function loadProgress() {
  try {
    const p = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (p && typeof p.unlockedLevel === "number") return { unlockedLevel: p.unlockedLevel, best: p.best || {} };
  } catch (e) {}
  return { unlockedLevel: 1, best: {} };
}
function saveProgress() { localStorage.setItem(SAVE_KEY, JSON.stringify(progress)); }
let progress = loadProgress();

// ---------- 工具 ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function hexA(hex, a) {
  const n = hex.replace("#", "");
  const r = parseInt(n.substr(0, 2), 16), g = parseInt(n.substr(2, 2), 16), b = parseInt(n.substr(4, 2), 16);
  return `rgba(${r},${g},${b},${a})`;
}
const PALETTE = ["#ff6b6b", "#4ec9f5", "#ffd93b", "#6bff8c", "#c77bff", "#ff9f43", "#5ad1ff"];
function pickColor() { colorIdx = (colorIdx + 1) % PALETTE.length; return PALETTE[colorIdx]; }

// ---------- 音效（Web Audio 合成）----------
let audioCtx = null;
// 背景音乐（HTMLAudioElement，独立于音效合成）
const bgm = el("bgm");
let musicOn = true;
let musicStarted = false;
if (bgm) bgm.volume = 0.25;
function ensureAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) { return; }
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  startMusic();
}
function startMusic() {
  if (musicStarted || !bgm) return;
  musicStarted = true;
  bgm.play().catch(() => {});
}
function toggleMusic() {
  musicOn = !musicOn;
  if (bgm) bgm.muted = !musicOn;
  const b = el("btn-music");
  if (b) b.textContent = musicOn ? "🔊" : "🔇";
  if (musicOn) startMusic();
}
function tone(freq, start, dur, type, vol) {
  if (!audioCtx) return;
  const t0 = audioCtx.currentTime + start;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(audioCtx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}
const sfxHit     = () => { tone(880, 0, 0.10, "triangle", 0.30); tone(1175, 0.03, 0.12, "triangle", 0.22); };
const sfxCombo   = () => { tone(523, 0, 0.12, "triangle", 0.22); tone(659, 0.08, 0.12, "triangle", 0.22); tone(784, 0.16, 0.14, "triangle", 0.22); tone(1046, 0.24, 0.20, "triangle", 0.22); };
const sfxMiss    = () => { tone(180, 0, 0.28, "square", 0.18); tone(110, 0.10, 0.32, "square", 0.16); };
const sfxWrong   = () => tone(200, 0, 0.07, "square", 0.12);
const sfxWin     = () => { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, i * 0.12, 0.22, "triangle", 0.22)); };
const sfxLose    = () => { [392, 330, 262].forEach((f, i) => tone(f, i * 0.14, 0.28, "square", 0.18)); };
const sfxLevelUp = () => { tone(660, 0, 0.12, "triangle", 0.22); tone(880, 0.08, 0.12, "triangle", 0.22); tone(1320, 0.16, 0.20, "triangle", 0.22); };

// ---------- 画布尺寸 ----------
function resize() {
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
  cellR = clamp(Math.round(Math.min(W, H) * 0.035), 20, 32);
}
function initStars() {
  stars = [];
  const count = Math.round(W * H / 9000);
  for (let i = 0; i < count; i++) {
    stars.push({
      x: Math.random() * W, y: Math.random() * H,
      r: Math.random() * 1.6 + 0.3,
      phase: Math.random() * Math.PI * 2,
      spd: 8 + Math.random() * 22,
      tw: 0.5 + Math.random() * 1.5,
    });
  }
}
window.addEventListener("resize", resize);

// ---------- 生成内容（带大小写）----------
function pickLetters(lv, n) {
  const arr = [];
  for (let i = 0; i < n; i++) {
    let ch = lv.letters[Math.floor(Math.random() * lv.letters.length)];
    if (/[a-z]/.test(ch) && Math.random() < 0.5) ch = ch.toUpperCase(); // 仅字母随机大小写，用于显示
    arr.push({ ch, done: false });
  }
  return arr;
}
function pickWord(lv) {
  const w = lv.words[Math.floor(Math.random() * lv.words.length)];
  return w.split("").map(ch => ({ ch, done: false }));
}

// ---------- 生成流星 ----------
function spawn() {
  const lv = currentLevel;
  const letters = lv.words ? pickWord(lv) : pickLetters(lv, lv.comboLen || 1);
  const n = letters.length;
  const r = Math.min(cellR, Math.floor((W - 40) / (n * 1.9))); // 长单词自适应缩小，保证不超出屏幕
  const cellW = r * 1.9;
  const w = n * cellW;
  let cx = (w / 2 + 12) + Math.random() * Math.max(1, W - w - 24);
  for (let t = 0; t < 10; t++) {
    const c = (w / 2 + 12) + Math.random() * Math.max(1, W - w - 24);
    let ok = true;
    for (const m of meteors) {
      if (m.y < TOP_MARGIN + r * 5 && Math.abs(c - m.cx) < (w / 2 + m.w / 2 + r)) { ok = false; break; }
    }
    if (ok) { cx = c; break; }
    cx = c;
  }
  const vy = (H - TOP_MARGIN) / (lv.fallDuration / 1000);
  meteors.push({ cx, y: TOP_MARGIN, vy, letters, w, r, color: pickColor() });
  spawned++;
}

// ---------- 命中判定 ----------
function cellCenterX(m, i) { return m.cx - m.w / 2 + m.r * 1.9 / 2 + i * (m.r * 1.9); }

function onKey(ch) {
  // 找「下一个待打字母」等于 ch 的流星；多个时取最低（最大 y）
  let target = null;
  for (const m of meteors) {
    const next = m.letters.find(l => !l.done);
    if (next && next.ch.toLowerCase() === ch) { // 命中不区分大小写
      if (!target || m.y > target.y) target = m;
    }
  }
  if (!target) {
    wrongFlash = 0.4;
    sfxWrong();
    return;
  }
  const idx = target.letters.findIndex(l => !l.done);
  target.letters[idx].done = true;
  spawnSparkle(cellCenterX(target, idx), target.y, target.color);
  if (target.letters.every(l => l.done)) {
    stats.hit += target.letters.length;
    spawnBurst(target);
    if (target.letters.length > 1) sfxCombo(); else sfxHit();
    meteors.splice(meteors.indexOf(target), 1);
    onResolved();
  } else {
    sfxHit();
  }
}

// 流星被结算（击落或漏掉）后的处理：无限模式计数 + 升级
function onResolved() {
  if (mode !== "infinite") return;
  resolvedCount++;
  const want = Math.floor(resolvedCount / INF_STEP);
  if (want > infDifficulty) {
    infDifficulty = want;
    currentLevel = infiniteConfig(infDifficulty);
    el("hud-name").textContent = currentLevel.name;
    levelUpFlash = 1.0;
    sfxLevelUp();
  }
}

// ---------- 粒子 ----------
function spawnBurst(m) {
  const count = 10 + m.letters.length * 5;
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 60 + Math.random() * 200;
    particles.push({
      x: m.cx, y: m.y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
      life: 0.6 + Math.random() * 0.6, max: 1.2,
      color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
      r: 2 + Math.random() * 3,
    });
  }
}
function spawnSparkle(x, y, color) {
  for (let i = 0; i < 6; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 30 + Math.random() * 70;
    particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 0.3 + Math.random() * 0.3, max: 0.6, color, r: 1.5 + Math.random() * 2,
    });
  }
}

// ---------- 更新 ----------
function updateStars(dt) {
  for (const s of stars) { s.y += s.spd * dt; if (s.y > H) { s.y = 0; s.x = Math.random() * W; } }
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.vy += 360 * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
  }
}
function updateGame(dt) {
  elapsed += dt;
  spawnTimer += dt;
  const interval = currentLevel.spawnInterval / 1000;
  while (spawnTimer >= interval && (currentLevel.infinite || spawned < currentLevel.spawnTarget)) {
    spawn();
    spawnTimer -= interval;
  }
  for (let i = meteors.length - 1; i >= 0; i--) {
    const m = meteors[i];
    m.y += m.vy * dt;
    if (m.y + m.r >= H) {
      const done = m.letters.filter(l => l.done).length;
      stats.hit += done;
      stats.missed += m.letters.length - done;
      bottomFlash = 0.6;
      sfxMiss();
      meteors.splice(i, 1);
      onResolved();
    }
  }
  if (bottomFlash > 0) bottomFlash = Math.max(0, bottomFlash - dt);
  if (wrongFlash > 0) wrongFlash = Math.max(0, wrongFlash - dt);
  if (levelUpFlash > 0) levelUpFlash = Math.max(0, levelUpFlash - dt);
  if (mode === "level" && spawned >= currentLevel.spawnTarget && meteors.length === 0) finishLevel();
  updateHUD();
}

// ---------- 渲染 ----------
function render() {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0a1230"); bg.addColorStop(0.6, "#070b1a"); bg.addColorStop(1, "#04060f");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  for (const s of stars) {
    ctx.globalAlpha = 0.35 + 0.6 * Math.abs(Math.sin(s.phase + animTime * s.tw));
    ctx.fillStyle = "#cfe0ff";
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const m of meteors) drawMeteor(m);
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (bottomFlash > 0) {
    const g = ctx.createLinearGradient(0, H - 130, 0, H);
    g.addColorStop(0, "rgba(255,60,60,0)");
    g.addColorStop(1, `rgba(255,60,60,${0.5 * bottomFlash})`);
    ctx.fillStyle = g; ctx.fillRect(0, H - 130, W, 130);
  }
  if (wrongFlash > 0) {
    ctx.strokeStyle = `rgba(255,80,80,${wrongFlash * 1.5})`;
    ctx.lineWidth = 6; ctx.strokeRect(3, 3, W - 6, H - 6);
  }
  if (levelUpFlash > 0) {
    ctx.strokeStyle = `rgba(255,215,90,${levelUpFlash})`;
    ctx.lineWidth = 8; ctx.strokeRect(4, 4, W - 8, H - 8);
  }
}
function drawMeteor(m) {
  for (let i = 0; i < m.letters.length; i++) {
    const cx = cellCenterX(m, i);
    const cy = m.y;
    const letter = m.letters[i];
    const col = letter.done ? "#ffd95e" : m.color;
    const sg = ctx.createLinearGradient(cx, cy - m.r, cx, cy - m.r * 3);
    sg.addColorStop(0, hexA(col, 0.4));
    sg.addColorStop(1, hexA(col, 0));
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.ellipse(cx, cy - m.r * 1.8, m.r * 0.5, m.r * 1.4, 0, 0, Math.PI * 2); ctx.fill();
    const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, m.r * 1.7);
    grad.addColorStop(0, hexA(col, 0.95));
    grad.addColorStop(0.5, hexA(col, 0.5));
    grad.addColorStop(1, hexA(col, 0));
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(cx, cy, m.r * 1.7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(cx, cy, m.r * 0.82, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#0b1020";
    ctx.font = `bold ${Math.round(m.r * 1.15)}px 'Arial Rounded MT Bold','Comic Sans MS',system-ui,sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(letter.ch, cx, cy + 1); // 显示字母自身的随机大小写
  }
}

// ---------- HUD ----------
function liveAcc() { const t = stats.hit + stats.missed; return t > 0 ? Math.round(stats.hit / t * 100) : 100; }
function updateHUD() {
  el("hud-acc").textContent = liveAcc();
  if (mode === "infinite") {
    el("hud-prog").textContent = resolvedCount % INF_STEP;
    el("hud-target").textContent = INF_STEP;
  } else {
    el("hud-prog").textContent = spawned;
    el("hud-target").textContent = currentLevel.spawnTarget;
  }
}

// ---------- 无限模式难度参数 ----------
function infiniteConfig(idx) {
  const base = LEVELS[Math.min(idx, LEVELS.length - 1)];
  const over = Math.max(0, idx - (LEVELS.length - 1));
  const k = Math.pow(0.9, over); // 超出第8关后每级再快 10%
  return {
    id: idx + 1, name: "无限 · 难度 " + (idx + 1),
    letters: base.letters, words: base.words, comboLen: base.comboLen || 1,
    spawnInterval: Math.max(450, Math.round(base.spawnInterval * k)),
    fallDuration: Math.max(2400, Math.round(base.fallDuration * k)),
    spawnTarget: INF_STEP, infinite: true,
  };
}

// ---------- 流程控制 ----------
function beginRun() {
  meteors = []; particles = [];
  stats = { hit: 0, missed: 0 };
  spawned = 0; resolvedCount = 0; spawnTimer = 0; elapsed = 0;
  bottomFlash = 0; wrongFlash = 0; levelUpFlash = 0;
  el("hud-level").textContent = mode === "infinite" ? "∞" : currentLevel.id;
  el("hud-name").textContent = currentLevel.name;
  el("hud-acc").textContent = 100;
  updateHUD();
  hideOverlays();
  hud.classList.remove("hidden");
  last = performance.now();
  state = State.PLAYING;
}
function startLevel(id) { mode = "level"; currentLevel = Object.assign({}, LEVELS[id - 1]); beginRun(); }
function startInfinite() { mode = "infinite"; infDifficulty = 0; currentLevel = infiniteConfig(0); beginRun(); }
function pauseGame() { state = State.PAUSED; pauseOv.classList.remove("hidden"); }
function resumeGame() { pauseOv.classList.add("hidden"); last = performance.now(); state = State.PLAYING; }

function finishLevel() {
  const total = stats.hit + stats.missed;
  const acc = total > 0 ? stats.hit / total : 1;
  const passed = acc >= PASS_RATE;
  const time = Math.round(elapsed);
  let starN = 0;
  if (passed) {
    starN = acc >= 0.95 ? 3 : 2;
    if (currentLevel.id < LEVELS.length) {
      progress.unlockedLevel = Math.max(progress.unlockedLevel, currentLevel.id + 1);
    }
    const prev = progress.best[currentLevel.id];
    if (!prev || acc > prev.accuracy) progress.best[currentLevel.id] = { accuracy: acc, time, stars: starN };
    saveProgress();
    sfxWin();
  } else {
    sfxLose();
  }
  showResult(passed, acc, starN, time);
}

function showResult(passed, acc, starN, time) {
  state = State.RESULT;
  hud.classList.add("hidden");
  el("result-title").textContent = passed ? "🎉 通关！" : "💪 再接再厉！";
  el("result-title").style.color = passed ? "#ffd93b" : "#ff9f43";
  el("result-acc").textContent = Math.round(acc * 100);
  el("result-hit").textContent = stats.hit;
  el("result-miss").textContent = stats.missed;
  el("result-time").textContent = time;
  el("result-stars").textContent = passed ? "⭐".repeat(starN) + "☆".repeat(3 - starN) : "☆☆☆";
  const next = el("btn-next");
  const hasNext = passed && currentLevel.id < LEVELS.length;
  next.style.display = hasNext ? "" : "none";
  resultOv.classList.remove("hidden");
}

function showMenu() {
  state = State.MENU;
  hideOverlays();
  hud.classList.add("hidden");
  buildMenu();
  menu.classList.remove("hidden");
}
function hideOverlays() { menu.classList.add("hidden"); pauseOv.classList.add("hidden"); resultOv.classList.add("hidden"); }

function buildMenu() {
  const wrap = el("levels");
  wrap.innerHTML = "";
  LEVELS.forEach(lv => {
    const unlocked = lv.id <= progress.unlockedLevel;
    const best = progress.best[lv.id];
    const btn = document.createElement("button");
    btn.className = "level-btn" + (unlocked ? "" : " locked");
    btn.disabled = !unlocked;
    btn.innerHTML =
      `<span class="lv-num">${lv.id}</span>` +
      `<span class="lv-name">${lv.name}</span>` +
      `<span class="lv-best">${best ? "最佳 " + Math.round(best.accuracy * 100) + "%" : (unlocked ? "未挑战" : "🔒 未解锁")}</span>`;
    if (unlocked) btn.onclick = () => { ensureAudio(); startLevel(lv.id); };
    wrap.appendChild(btn);
  });
}

// ---------- 主循环 ----------
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  animTime += dt;
  updateStars(dt);
  updateParticles(dt);
  if (state === State.PLAYING) updateGame(dt);
  render();
  requestAnimationFrame(frame);
}

// ---------- 输入 ----------
window.addEventListener("keydown", (e) => {
  if (state === State.PLAYING) {
    if (e.key === "Escape") { e.preventDefault(); pauseGame(); return; }
    if (e.key.length === 1 && e.key !== " ") { e.preventDefault(); ensureAudio(); onKey(e.key.toLowerCase()); }
  } else if (state === State.PAUSED) {
    if (e.key === "Escape") { e.preventDefault(); resumeGame(); }
  }
});

// ---------- 按钮事件 ----------
el("btn-resume").onclick = () => { ensureAudio(); resumeGame(); };
el("btn-quit").onclick = showMenu;
el("btn-next").onclick = () => { ensureAudio(); startLevel(currentLevel.id + 1); };
el("btn-retry").onclick = () => { ensureAudio(); startLevel(currentLevel.id); };
el("btn-menu").onclick = showMenu;
el("btn-infinite").onclick = () => { ensureAudio(); startInfinite(); };
el("btn-music").onclick = toggleMusic;

// ---------- 启动 ----------
resize();
initStars();
showMenu();
last = performance.now();
requestAnimationFrame(frame);
