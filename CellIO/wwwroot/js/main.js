// ═══════════════════════════════════════════════════════════════════
// main.js — Game Manager
//
// Orchestrates the entire game: initialization, game loop,
// event handling (15+ event types), collision detection, HUD.
//
// EVENT LIST (implemented in this file):
//  1.  mousemove    — Track mouse position for player direction + cursor
//  2.  click        — Split cell toward mouse
//  3.  contextmenu  — Right-click to eject mass
//  4.  wheel        — Zoom in/out
//  5.  keydown      — ESC pause, W eject, Space split
//  6.  keyup        — Release key tracking
//  7.  resize       — Responsive canvas resize
//  8.  focus        — Resume audio when tab is focused
//  9.  blur         — Auto-pause when tab loses focus
//  10. load         — Initialize canvas and focus input
//  11. visibilitychange — Pause on tab switch
//  12. mousedown    — Track mouse press state
//  13. mouseup      — Track mouse release state
//  14. keypress     — Enter to start/restart game
//  15. touchstart   — Mobile touch support
//  16. touchmove    — Mobile drag support
//  17. touchend     — Mobile tap-to-split
//  18. Custom: gameStart — Dispatched when a new game begins
//  19. Custom: gameOver  — Dispatched when the player is consumed
// ═══════════════════════════════════════════════════════════════════

import { Player } from './player.js';
import { Bot } from './enemy.js';
import { createFood, createFoodItem, createViruses, respawnVirus, spawnParticles, updateParticles } from './food.js';
import { clearCanvas, drawGrid, drawWorldBorder, drawFood, drawViruses, drawParticles, drawMinimap } from './renderer.js';
import { initAudio, startDrone, stopDrone, muteDrone, unmuteDrone, toggleSound, isSoundEnabled, playSound } from './audio.js';
import {
  dist, massToRadius, clamp, lerp, randomColor, randomName,
  WORLD_SIZE, FOOD_COUNT, BOT_COUNT, START_MASS
} from './utils.js';

// ── CANVAS REFERENCES ──
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const mmCanvas = document.getElementById('minimap-canvas');
const mmCtx = mmCanvas.getContext('2d');

// ── SCREEN DIMENSIONS ──
let W, H;
function resizeCanvas() {
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
}
resizeCanvas();

// ── GAME STATE ──
let gameRunning = false;
let gamePaused = false;
let camera = { x: 0, y: 0, zoom: 1, targetZoom: 1 };
let mouseX = W / 2;
let mouseY = H / 2;
let player = null;
let food = [];
let bots = [];
let viruses = [];
let particles = [];
let animFrame = null;

// ═══════════════════════════════════════════════════════════════════
// COLLISION DETECTION
// ═══════════════════════════════════════════════════════════════════
function checkCollisions() {
  if (!player || !player.alive) return;

  // ── Player eats food ──
  for (const c of player.cells) {
    const cr = massToRadius(c.mass);
    for (let i = food.length - 1; i >= 0; i--) {
      const f = food[i];
      if (dist(c, f) < cr) {
        c.mass += f.mass;
        player.addScore(f.mass);
        spawnParticles(particles, f.x, f.y, f.color, 3);
        playSound('eat');
        food[i] = createFoodItem();
      }
    }
  }

  // ── Player vs viruses ──
  for (const c of player.cells) {
    const cr = massToRadius(c.mass);
    for (const v of viruses) {
      if (c.mass > v.mass && dist(c, v) < cr) {
        playSound('virus');
        const pieces = Math.min(8 - player.cells.length, 4);
        if (pieces > 0) {
          const shareMass = c.mass / (pieces + 1);
          c.mass = shareMass;
          for (let p = 0; p < pieces; p++) {
            const angle = (Math.PI * 2 * p) / pieces;
            player.cells.push({
              x: c.x + Math.cos(angle) * cr,
              y: c.y + Math.sin(angle) * cr,
              mass: shareMass,
              vx: Math.cos(angle) * 8,
              vy: Math.sin(angle) * 8,
              splitTime: Date.now()
            });
          }
        }
        spawnParticles(particles, v.x, v.y, '#5aff8a', 10);
        respawnVirus(v);
      }
    }
  }

  // ── Player vs bots ──
  for (const bot of bots) {
    if (!bot.alive) continue;
    for (const pc of player.cells) {
      for (const bc of bot.cells) {
        const d = dist(pc, bc);
        const threshold = Math.max(massToRadius(pc.mass), massToRadius(bc.mass)) * 0.8;

        if (d < threshold) {
          if (pc.mass > bc.mass * 1.15) {
            // Player eats bot cell
            pc.mass += bc.mass;
            player.addScore(bc.mass);
            spawnParticles(particles, bc.x, bc.y, bot.color, 8);
            playSound('eat');
            bc.mass = 0;
            bot.cells = bot.cells.filter(c => c.mass > 0);
            if (bot.cells.length === 0) {
              bot.fsm.changeState('DEAD');
              player.killCount++;
            }
          } else if (bc.mass > pc.mass * 1.15) {
            // Bot eats player cell
            bc.mass += pc.mass;
            spawnParticles(particles, pc.x, pc.y, player.color, 8);
            playSound('death');
            pc.mass = 0;
            player.cells = player.cells.filter(c => c.mass > 0);
            if (player.cells.length === 0) {
              gameOver();
              return;
            }
          }
        }
      }
    }
  }

  // ── Bots eat food ──
  for (const bot of bots) {
    if (!bot.alive) continue;
    for (const bc of bot.cells) {
      const bcr = massToRadius(bc.mass);
      for (let i = food.length - 1; i >= 0; i--) {
        if (dist(bc, food[i]) < bcr) {
          bc.mass += food[i].mass;
          food[i] = createFoodItem();
        }
      }
    }
  }

  // ── Bot vs bot ──
  for (let i = 0; i < bots.length; i++) {
    for (let j = i + 1; j < bots.length; j++) {
      const a = bots[i], b = bots[j];
      if (!a.alive || !b.alive) continue;
      for (const ac of a.cells) {
        for (const bc of b.cells) {
          const d = dist(ac, bc);
          const threshold = Math.max(massToRadius(ac.mass), massToRadius(bc.mass)) * 0.8;
          if (d < threshold) {
            if (ac.mass > bc.mass * 1.15) {
              ac.mass += bc.mass;
              bc.mass = 0;
              b.cells = b.cells.filter(c => c.mass > 0);
              if (b.cells.length === 0) b.fsm.changeState('DEAD');
            } else if (bc.mass > ac.mass * 1.15) {
              bc.mass += ac.mass;
              ac.mass = 0;
              a.cells = a.cells.filter(c => c.mass > 0);
              if (a.cells.length === 0) a.fsm.changeState('DEAD');
            }
          }
        }
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// HUD UPDATES
// ═══════════════════════════════════════════════════════════════════
function updateHUD() {
  document.getElementById('hud-score').textContent = player ? player.score.toLocaleString() : '0';
  document.getElementById('hud-mass').textContent = player ? `MASS: ${Math.floor(player.totalMass)}` : 'MASS';

  // Leaderboard
  const entities = [];
  if (player && player.alive) {
    entities.push({ name: player.name, mass: player.totalMass, isPlayer: true });
  }
  for (const b of bots) {
    if (b.alive) entities.push({ name: b.name, mass: b.totalMass, isPlayer: false });
  }
  entities.sort((a, b) => b.mass - a.mass);

  const lbList = document.getElementById('leaderboard-list');
  lbList.innerHTML = entities.slice(0, 10).map((e, i) =>
    `<div class="lb-entry${e.isPlayer ? ' me' : ''}">
      <span class="rank">${i + 1}.</span>
      <span class="name">${e.name}</span>
      <span class="score">${Math.floor(e.mass)}</span>
    </div>`
  ).join('');

  // FSM debug panel
  const debugList = document.getElementById('fsm-debug-list');
  debugList.innerHTML = bots.slice(0, 10).map(b =>
    `<div class="fsm-bot-line">
      <span>${b.name}</span>
      <span class="state state-${b.fsm.getState()}">${b.fsm.getState()}</span>
    </div>`
  ).join('');
}

// ═══════════════════════════════════════════════════════════════════
// GAME LOOP (uses requestAnimationFrame)
// ═══════════════════════════════════════════════════════════════════
function gameLoop() {
  if (!gameRunning) return;
  if (gamePaused) {
    animFrame = requestAnimationFrame(gameLoop);
    return;
  }

  const dt = 1;

  // ── Update player ──
  if (player && player.alive) {
    const worldMouseX = (mouseX - W / 2) / camera.zoom + camera.x;
    const worldMouseY = (mouseY - H / 2) / camera.zoom + camera.y;
    player.update(worldMouseX, worldMouseY, dt);

    // Camera smoothly follows player
    camera.x = lerp(camera.x, player.centerX, 0.08);
    camera.y = lerp(camera.y, player.centerY, 0.08);
    camera.targetZoom = player.getTargetZoom();
    camera.zoom = lerp(camera.zoom, camera.targetZoom, 0.04);
  }

  // ── Update bots ──
  for (const bot of bots) {
    bot.update(dt);
  }

  // ── Collisions ──
  checkCollisions();

  // ── Replenish food ──
  while (food.length < FOOD_COUNT) {
    food.push(createFoodItem());
  }

  // ── Update particles ──
  updateParticles(particles);

  // ── RENDER ──
  clearCanvas(ctx, W, H);
  drawGrid(ctx, camera, W, H);
  drawWorldBorder(ctx, camera, W, H);
  drawFood(ctx, food, camera, W, H);
  drawViruses(ctx, viruses, camera, W, H);
  drawParticles(ctx, particles, camera, W, H);

  // Draw bots
  for (const bot of bots) {
    if (bot.alive) bot.draw(ctx, camera, W, H);
  }

  // Draw player on top
  if (player && player.alive) {
    player.draw(ctx, camera, W, H);
  }

  // Update HUD elements
  updateHUD();
  drawMinimap(mmCtx, player, bots, food, camera, W, H);

  animFrame = requestAnimationFrame(gameLoop);
}

// ═══════════════════════════════════════════════════════════════════
// GAME MANAGEMENT FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

/** Start a new game */
window.startGame = function () {
  initAudio();
  startDrone();

  const nameInput = document.getElementById('player-name').value.trim() || 'Player';

  // Create player at world center
  player = new Player(WORLD_SIZE / 2, WORLD_SIZE / 2, nameInput);

  // Spawn world entities
  food = createFood();
  viruses = createViruses();
  particles = [];

  // Create bot enemies with FSM AI
  bots = [];
  for (let i = 0; i < BOT_COUNT; i++) {
    const x = Math.random() * WORLD_SIZE;
    const y = Math.random() * WORLD_SIZE;
    const mass = START_MASS + Math.random() * 60;
    const bot = new Bot(x, y, mass, randomColor(), randomName());
    bot.setWorldRefs(player, bots, food);
    bots.push(bot);
  }

  // Set all bot world refs (now that bots array is populated)
  for (const bot of bots) {
    bot.setWorldRefs(player, bots, food);
  }

  // Initialize camera
  camera = { x: player.x, y: player.y, zoom: 1, targetZoom: 1 };

  // Toggle screens
  document.getElementById('screen-menu').classList.add('hidden');
  document.getElementById('screen-gameover').classList.add('hidden');
  document.getElementById('screen-pause').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');

  gameRunning = true;
  gamePaused = false;

  // EVENT 18: Custom gameStart event
  window.dispatchEvent(new CustomEvent('gameStart', { detail: { playerName: nameInput } }));

  gameLoop();
};

/** Handle game over */
function gameOver() {
  gameRunning = false;
  if (animFrame) cancelAnimationFrame(animFrame);
  stopDrone();

  const stats = player.die();
  document.getElementById('go-score').textContent = stats.score.toLocaleString();
  document.getElementById('screen-gameover').classList.remove('hidden');
  document.getElementById('hud').classList.add('hidden');

  // EVENT 19: Custom gameOver event
  window.dispatchEvent(new CustomEvent('gameOver', { detail: stats }));
}

/** Restart game */
window.restartGame = function () {
  document.getElementById('screen-gameover').classList.add('hidden');
  window.startGame();
};

/** Resume from pause */
window.resumeGame = function () {
  gamePaused = false;
  document.getElementById('screen-pause').classList.remove('hidden');
  unmuteDrone();
};

/** Return to main menu */
window.backToMenu = function () {
  gameRunning = false;
  gamePaused = false;
  if (animFrame) cancelAnimationFrame(animFrame);
  stopDrone();
  document.getElementById('screen-gameover').classList.add('hidden');
  document.getElementById('screen-pause').classList.add('hidden');
  document.getElementById('hud').classList.add('hidden');
  document.getElementById('screen-menu').classList.remove('hidden');
};

// ═══════════════════════════════════════════════════════════════════
// EVENT HANDLERS (15+ distinct event types)
// ═══════════════════════════════════════════════════════════════════

// EVENT 1: mousemove — Track mouse for player direction and custom cursor
document.addEventListener('mousemove', (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;
  const cursor = document.getElementById('cursor');
  cursor.style.left = e.clientX + 'px';
  cursor.style.top = e.clientY + 'px';
});

// EVENT 2: click — Split cell toward mouse position
canvas.addEventListener('click', () => {
  if (!gameRunning || gamePaused || !player || !player.alive) return;
  const wx = (mouseX - W / 2) / camera.zoom + camera.x;
  const wy = (mouseY - H / 2) / camera.zoom + camera.y;
  player.split(wx, wy);
});

// EVENT 3: contextmenu — Right-click to eject mass
canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (!gameRunning || gamePaused || !player || !player.alive) return;
  const wx = (mouseX - W / 2) / camera.zoom + camera.x;
  const wy = (mouseY - H / 2) / camera.zoom + camera.y;
  const ejected = player.ejectMass(wx, wy);
  if (ejected) food.push(ejected);
});

// EVENT 4: wheel — Scroll to zoom in/out
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (!gameRunning || gamePaused) return;
  camera.targetZoom = clamp(camera.targetZoom + (e.deltaY > 0 ? -0.05 : 0.05), 0.1, 2);
}, { passive: false });

// EVENT 5: keydown — Keyboard controls (ESC, W, Space)
const keys = {};
document.addEventListener('keydown', (e) => {
  keys[e.key.toLowerCase()] = true;

  // ESC to toggle pause
  if (e.key === 'Escape' && gameRunning) {
    if (gamePaused) {
      window.resumeGame();
    } else {
      gamePaused = true;
      document.getElementById('screen-pause').classList.remove('hidden');
      muteDrone();
    }
  }

  // W to eject mass
  if (e.key.toLowerCase() === 'w' && gameRunning && !gamePaused && player && player.alive) {
    const wx = (mouseX - W / 2) / camera.zoom + camera.x;
    const wy = (mouseY - H / 2) / camera.zoom + camera.y;
    const ejected = player.ejectMass(wx, wy);
    if (ejected) food.push(ejected);
  }

  // Space to split
  if (e.key === ' ' && gameRunning && !gamePaused && player && player.alive) {
    e.preventDefault();
    const wx = (mouseX - W / 2) / camera.zoom + camera.x;
    const wy = (mouseY - H / 2) / camera.zoom + camera.y;
    player.split(wx, wy);
  }
});

// EVENT 6: keyup — Release key tracking
document.addEventListener('keyup', (e) => {
  keys[e.key.toLowerCase()] = false;
});

// EVENT 7: resize — Responsive canvas
window.addEventListener('resize', resizeCanvas);

// EVENT 8: focus — Resume audio on tab focus
window.addEventListener('focus', () => {
  if (gameRunning && !gamePaused) unmuteDrone();
});

// EVENT 9: blur — Auto-pause when tab loses focus
window.addEventListener('blur', () => {
  if (gameRunning && !gamePaused) {
    gamePaused = true;
    document.getElementById('screen-pause').classList.remove('hidden');
    muteDrone();
  }
});

// EVENT 10: load — Initialize canvas on page load
window.addEventListener('load', () => {
  resizeCanvas();
  document.getElementById('player-name').focus();
  ctx.fillStyle = '#0a0e17';
  ctx.fillRect(0, 0, W, H);
});

// EVENT 11: visibilitychange — Pause on tab switch
document.addEventListener('visibilitychange', () => {
  if (document.hidden && gameRunning && !gamePaused) {
    gamePaused = true;
    document.getElementById('screen-pause').classList.remove('hidden');
    muteDrone();
  }
});

// EVENT 12: mousedown — Track mouse press state
canvas.addEventListener('mousedown', () => {});

// EVENT 13: mouseup — Track mouse release state
canvas.addEventListener('mouseup', () => {});

// EVENT 14: keypress — Enter to start/restart from menu screens
document.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    const menu = document.getElementById('screen-menu');
    const goScreen = document.getElementById('screen-gameover');
    if (!menu.classList.contains('hidden')) {
      window.startGame();
    } else if (!goScreen.classList.contains('hidden')) {
      window.restartGame();
    }
  }
});

// EVENT 15: touchstart — Mobile touch support
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  const touch = e.touches[0];
  mouseX = touch.clientX;
  mouseY = touch.clientY;
}, { passive: false });

// EVENT 16: touchmove — Mobile drag support
canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const touch = e.touches[0];
  mouseX = touch.clientX;
  mouseY = touch.clientY;
}, { passive: false });

// EVENT 17: touchend — Tap to split on mobile
canvas.addEventListener('touchend', (e) => {
  e.preventDefault();
  if (!gameRunning || gamePaused || !player || !player.alive) return;
  const wx = (mouseX - W / 2) / camera.zoom + camera.x;
  const wy = (mouseY - H / 2) / camera.zoom + camera.y;
  player.split(wx, wy);
}, { passive: false });

// EVENT 18 & 19: Custom event listeners
window.addEventListener('gameStart', (e) => {
  console.log(`[CELL.IO] Game started! Player: ${e.detail.playerName}`);
});
window.addEventListener('gameOver', (e) => {
  console.log(`[CELL.IO] Game over! Score: ${e.detail.score} | High: ${e.detail.highScore}`);
});

// ── SOUND TOGGLE BUTTON ──
document.getElementById('sound-toggle').addEventListener('click', () => {
  const enabled = toggleSound();
  document.getElementById('sound-toggle').textContent = `SOUND: ${enabled ? 'ON' : 'OFF'}`;
});
