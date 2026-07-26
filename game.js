'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#7986cb', // J - indigo
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const HIGHSCORES_KEY = 'tetris-highscores';
const BEST_COMBO_KEY = 'tetris-best-combo';
const BEST_LINES_KEY = 'tetris-best-lines';

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

let comboCount = 0;
let comboBest = 0;
let pendingScore = null;
let highscores = loadHighscores();
let bestCombo = Number(localStorage.getItem(BEST_COMBO_KEY)) || 0;
let bestLines = Number(localStorage.getItem(BEST_LINES_KEY)) || 0;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
    if (cleared > bestLines) {
      bestLines = cleared;
      localStorage.setItem(BEST_LINES_KEY, String(bestLines));
    }
  }
  return cleared;
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  const cleared = clearLines();
  if (cleared > 0) {
    comboCount++;
    if (comboCount > comboBest) comboBest = comboCount;
  } else {
    comboCount = 0;
  }
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--grid-line').trim();
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function loadHighscores() {
  try {
    const raw = JSON.parse(localStorage.getItem(HIGHSCORES_KEY));
    if (Array.isArray(raw)) {
      return raw.filter(e => e && typeof e.score === 'number' && typeof e.name === 'string');
    }
  } catch (e) {
    // ignore corrupt data
  }
  return [];
}

function saveHighscores() {
  localStorage.setItem(HIGHSCORES_KEY, JSON.stringify(highscores));
}

function qualifiesForHighscore(s) {
  return highscores.length < 5 || s > highscores[highscores.length - 1].score;
}

function addHighscore(name, s) {
  const entry = { name: name || 'ANON', score: s };
  highscores.push(entry);
  highscores.sort((a, b) => b.score - a.score);
  highscores = highscores.slice(0, 5);
  saveHighscores();
  return highscores.indexOf(entry);
}

function resetRecords() {
  highscores = [];
  bestCombo = 0;
  bestLines = 0;
  localStorage.removeItem(HIGHSCORES_KEY);
  localStorage.removeItem(BEST_COMBO_KEY);
  localStorage.removeItem(BEST_LINES_KEY);
  renderRecords();
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function renderRecords(highlightIndex) {
  const listHtml = highscores.length
    ? highscores.map((e, i) => `
        <li class="${i === highlightIndex ? 'highlight' : ''}">
          <span class="rank">${i + 1}.</span>
          <span class="rname">${escapeHtml(e.name)}</span>
          <span class="rscore">${e.score.toLocaleString()}</span>
        </li>
      `).join('')
    : '<li class="empty">Sin records aún</li>';

  document.querySelectorAll('.records-list').forEach(el => { el.innerHTML = listHtml; });
  document.querySelectorAll('.best-combo-value').forEach(el => { el.textContent = bestCombo; });
  document.querySelectorAll('.best-lines-value').forEach(el => { el.textContent = bestLines; });
}

function showHighscoreEntry(qualifies) {
  const entryEl = document.getElementById('highscore-entry');
  if (!entryEl) return;
  if (qualifies) {
    pendingScore = score;
    entryEl.style.display = 'flex';
    const input = document.getElementById('highscore-name');
    input.value = '';
    setTimeout(() => input.focus(), 0);
  } else {
    pendingScore = null;
    entryEl.style.display = 'none';
  }
}

function submitHighscore() {
  if (pendingScore === null) return;
  const input = document.getElementById('highscore-name');
  const name = (input.value || '').trim().slice(0, 12) || 'ANON';
  const idx = addHighscore(name, pendingScore);
  pendingScore = null;
  document.getElementById('highscore-entry').style.display = 'none';
  renderRecords(idx);
}

function buildRecordsUI() {
  const panel = document.querySelector('.panel');
  const sidebarSection = document.createElement('div');
  sidebarSection.className = 'panel-section records-section';
  sidebarSection.innerHTML = `
    <span class="label">RECORDS</span>
    <ol class="records-list"></ol>
    <div class="records-stats">
      <span>Mejor combo: <b class="best-combo-value">0</b></span>
      <span>Líneas máx: <b class="best-lines-value">0</b></span>
    </div>
    <button id="reset-records-btn" type="button">Resetear records</button>
  `;
  panel.appendChild(sidebarSection);

  const overlayBox = restartBtn.parentElement;

  const entry = document.createElement('div');
  entry.id = 'highscore-entry';
  entry.style.display = 'none';
  entry.innerHTML = `
    <p class="highscore-label">¡Entraste al Top 5!</p>
    <input id="highscore-name" type="text" maxlength="12" placeholder="Tu nombre" autocomplete="off" />
    <button id="highscore-submit" type="button">Guardar</button>
  `;
  overlayBox.insertBefore(entry, restartBtn);

  const overlayRecords = document.createElement('div');
  overlayRecords.id = 'records-panel';
  overlayRecords.innerHTML = `
    <span class="label">RECORDS</span>
    <ol class="records-list"></ol>
    <div class="records-stats">
      <span>Mejor combo: <b class="best-combo-value">0</b></span>
      <span>Líneas máx: <b class="best-lines-value">0</b></span>
    </div>
  `;
  overlayBox.insertBefore(overlayRecords, restartBtn);

  document.getElementById('reset-records-btn').addEventListener('click', resetRecords);
  document.getElementById('highscore-submit').addEventListener('click', submitHighscore);
  document.getElementById('highscore-name').addEventListener('keydown', e => {
    if (e.code === 'Enter') {
      e.preventDefault();
      submitHighscore();
    }
  });
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;

  if (comboBest > bestCombo) {
    bestCombo = comboBest;
    localStorage.setItem(BEST_COMBO_KEY, String(bestCombo));
  }

  showHighscoreEntry(qualifiesForHighscore(score));
  renderRecords();

  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  comboCount = 0;
  comboBest = 0;
  pendingScore = null;
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  const entryEl = document.getElementById('highscore-entry');
  if (entryEl) entryEl.style.display = 'none';
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

const themeToggle = document.getElementById('theme-toggle');

function applyTheme(theme) {
  document.body.dataset.theme = theme;
  themeToggle.textContent = theme === 'light' ? '☀️' : '🌙';
  localStorage.setItem('tetris-theme', theme);
  if (board) {
    draw();
    drawNext();
  }
}

themeToggle.addEventListener('click', () => {
  const next = document.body.dataset.theme === 'light' ? 'dark' : 'light';
  applyTheme(next);
});

applyTheme(localStorage.getItem('tetris-theme') || 'dark');

buildRecordsUI();
renderRecords();

init();
