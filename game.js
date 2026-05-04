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

const state = {
  level: 1,
  score: 0,
  levelScore: 0,
  lives: 3,
  target: 6,
  running: false,
  paused: false,
  won: false,
  lost: false,
  lastTime: 0,
  spawnTimer: 0,
  nectarTimer: 0,
  player: { x: 360, y: 444, width: 62, height: 50 },
  hazards: [],
  nectars: [],
  sparks: [],
};

const levels = Array.from({ length: 10 }, (_, index) => {
  const level = index + 1;
  return {
    target: 5 + level,
    hazardEvery: Math.max(360, 1180 - level * 76),
    nectarEvery: Math.max(520, 950 - level * 28),
    hazardSpeed: 120 + level * 22,
    nectarSpeed: 95 + level * 12,
    lanes: Math.min(5 + Math.floor(level / 2), 9),
    webChance: Math.min(0.08 + level * 0.035, 0.34),
    waspChance: Math.min(0.02 + level * 0.03, 0.28),
  };
});

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * scale);
  canvas.height = Math.round(rect.height * scale);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  state.player.y = rect.height - 76;
  state.player.x = clamp(state.player.x, 34, rect.width - 34);
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
  levelText.textContent = `${state.level} / 10`;
  scoreText.textContent = state.score;
  livesText.textContent = state.lives;
  targetText.textContent = `${state.levelScore} / ${state.target}`;
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

function resetGame() {
  state.level = 1;
  state.score = 0;
  state.levelScore = 0;
  state.lives = 3;
  state.target = levels[0].target;
  state.running = false;
  state.paused = false;
  state.won = false;
  state.lost = false;
  state.spawnTimer = 0;
  state.nectarTimer = 0;
  state.hazards = [];
  state.nectars = [];
  state.sparks = [];
  pauseButton.textContent = "暂停";
  updateHud();
  draw();
}

function startGame() {
  if (state.won || state.lost) {
    resetGame();
  }
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
    showOverlay("通关成功", `你收集了 ${state.score} 份花蜜，蜂巢今晚很热闹。`, "再玩一次");
    return;
  }
  state.target = currentLevel().target;
  state.levelScore = 0;
  state.lives = Math.min(5, state.lives + 1);
  state.hazards = [];
  state.nectars = [];
  state.spawnTimer = 0;
  state.nectarTimer = 0;
  updateHud();
  showOverlay(`第 ${state.level} 关`, "速度更快，陷阱更多。保持横向移动，别贪每一滴花蜜。", "继续");
  state.running = false;
}

function loseLife() {
  state.lives -= 1;
  state.sparks.push({ x: state.player.x, y: state.player.y, life: 420, color: "#b63d32" });
  if (state.lives <= 0) {
    state.running = false;
    state.lost = true;
    showOverlay("挑战失败", `你停在第 ${state.level} 关，已经收集 ${state.score} 份花蜜。`, "重新开始");
  }
  updateHud();
}

function spawnHazard() {
  const config = currentLevel();
  const laneWidth = width() / config.lanes;
  const lane = Math.floor(Math.random() * config.lanes);
  const kindRoll = Math.random();
  let type = "drop";
  if (kindRoll < config.waspChance) type = "wasp";
  else if (kindRoll < config.waspChance + config.webChance) type = "web";
  state.hazards.push({
    type,
    x: lane * laneWidth + laneWidth * (0.25 + Math.random() * 0.5),
    y: -44,
    radius: type === "web" ? 25 : type === "wasp" ? 22 : 18,
    speed: config.hazardSpeed * (type === "web" ? 0.72 : type === "wasp" ? 1.15 : 1),
    drift: type === "wasp" ? (Math.random() > 0.5 ? 1 : -1) * (35 + state.level * 7) : 0,
    phase: Math.random() * Math.PI * 2,
  });
}

function spawnNectar() {
  const margin = 38;
  state.nectars.push({
    x: margin + Math.random() * (width() - margin * 2),
    y: -34,
    radius: 15,
    speed: currentLevel().nectarSpeed,
    spin: Math.random() * Math.PI,
  });
}

function rectCircleHit(rect, circle) {
  const nearestX = clamp(circle.x, rect.x - rect.width / 2, rect.x + rect.width / 2);
  const nearestY = clamp(circle.y, rect.y - rect.height / 2, rect.y + rect.height / 2);
  const dx = circle.x - nearestX;
  const dy = circle.y - nearestY;
  return dx * dx + dy * dy <= circle.radius * circle.radius;
}

function update(delta) {
  const config = currentLevel();
  state.spawnTimer += delta;
  state.nectarTimer += delta;

  while (state.spawnTimer > config.hazardEvery) {
    state.spawnTimer -= config.hazardEvery;
    spawnHazard();
  }

  while (state.nectarTimer > config.nectarEvery) {
    state.nectarTimer -= config.nectarEvery;
    spawnNectar();
  }

  for (const hazard of state.hazards) {
    hazard.y += (hazard.speed * delta) / 1000;
    hazard.phase += delta / 280;
    hazard.x += Math.sin(hazard.phase) * hazard.drift * (delta / 1000);
  }

  for (const nectar of state.nectars) {
    nectar.y += (nectar.speed * delta) / 1000;
    nectar.spin += delta / 240;
  }

  for (const spark of state.sparks) {
    spark.life -= delta;
    spark.y -= delta * 0.045;
  }

  state.sparks = state.sparks.filter((spark) => spark.life > 0);
  state.hazards = state.hazards.filter((hazard) => {
    if (rectCircleHit(state.player, hazard)) {
      loseLife();
      return false;
    }
    return hazard.y < height() + 60;
  });

  state.nectars = state.nectars.filter((nectar) => {
    if (rectCircleHit(state.player, nectar)) {
      state.score += 1;
      state.levelScore += 1;
      state.sparks.push({ x: nectar.x, y: nectar.y, life: 360, color: "#d48a00" });
      if (state.levelScore >= state.target) nextLevel();
      updateHud();
      return false;
    }
    return nectar.y < height() + 44;
  });
}

function drawSky() {
  const w = width();
  const h = height();
  ctx.fillStyle = "#dff4ff";
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "#ffffff";
  for (let i = 0; i < 5; i += 1) {
    const x = ((i * 173 + state.level * 19) % (w + 120)) - 60;
    const y = 48 + i * 44;
    ctx.beginPath();
    ctx.ellipse(x, y, 34, 14, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 26, y + 4, 28, 12, 0, 0, Math.PI * 2);
    ctx.ellipse(x - 24, y + 5, 24, 10, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#397a4f";
  ctx.fillRect(0, h - 26, w, 26);
  ctx.fillStyle = "#4d9a63";
  for (let x = -20; x < w + 20; x += 22) {
    ctx.beginPath();
    ctx.moveTo(x, h - 26);
    ctx.quadraticCurveTo(x + 8, h - 58, x + 18, h - 26);
    ctx.fill();
  }
}

function drawBee() {
  const bee = state.player;
  ctx.save();
  ctx.translate(bee.x, bee.y);

  ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
  ctx.beginPath();
  ctx.ellipse(-17, -16, 22, 11, -0.45, 0, Math.PI * 2);
  ctx.ellipse(17, -16, 22, 11, 0.45, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#f2b51d";
  ctx.beginPath();
  ctx.ellipse(0, 0, 31, 23, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#1d2430";
  for (const stripe of [-12, 4, 20]) {
    ctx.fillRect(stripe, -21, 8, 42);
  }

  ctx.fillStyle = "#1d2430";
  ctx.beginPath();
  ctx.arc(-12, -5, 3, 0, Math.PI * 2);
  ctx.arc(12, -5, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#1d2430";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-10, -22);
  ctx.quadraticCurveTo(-18, -37, -27, -30);
  ctx.moveTo(10, -22);
  ctx.quadraticCurveTo(18, -37, 27, -30);
  ctx.stroke();

  ctx.restore();
}

function drawHazard(hazard) {
  ctx.save();
  ctx.translate(hazard.x, hazard.y);

  if (hazard.type === "web") {
    ctx.strokeStyle = "#6f7f92";
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i += 1) {
      const angle = (Math.PI * 2 * i) / 8;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(angle) * 25, Math.sin(angle) * 25);
      ctx.stroke();
    }
    for (const radius of [8, 16, 24]) {
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (hazard.type === "wasp") {
    ctx.fillStyle = "#1f2937";
    ctx.beginPath();
    ctx.ellipse(0, 0, 24, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f0c33c";
    ctx.fillRect(-12, -13, 6, 26);
    ctx.fillRect(2, -14, 6, 28);
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.beginPath();
    ctx.ellipse(-8, -15, 15, 7, -0.45, 0, Math.PI * 2);
    ctx.ellipse(12, -15, 15, 7, 0.45, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = "#3386bd";
    ctx.beginPath();
    ctx.moveTo(0, -22);
    ctx.bezierCurveTo(20, 2, 12, 25, 0, 25);
    ctx.bezierCurveTo(-12, 25, -20, 2, 0, -22);
    ctx.fill();
  }

  ctx.restore();
}

function drawNectar(nectar) {
  ctx.save();
  ctx.translate(nectar.x, nectar.y);
  ctx.rotate(Math.sin(nectar.spin) * 0.25);
  ctx.fillStyle = "#d48a00";
  ctx.beginPath();
  ctx.moveTo(0, -18);
  ctx.bezierCurveTo(16, -8, 15, 13, 0, 20);
  ctx.bezierCurveTo(-15, 13, -16, -8, 0, -18);
  ctx.fill();
  ctx.fillStyle = "#fff2b8";
  ctx.beginPath();
  ctx.arc(-4, -5, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawProgress() {
  const w = width();
  const progress = clamp(state.levelScore / state.target, 0, 1);
  ctx.fillStyle = "rgba(255, 255, 255, 0.72)";
  ctx.fillRect(16, 16, w - 32, 10);
  ctx.fillStyle = "#d48a00";
  ctx.fillRect(16, 16, (w - 32) * progress, 10);
}

function drawSparks() {
  for (const spark of state.sparks) {
    ctx.globalAlpha = clamp(spark.life / 360, 0, 1);
    ctx.fillStyle = spark.color;
    ctx.beginPath();
    ctx.arc(spark.x, spark.y, 5 + spark.life / 90, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function draw() {
  drawSky();
  drawProgress();
  for (const nectar of state.nectars) drawNectar(nectar);
  for (const hazard of state.hazards) drawHazard(hazard);
  drawBee();
  drawSparks();
}

function loop(now) {
  if (!state.running || state.paused) return;
  const delta = Math.min(now - state.lastTime, 32);
  state.lastTime = now;
  update(delta);
  draw();
  if (state.running) requestAnimationFrame(loop);
}

function movePlayer(clientX) {
  const rect = canvas.getBoundingClientRect();
  state.player.x = clamp(clientX - rect.left, 34, rect.width - 34);
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
  showOverlay("小蜜蜂十关冒险", "横向移动鼠标控制小蜜蜂，接住花蜜，避开雨滴、蜘蛛网和黄蜂。", "开始游戏");
});

pauseButton.addEventListener("click", () => {
  if (!state.running) return;
  state.paused = !state.paused;
  pauseButton.textContent = state.paused ? "继续" : "暂停";
  if (state.paused) {
    showOverlay("已暂停", "休息一下，继续时小蜜蜂会从当前位置出发。", "继续");
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
showOverlay("小蜜蜂十关冒险", "横向移动鼠标控制小蜜蜂，接住花蜜，避开雨滴、蜘蛛网和黄蜂。", "开始游戏");
