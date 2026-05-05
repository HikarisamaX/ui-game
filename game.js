const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");

const levelText = document.querySelector("#levelText");
const scoreText = document.querySelector("#scoreText");
const livesText = document.querySelector("#livesText");
const targetText = document.querySelector("#targetText");
const overlay = document.querySelector("#overlay");
const overlayTitle = document.querySelector("#overlayTitle");
const overlayText = document.querySelector("#overlayText");
const startButton = document.querySelector("#startButton");
const pauseButton = document.querySelector("#pauseButton");
const restartButton = document.querySelector("#restartButton");

const PLAYER_FIRE_MS = 150;

const state = {
  level: 1,
  score: 0,
  lives: 3,
  running: false,
  paused: false,
  won: false,
  lost: false,
  lastTime: 0,
  enemySpawnTimer: 0,
  playerFireTimer: 0,
  starShift: 0,
  enemiesDestroyed: 0,
  enemiesSpawned: 0,
  player: { x: 360, y: 488, width: 48, height: 58, invincible: 0 },
  enemies: [],
  playerBullets: [],
  enemyBullets: [],
  blasts: [],
};

const levels = Array.from({ length: 10 }, (_, index) => {
  const level = index + 1;
  return {
    enemies: 7 + level * 3,
    maxActive: Math.min(3 + Math.floor(level / 2), 8),
    enemyHp: 1 + Math.floor((level - 1) / 3),
    enemySpeed: 36 + level * 8,
    enemyFireEvery: Math.max(520, 1700 - level * 95),
    enemyBulletSpeed: 150 + level * 18,
    spawnEvery: Math.max(360, 950 - level * 52),
    enemyScore: 80 + level * 20,
  };
});

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * scale);
  canvas.height = Math.round(rect.height * scale);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  state.player.y = rect.height - 64;
  state.player.x = clamp(state.player.x, 30, rect.width - 30);
}

function width() {
  return canvas.getBoundingClientRect().width;
}

function height() {
  return canvas.getBoundingClientRect().height;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function currentLevel() {
  return levels[state.level - 1];
}

function updateHud() {
  const config = currentLevel();
  levelText.textContent = `${state.level} / 10`;
  scoreText.textContent = state.score;
  livesText.textContent = state.lives;
  targetText.textContent = `${state.enemiesDestroyed} / ${config.enemies}`;
}

function showOverlay(title, text, buttonText = "开始游戏") {
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  startButton.textContent = buttonText;
  overlay.hidden = false;
}

function hideOverlay() {
  overlay.hidden = true;
}

function resetLevelCounters() {
  state.enemySpawnTimer = 0;
  state.playerFireTimer = 0;
  state.enemiesDestroyed = 0;
  state.enemiesSpawned = 0;
  state.enemies = [];
  state.playerBullets = [];
  state.enemyBullets = [];
  state.blasts = [];
}

function resetGame() {
  state.level = 1;
  state.score = 0;
  state.lives = 3;
  state.running = false;
  state.paused = false;
  state.won = false;
  state.lost = false;
  state.player.invincible = 0;
  resetLevelCounters();
  pauseButton.textContent = "暂停";
  updateHud();
  draw();
}

function startGame() {
  if (state.won || state.lost) resetGame();
  state.running = true;
  state.paused = false;
  state.lastTime = performance.now();
  pauseButton.textContent = "暂停";
  hideOverlay();
  requestAnimationFrame(loop);
}

function nextLevel() {
  state.level += 1;
  if (state.level > 10) {
    state.running = false;
    state.won = true;
    showOverlay("通关成功", `最终得分 ${state.score}。十关全部清空，漂亮。`, "再玩一次");
    return;
  }

  resetLevelCounters();
  state.lives = Math.min(5, state.lives + 1);
  state.player.invincible = 1200;
  updateHud();
  state.running = false;
  showOverlay(`第 ${state.level} 关`, "敌机会更多，子弹也更密。保持移动，别停在弹道正下方。", "继续");
}

function loseLife() {
  if (state.player.invincible > 0) return;
  state.lives -= 1;
  state.player.invincible = 1500;
  state.enemyBullets = [];
  addBlast(state.player.x, state.player.y, "#ef5b4f", 15);
  if (state.lives <= 0) {
    state.running = false;
    state.lost = true;
    showOverlay("任务失败", `你停在第 ${state.level} 关，得分 ${state.score}。`, "重新开始");
  }
  updateHud();
}

function spawnEnemy() {
  const config = currentLevel();
  const laneCount = Math.min(5 + Math.floor(state.level / 2), 9);
  const laneWidth = width() / laneCount;
  const lane = state.enemiesSpawned % laneCount;
  const jitter = (Math.random() - 0.5) * laneWidth * 0.44;
  const x = laneWidth * lane + laneWidth / 2 + jitter;
  const type = state.level >= 7 && Math.random() > 0.72 ? "heavy" : "fighter";
  state.enemies.push({
    x,
    y: -42,
    width: type === "heavy" ? 50 : 42,
    height: type === "heavy" ? 44 : 38,
    hp: config.enemyHp + (type === "heavy" ? 1 : 0),
    type,
    speed: config.enemySpeed * (type === "heavy" ? 0.72 : 1),
    phase: Math.random() * Math.PI * 2,
    fireTimer: 350 + Math.random() * config.enemyFireEvery,
  });
  state.enemiesSpawned += 1;
}

function firePlayerBullet() {
  state.playerBullets.push({
    x: state.player.x - 10,
    y: state.player.y - 30,
    width: 5,
    height: 17,
    speed: 430,
  });
  state.playerBullets.push({
    x: state.player.x + 10,
    y: state.player.y - 30,
    width: 5,
    height: 17,
    speed: 430,
  });
}

function fireEnemyBullet(enemy) {
  const config = currentLevel();
  state.enemyBullets.push({
    x: enemy.x,
    y: enemy.y + enemy.height / 2,
    width: 7,
    height: 16,
    speed: config.enemyBulletSpeed,
    drift: Math.sign(state.player.x - enemy.x) * Math.min(46, state.level * 7),
  });
}

function addBlast(x, y, color, count) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 35 + Math.random() * 120;
    state.blasts.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 320 + Math.random() * 260,
      maxLife: 580,
      color,
    });
  }
}

function rectsHit(a, b) {
  return (
    Math.abs(a.x - b.x) * 2 < a.width + b.width &&
    Math.abs(a.y - b.y) * 2 < a.height + b.height
  );
}

function update(delta) {
  const config = currentLevel();
  state.starShift += delta * (0.035 + state.level * 0.004);
  state.player.invincible = Math.max(0, state.player.invincible - delta);

  state.playerFireTimer += delta;
  while (state.playerFireTimer >= PLAYER_FIRE_MS) {
    state.playerFireTimer -= PLAYER_FIRE_MS;
    firePlayerBullet();
  }

  state.enemySpawnTimer += delta;
  while (
    state.enemySpawnTimer >= config.spawnEvery &&
    state.enemiesSpawned < config.enemies &&
    state.enemies.length < config.maxActive
  ) {
    state.enemySpawnTimer -= config.spawnEvery;
    spawnEnemy();
  }

  for (const bullet of state.playerBullets) {
    bullet.y -= (bullet.speed * delta) / 1000;
  }

  for (const bullet of state.enemyBullets) {
    bullet.y += (bullet.speed * delta) / 1000;
    bullet.x += (bullet.drift * delta) / 1000;
  }

  for (const enemy of state.enemies) {
    enemy.y += (enemy.speed * delta) / 1000;
    enemy.phase += delta / 360;
    enemy.x += Math.sin(enemy.phase) * (20 + state.level * 2) * (delta / 1000);
    enemy.fireTimer -= delta;
    if (enemy.fireTimer <= 0 && enemy.y > 24) {
      fireEnemyBullet(enemy);
      enemy.fireTimer = config.enemyFireEvery * (0.72 + Math.random() * 0.65);
    }
  }

  for (const blast of state.blasts) {
    blast.x += (blast.vx * delta) / 1000;
    blast.y += (blast.vy * delta) / 1000;
    blast.life -= delta;
  }

  state.playerBullets = state.playerBullets.filter((bullet) => bullet.y > -30);
  state.enemyBullets = state.enemyBullets.filter((bullet) => bullet.y < height() + 30);
  state.blasts = state.blasts.filter((blast) => blast.life > 0);

  resolveBulletHits();
  resolvePlayerHits();
  removeEscapedEnemies();

  if (
    state.enemiesDestroyed >= config.enemies &&
    state.enemies.length === 0 &&
    state.enemiesSpawned >= config.enemies
  ) {
    nextLevel();
  }
}

function resolveBulletHits() {
  const remainingBullets = [];
  for (const bullet of state.playerBullets) {
    let hit = false;
    for (const enemy of state.enemies) {
      if (rectsHit(bullet, enemy)) {
        enemy.hp -= 1;
        hit = true;
        addBlast(bullet.x, bullet.y, "#f2c84b", 4);
        if (enemy.hp <= 0) {
          enemy.dead = true;
          state.score += currentLevel().enemyScore;
          state.enemiesDestroyed += 1;
          addBlast(enemy.x, enemy.y, "#ff8a3d", 16);
          updateHud();
        }
        break;
      }
    }
    if (!hit) remainingBullets.push(bullet);
  }
  state.playerBullets = remainingBullets;
  state.enemies = state.enemies.filter((enemy) => !enemy.dead);
}

function resolvePlayerHits() {
  const playerRect = {
    x: state.player.x,
    y: state.player.y,
    width: 34,
    height: 42,
  };

  state.enemyBullets = state.enemyBullets.filter((bullet) => {
    if (rectsHit(playerRect, bullet)) {
      loseLife();
      return false;
    }
    return true;
  });

  state.enemies = state.enemies.filter((enemy) => {
    if (rectsHit(playerRect, enemy)) {
      enemy.dead = true;
      state.enemiesDestroyed += 1;
      addBlast(enemy.x, enemy.y, "#ff8a3d", 14);
      loseLife();
      updateHud();
      return false;
    }
    return true;
  });
}

function removeEscapedEnemies() {
  state.enemies = state.enemies.filter((enemy) => {
    if (enemy.y > height() + 45) {
      state.enemiesDestroyed += 1;
      loseLife();
      updateHud();
      return false;
    }
    return true;
  });
}

function drawBackground() {
  const w = width();
  const h = height();
  ctx.fillStyle = "#091524";
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "#1b3553";
  for (let i = 0; i < 90; i += 1) {
    const x = (i * 71) % w;
    const y = (i * 137 + state.starShift * (1 + (i % 3) * 0.55)) % h;
    const size = i % 8 === 0 ? 2 : 1;
    ctx.fillRect(x, y, size, size);
  }

  ctx.strokeStyle = "rgba(80, 128, 178, 0.18)";
  ctx.lineWidth = 1;
  for (let y = (state.starShift * 0.6) % 42; y < h; y += 42) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

function drawPlayer() {
  const ship = state.player;
  const flicker = ship.invincible > 0 && Math.floor(ship.invincible / 90) % 2 === 0;
  if (flicker) return;

  ctx.save();
  ctx.translate(ship.x, ship.y);

  ctx.fillStyle = "#e9f4ff";
  ctx.beginPath();
  ctx.moveTo(0, -34);
  ctx.lineTo(18, 26);
  ctx.lineTo(0, 14);
  ctx.lineTo(-18, 26);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#3fb4ff";
  ctx.beginPath();
  ctx.moveTo(0, -20);
  ctx.lineTo(8, 8);
  ctx.lineTo(0, 15);
  ctx.lineTo(-8, 8);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#ef5b4f";
  ctx.fillRect(-30, 5, 18, 10);
  ctx.fillRect(12, 5, 18, 10);

  ctx.fillStyle = "#f2c84b";
  ctx.beginPath();
  ctx.moveTo(-8, 28);
  ctx.lineTo(0, 42);
  ctx.lineTo(8, 28);
  ctx.fill();
  ctx.restore();
}

function drawEnemy(enemy) {
  ctx.save();
  ctx.translate(enemy.x, enemy.y);
  ctx.fillStyle = enemy.type === "heavy" ? "#b664ff" : "#ef5b4f";
  ctx.beginPath();
  ctx.moveTo(0, 24);
  ctx.lineTo(22, -14);
  ctx.lineTo(9, -5);
  ctx.lineTo(0, -24);
  ctx.lineTo(-9, -5);
  ctx.lineTo(-22, -14);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#0b1320";
  ctx.fillRect(-7, -6, 14, 13);
  ctx.fillStyle = "#f2c84b";
  ctx.fillRect(-18, 5, 7, 7);
  ctx.fillRect(11, 5, 7, 7);
  ctx.restore();
}

function drawBullet(bullet, color) {
  ctx.fillStyle = color;
  ctx.fillRect(
    bullet.x - bullet.width / 2,
    bullet.y - bullet.height / 2,
    bullet.width,
    bullet.height,
  );
}

function drawBlasts() {
  for (const blast of state.blasts) {
    ctx.globalAlpha = clamp(blast.life / blast.maxLife, 0, 1);
    ctx.fillStyle = blast.color;
    ctx.fillRect(blast.x - 2, blast.y - 2, 4, 4);
  }
  ctx.globalAlpha = 1;
}

function drawProgress() {
  const config = currentLevel();
  const progress = clamp(state.enemiesDestroyed / config.enemies, 0, 1);
  ctx.fillStyle = "rgba(238, 246, 255, 0.15)";
  ctx.fillRect(16, 16, width() - 32, 8);
  ctx.fillStyle = "#f2c84b";
  ctx.fillRect(16, 16, (width() - 32) * progress, 8);
}

function draw() {
  drawBackground();
  drawProgress();
  for (const bullet of state.playerBullets) drawBullet(bullet, "#f2c84b");
  for (const bullet of state.enemyBullets) drawBullet(bullet, "#ff665c");
  for (const enemy of state.enemies) drawEnemy(enemy);
  drawPlayer();
  drawBlasts();
}

function loop(now) {
  if (!state.running || state.paused) return;
  const delta = Math.min(now - state.lastTime, 34);
  state.lastTime = now;
  update(delta);
  draw();
  if (state.running) requestAnimationFrame(loop);
}

function movePlayer(clientX) {
  const rect = canvas.getBoundingClientRect();
  state.player.x = clamp(clientX - rect.left, 28, rect.width - 28);
  if (!state.running) draw();
}

canvas.addEventListener("mousemove", (event) => movePlayer(event.clientX));
canvas.addEventListener(
  "touchmove",
  (event) => {
    event.preventDefault();
    movePlayer(event.touches[0].clientX);
  },
  { passive: false },
);

startButton.addEventListener("click", startGame);

restartButton.addEventListener("click", () => {
  resetGame();
  showOverlay("复古空战十关", "鼠标左右移动控制战机，战机会自动射击。躲开敌方子弹，消灭所有敌机。", "开始游戏");
});

pauseButton.addEventListener("click", () => {
  if (!state.running) return;
  state.paused = !state.paused;
  pauseButton.textContent = state.paused ? "继续" : "暂停";
  if (state.paused) {
    showOverlay("已暂停", "继续后战机从当前位置恢复作战。", "继续");
  } else {
    hideOverlay();
    state.lastTime = performance.now();
    requestAnimationFrame(loop);
  }
});

window.addEventListener("resize", () => {
  resizeCanvas();
  draw();
});

resizeCanvas();
resetGame();
showOverlay("复古空战十关", "鼠标左右移动控制战机，战机会自动射击。躲开敌方子弹，消灭所有敌机。", "开始游戏");
