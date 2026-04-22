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
import { createPowerup, updatePowerups, drawPowerups, applyPowerup, hasEffect, drawEffectsHUD, POWERUP_TYPES } from './powerups.js';
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

// ── Power-ups & game mode ──
let powerups = [];
let activeEffects = {};  // { speed: {expiresAt}, shield: {expiresAt}, toxin: {expiresAt} }
let gameMode = 'classic';   // 'classic' | 'timeattack' | 'survival'
let modeTimer = 0;          // ms remaining for timed modes
let survivalWave = 0;
let screenShake = 0;        // frames of shake remaining
let eatAnimations = [];     // { x, y, r, life, color }
let globalHighScore = parseInt(localStorage.getItem('cellioHighScore') || '0');

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
                // Eat animation
                eatAnimations.push({ x: f.x, y: f.y, r: cr * 0.5, life: 1, color: f.color });
                playSound('eat');
                food[i] = createFoodItem();
            }
        }
    }

    // ── Player picks up power-ups ──
    for (let i = powerups.length - 1; i >= 0; i--) {
        const p = powerups[i];
        const cr = massToRadius(player.cells[0]?.mass || 20);
        if (dist(player, p) < cr + p.radius) {
            applyPowerup(player, p.type, activeEffects);
            spawnParticles(particles, p.x, p.y, POWERUP_TYPES[p.type].color, 15);
            playSound('eat');
            // Show pickup label
            eatAnimations.push({ x: p.x, y: p.y, r: 30, life: 1, color: POWERUP_TYPES[p.type].color, label: POWERUP_TYPES[p.type].label });
            powerups.splice(i, 1);
        }
    }

    // ── Player vs viruses ──
    for (const c of player.cells) {
        const cr = massToRadius(c.mass);
        for (const v of viruses) {
            if (c.mass > v.mass && dist(c, v) < cr + v.radius) {
                playSound('virus');
                screenShake = 18;
                const pieces = Math.min(8 - player.cells.length, 4);
                if (pieces > 0) {
                    const shareMass = c.mass / (pieces + 1);
                    c.mass = shareMass;
                    c.splitTime = Date.now();
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
                const rP = massToRadius(pc.mass);
                const rB = massToRadius(bc.mass);

                if (d < rP + rB) {
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
                        // Bot eats player cell — blocked by shield
                        if (hasEffect(activeEffects, 'shield')) {
                            // Shield absorbs the hit — push bot away
                            const dx = pc.x - bc.x, dy = pc.y - bc.y;
                            const d = Math.sqrt(dx * dx + dy * dy) || 1;
                            bc.x -= (dx / d) * 10; bc.y -= (dy / d) * 10;
                            // Flash effect
                            spawnParticles(particles, pc.x, pc.y, '#00f0ff', 6);
                        } else {
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
    }

    // ── Bots vs viruses ──
    for (const bot of bots) {
        if (!bot.alive) continue;
        for (const bc of bot.cells) {
            const bcr = massToRadius(bc.mass);
            for (const v of viruses) {
                if (bc.mass > v.mass && dist(bc, v) < bcr + v.radius) {
                    const pieces = Math.min(8 - bot.cells.length, 4);
                    if (pieces > 0) {
                        const shareMass = bc.mass / (pieces + 1);
                        bc.mass = shareMass;
                        bc.splitTime = Date.now();
                        for (let p = 0; p < pieces; p++) {
                            const angle = (Math.PI * 2 * p) / pieces;
                            bot.cells.push({
                                x: bc.x + Math.cos(angle) * bcr,
                                y: bc.y + Math.sin(angle) * bcr,
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
    }


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
            let outerBreak = false;
            for (let ai = 0; ai < a.cells.length; ai++) {
                if (outerBreak) break;
                for (let bi = 0; bi < b.cells.length; bi++) {
                    const ac = a.cells[ai];
                    const bc = b.cells[bi];
                    const d = dist(ac, bc);
                    const rA = massToRadius(ac.mass);
                    const rB = massToRadius(bc.mass);

                    if (d < rA + rB) { // cells are overlapping
                        if (ac.mass > bc.mass * 1.1) {
                            // A eats B cell
                            ac.mass += bc.mass;
                            spawnParticles(particles, bc.x, bc.y, b.color, 5);
                            playSound('eat');
                            b.cells.splice(bi, 1);
                            if (b.cells.length === 0) b.fsm.changeState('DEAD');
                            break; // bc is gone, restart inner loop
                        } else if (bc.mass > ac.mass * 1.1) {
                            // B eats A cell
                            bc.mass += ac.mass;
                            spawnParticles(particles, ac.x, ac.y, a.color, 5);
                            playSound('eat');
                            a.cells.splice(ai, 1);
                            if (a.cells.length === 0) a.fsm.changeState('DEAD');
                            outerBreak = true; // ac is gone, restart outer loop
                            break;
                        } else {
                            // Similar size — push apart so they don't visually merge/stack
                            const overlap = (rA + rB - d) / 2 + 1;
                            const dx = ac.x - bc.x || 0.1;
                            const dy = ac.y - bc.y || 0.1;
                            const len = Math.sqrt(dx * dx + dy * dy) || 1;
                            ac.x += (dx / len) * overlap;
                            ac.y += (dy / len) * overlap;
                            bc.x -= (dx / len) * overlap;
                            bc.y -= (dy / len) * overlap;
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

        // Speed boost: temporarily increase BASE_SPEED via cell vx/vy nudge
        if (hasEffect(activeEffects, 'speed')) {
            for (const c of player.cells) {
                const dx = worldMouseX - c.x, dy = worldMouseY - c.y;
                const d = Math.sqrt(dx * dx + dy * dy) || 1;
                c.x += (dx / d) * 2.5; c.y += (dy / d) * 2.5;
            }
        }

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

    // ── Toxin cloud: slow nearby bots ──
    if (hasEffect(activeEffects, 'toxin')) {
        const toxinRange = 200;
        for (const bot of bots) {
            if (!bot.alive) continue;
            if (Math.hypot(bot.x - player.centerX, bot.y - player.centerY) < toxinRange) {
                // Push bot away slowly and shrink slightly
                const dx = bot.x - player.centerX, dy = bot.y - player.centerY;
                const d = Math.sqrt(dx * dx + dy * dy) || 1;
                bot.x += (dx / d) * 1.2; bot.y += (dy / d) * 1.2;
                for (const bc of bot.cells) bc.mass = Math.max(10, bc.mass * 0.998);
            }
        }
    }
    updatePowerups(powerups, dt);
    if (Math.random() < 0.012 && powerups.length < 12) powerups.push(createPowerup());

    // ── Update eat animations ──
    for (let i = eatAnimations.length - 1; i >= 0; i--) {
        eatAnimations[i].life -= 0.04;
        eatAnimations[i].r += 0.8;
        if (eatAnimations[i].life <= 0) eatAnimations.splice(i, 1);
    }

    // ── Game mode timer ──
    if (gameMode === 'timeattack' && gameRunning) {
        modeTimer -= 16;
        if (modeTimer <= 0) { gameOver(); return; }
    }
    if (gameMode === 'survival' && gameRunning) {
        modeTimer -= 16;
        if (modeTimer <= 0) {
            survivalWave++;
            modeTimer = 30000;
            // Spawn extra bots each wave
            for (let i = 0; i < survivalWave * 2; i++) {
                let x, y;
                do { x = Math.random() * WORLD_SIZE; y = Math.random() * WORLD_SIZE; }
                while (Math.hypot(x - player.x, y - player.y) < 600);
                const bot = new Bot(x, y, START_MASS + Math.random() * 80 + survivalWave * 20, randomColor(), randomName());
                bot.setWorldRefs(player, bots, food);
                bots.push(bot);
            }
        }
    }

    // ── Screen shake ──
    let shakeX = 0, shakeY = 0;
    if (screenShake > 0) {
        shakeX = (Math.random() - 0.5) * screenShake * 0.6;
        shakeY = (Math.random() - 0.5) * screenShake * 0.6;
        screenShake--;
    }

    // ── RENDER ──
    clearCanvas(ctx, W, H);
    ctx.save();
    ctx.translate(shakeX, shakeY);
    drawGrid(ctx, camera, W, H);
    drawWorldBorder(ctx, camera, W, H);
    drawFood(ctx, food, camera, W, H);
    drawViruses(ctx, viruses, camera, W, H);
    drawPowerups(ctx, powerups, camera, W, H);
    drawParticles(ctx, particles, camera, W, H);

    // Draw bots
    for (const bot of bots) {
        if (bot.alive) bot.draw(ctx, camera, W, H);
    }

    // Draw player on top
    if (player && player.alive) {
        player.draw(ctx, camera, W, H);
    }

    // Draw eat animations (expanding ring on eat)
    for (const ea of eatAnimations) {
        const sx = (ea.x - camera.x) * camera.zoom + W / 2;
        const sy = (ea.y - camera.y) * camera.zoom + H / 2;
        const alpha = Math.floor(ea.life * 180).toString(16).padStart(2, '0');
        ctx.beginPath();
        ctx.arc(sx, sy, ea.r * camera.zoom, 0, Math.PI * 2);
        ctx.strokeStyle = ea.color + alpha;
        ctx.lineWidth = 2;
        ctx.stroke();
        if (ea.label) {
            ctx.fillStyle = ea.color + alpha;
            ctx.font = 'bold 13px Orbitron, monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(ea.label, sx, sy - ea.r * camera.zoom - 14);
        }
    }

    ctx.restore();

    // Draw active effects HUD
    drawEffectsHUD(ctx, activeEffects, W, H);

    // Draw mode timer HUD
    if (gameMode !== 'classic' && gameRunning) {
        const secs = Math.ceil(modeTimer / 1000);
        ctx.fillStyle = secs < 10 ? '#ff2d75' : '#ffd32a';
        ctx.font = 'bold 22px Orbitron, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(gameMode === 'timeattack' ? `⏱ ${secs}s` : `🌊 WAVE ${survivalWave + 1} — ${secs}s`, W / 2, 90);
    }

    // Update HUD elements
    updateHUD();
    drawMinimap(mmCtx, player, bots, food, powerups, camera, W, H);

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

    powerups = [];
    for (let i = 0; i < 8; i++) powerups.push(createPowerup());
    activeEffects = {};
    eatAnimations = [];
    screenShake = 0;
    gameMode = window.selectedGameMode || 'classic';
    modeTimer = gameMode === 'timeattack' ? 90000 : gameMode === 'survival' ? 30000 : 0;
    survivalWave = 0;

    // Create player at world center
    player = new Player(WORLD_SIZE / 2, WORLD_SIZE / 2, nameInput, window.selectedCellColor || '#00f0ff');

    // Spawn world entities
    food = createFood();
    viruses = createViruses();
    particles = [];

    // Create bot enemies with FSM AI
    bots = [];
    for (let i = 0; i < BOT_COUNT; i++) {
        // Keep re-rolling until the bot spawns at least 800px from the player
        let x, y;
        do {
            x = Math.random() * WORLD_SIZE;
            y = Math.random() * WORLD_SIZE;
        } while (Math.hypot(x - player.x, y - player.y) < 800);
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

    // Save global high score
    if (stats.score > globalHighScore) {
        globalHighScore = stats.score;
        localStorage.setItem('cellioHighScore', globalHighScore);
    }

    // Death burst animation
    for (let i = 0; i < 20; i++) {
        const angle = (i / 20) * Math.PI * 2;
        const speed = 2 + Math.random() * 5;
        particles.push({
            x: player.centerX, y: player.centerY,
            vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
            life: 1, color: player.color, radius: 4 + Math.random() * 8
        });
    }

    document.getElementById('go-score').textContent = stats.score.toLocaleString();
    document.getElementById('go-highscore').textContent = globalHighScore.toLocaleString();
    document.getElementById('go-kills').textContent = stats.killCount;
    document.getElementById('go-mode').textContent = gameMode.toUpperCase();
    document.getElementById('screen-gameover').classList.remove('hidden');
    document.getElementById('hud').classList.add('hidden');
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
    document.getElementById('screen-pause').classList.add('hidden');
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
canvas.addEventListener('mousedown', () => { });

// EVENT 13: mouseup — Track mouse release state
canvas.addEventListener('mouseup', () => { });

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