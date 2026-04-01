// ═══════════════════════════════════════════════════════════════════
// renderer.js — Canvas Rendering Functions
// 
// Handles all drawing: grid, world border, food, viruses, particles,
// and the minimap. Cell drawing is handled by Cell.draw() itself.
// ═══════════════════════════════════════════════════════════════════

import { massToRadius, WORLD_SIZE } from './utils.js';

/**
 * Clear the canvas and fill with background color.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} W - Canvas width
 * @param {number} H - Canvas height
 */
export function clearCanvas(ctx, W, H) {
    const t = window.getBgTheme ? window.getBgTheme() : { bg: '#0a0e17' };
    ctx.fillStyle = t.bg;
    ctx.fillRect(0, 0, W, H);
}

export function drawGrid(ctx, cam, W, H) {
    const t = window.getBgTheme ? window.getBgTheme() : { dot: 'rgba(0,240,255,0.08)', bg: '#0a0e17' };
    const isMicroscope = (window.bgTheme === 'microscope');

    if (isMicroscope) {
        // ── Microscope slide: warm beige base + faint grid lines + lens vignette ──

        // Fine reticle grid (eyepiece measurement lines)
        const gridSize = 60;
        const startX = Math.floor((cam.x - W / 2 / cam.zoom) / gridSize) * gridSize;
        const startY = Math.floor((cam.y - H / 2 / cam.zoom) / gridSize) * gridSize;
        const endX = cam.x + W / 2 / cam.zoom;
        const endY = cam.y + H / 2 / cam.zoom;

        ctx.strokeStyle = 'rgba(100, 80, 40, 0.13)';
        ctx.lineWidth = 0.8;
        for (let x = startX; x <= endX; x += gridSize) {
            const sx = (x - cam.x) * cam.zoom + W / 2;
            ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, H); ctx.stroke();
        }
        for (let y = startY; y <= endY; y += gridSize) {
            const sy = (y - cam.y) * cam.zoom + H / 2;
            ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(W, sy); ctx.stroke();
        }

        // Lens vignette — darker oval at edges like a microscope objective
        const vignette = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.28, W / 2, H / 2, Math.min(W, H) * 0.72);
        vignette.addColorStop(0, 'rgba(0,0,0,0)');
        vignette.addColorStop(1, 'rgba(0,0,0,0.45)');
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, W, H);

    } else {
        // ── Standard dot grid ──
        const gridSize = 50;
        const dotRadius = Math.max(1, 1.5 * cam.zoom);
        const startX = Math.floor((cam.x - W / 2 / cam.zoom) / gridSize) * gridSize;
        const startY = Math.floor((cam.y - H / 2 / cam.zoom) / gridSize) * gridSize;
        const endX = cam.x + W / 2 / cam.zoom;
        const endY = cam.y + H / 2 / cam.zoom;

        ctx.fillStyle = t.dot;
        for (let x = startX; x <= endX; x += gridSize) {
            for (let y = startY; y <= endY; y += gridSize) {
                const sx = (x - cam.x) * cam.zoom + W / 2;
                const sy = (y - cam.y) * cam.zoom + H / 2;
                ctx.beginPath();
                ctx.arc(sx, sy, dotRadius, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
}

/**
 * Draw the world boundary with darkened outer region.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} cam
 * @param {number} W
 * @param {number} H
 */
export function drawWorldBorder(ctx, cam, W, H) {
    const z = cam.zoom;
    const x = (0 - cam.x) * z + W / 2;
    const y = (0 - cam.y) * z + H / 2;
    const w = WORLD_SIZE * z;
    const h = WORLD_SIZE * z;

    // Border line
    ctx.strokeStyle = 'rgba(180, 180, 180, 0.8)';
    ctx.lineWidth = 3 * z;
    ctx.strokeRect(x, y, w, h);

    // Darken/tint areas outside the world
    const tb = window.getBgTheme ? window.getBgTheme() : { outside: 'rgba(5,7,12,0.7)' };
    ctx.fillStyle = tb.outside;
    ctx.fillRect(0, 0, W, Math.max(0, y));                // Top
    ctx.fillRect(0, y + h, W, H - y - h);                 // Bottom
    ctx.fillRect(0, y, Math.max(0, x), h);                // Left
    ctx.fillRect(x + w, y, W - x - w, h);                 // Right
}

/**
 * Draw all food items.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array} food
 * @param {Object} cam
 * @param {number} W
 * @param {number} H
 */
export function drawFood(ctx, food, cam, W, H) {
    for (const f of food) {
        const sx = (f.x - cam.x) * cam.zoom + W / 2;
        const sy = (f.y - cam.y) * cam.zoom + H / 2;
        const sr = (f.ejected ? f.radius : f.radius * 0.6) * cam.zoom;

        if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) continue;

        ctx.save();
        ctx.translate(sx, sy);

        const type = f.type || 'coccus';

        if (f.ejected || type === 'coccus') {
            // ── Round coccus bacterium — simple circle with slight inner glow ──
            ctx.beginPath();
            ctx.arc(0, 0, sr, 0, Math.PI * 2);
            ctx.fillStyle = f.color + 'cc';
            ctx.fill();
            // Tiny highlight
            ctx.beginPath();
            ctx.arc(-sr * 0.25, -sr * 0.25, sr * 0.3, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,0.25)';
            ctx.fill();

        } else if (type === 'rod') {
            // ── Rod-shaped bacterium — capsule / rounded rectangle ──
            ctx.rotate(f.angle || 0);
            const len = sr * 1.8;
            const w = sr * 0.75;
            ctx.beginPath();
            ctx.roundRect(-len / 2, -w / 2, len, w, w / 2);
            ctx.fillStyle = f.color + 'cc';
            ctx.fill();
            // Septum line (middle division)
            ctx.beginPath();
            ctx.moveTo(0, -w / 2);
            ctx.lineTo(0, w / 2);
            ctx.strokeStyle = f.color + '55';
            ctx.lineWidth = Math.max(0.5, cam.zoom * 0.5);
            ctx.stroke();

        } else if (type === 'spirillum') {
            // ── Spiral bacterium — wavy S-curve ──
            ctx.rotate(f.angle || 0);
            ctx.beginPath();
            const steps = 20;
            const totalLen = sr * 2.2;
            for (let i = 0; i <= steps; i++) {
                const t = i / steps;
                const px = (t - 0.5) * totalLen;
                const py = Math.sin(t * Math.PI * 2.5) * sr * 0.45;
                i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
            }
            ctx.strokeStyle = f.color + 'cc';
            ctx.lineWidth = Math.max(1.5, sr * 0.55) * cam.zoom;
            ctx.lineCap = 'round';
            ctx.stroke();

        } else if (type === 'spore') {
            // ── Spore — layered circles like a seed coat ──
            // Outer coat (lighter)
            ctx.beginPath();
            ctx.arc(0, 0, sr, 0, Math.PI * 2);
            ctx.fillStyle = f.color + '44';
            ctx.fill();
            ctx.strokeStyle = f.color + '88';
            ctx.lineWidth = Math.max(1, sr * 0.18);
            ctx.stroke();
            // Inner spore body
            ctx.beginPath();
            ctx.arc(0, 0, sr * 0.62, 0, Math.PI * 2);
            ctx.fillStyle = f.color + 'cc';
            ctx.fill();
            // Core
            ctx.beginPath();
            ctx.arc(0, 0, sr * 0.28, 0, Math.PI * 2);
            ctx.fillStyle = f.color + 'ff';
            ctx.fill();
        }

        ctx.restore();
    }
}

/**
 * Draw all viruses (green spiky cells).
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array} viruses
 * @param {Object} cam
 * @param {number} W
 * @param {number} H
 */
export function drawViruses(ctx, viruses, cam, W, H) {
    const now = Date.now() / 1000;
    for (const v of viruses) {
        const sx = (v.x - cam.x) * cam.zoom + W / 2;
        const sy = (v.y - cam.y) * cam.zoom + H / 2;
        const sr = v.radius * cam.zoom;

        if (sx + sr < -50 || sx - sr > W + 50 || sy + sr < -50 || sy - sr > H + 50) continue;

        ctx.save();
        ctx.translate(sx, sy);

        const spikes = v.spikes || 18;

        // ── Outer halo glow ──
        const halo = ctx.createRadialGradient(0, 0, sr * 0.6, 0, 0, sr * 1.6);
        halo.addColorStop(0, 'rgba(180, 255, 80, 0.12)');
        halo.addColorStop(1, 'rgba(180, 255, 80, 0.00)');
        ctx.beginPath();
        ctx.arc(0, 0, sr * 1.6, 0, Math.PI * 2);
        ctx.fillStyle = halo;
        ctx.fill();

        // ── Spike proteins (surface proteins radiating outward) ──
        for (let i = 0; i < spikes; i++) {
            const angle = (i / spikes) * Math.PI * 2 + now * 0.12;
            const wobble = 1 + 0.07 * Math.sin(now * 2.5 + i * 1.3);
            const innerR = sr * 0.88;
            const outerR = sr * (1.18 + 0.08 * Math.sin(i * 2.1)) * wobble;
            const bulbR = sr * 0.095;

            // Spike stalk
            ctx.beginPath();
            ctx.moveTo(Math.cos(angle) * innerR, Math.sin(angle) * innerR);
            ctx.lineTo(Math.cos(angle) * (outerR - bulbR * 1.2), Math.sin(angle) * (outerR - bulbR * 1.2));
            ctx.strokeStyle = 'rgba(160, 255, 80, 0.65)';
            ctx.lineWidth = Math.max(1, sr * 0.055);
            ctx.lineCap = 'round';
            ctx.stroke();

            // Bulb at tip (spike protein head)
            ctx.beginPath();
            ctx.arc(Math.cos(angle) * outerR, Math.sin(angle) * outerR, bulbR, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(200, 255, 100, 0.8)';
            ctx.fill();
        }

        // ── Capsid (main body) ──
        const bodyGrad = ctx.createRadialGradient(-sr * 0.2, -sr * 0.2, 0, 0, 0, sr);
        bodyGrad.addColorStop(0, 'rgba(140, 255, 80, 0.35)');
        bodyGrad.addColorStop(0.7, 'rgba(60, 200, 40, 0.20)');
        bodyGrad.addColorStop(1, 'rgba(30, 140, 20, 0.08)');
        ctx.beginPath();
        ctx.arc(0, 0, sr * 0.88, 0, Math.PI * 2);
        ctx.fillStyle = bodyGrad;
        ctx.fill();

        // Capsid border
        ctx.beginPath();
        ctx.arc(0, 0, sr * 0.88, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(120, 255, 60, 0.55)';
        ctx.lineWidth = Math.max(1, sr * 0.06);
        ctx.stroke();

        // ── RNA core (inner genetic material) ──
        ctx.beginPath();
        ctx.arc(sr * 0.08, sr * 0.05, sr * 0.32, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(200, 255, 120, 0.18)';
        ctx.fill();

        ctx.restore();
    }
}

/**
 * Draw all particles (burst effects).
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array} particles
 * @param {Object} cam
 * @param {number} W
 * @param {number} H
 */
export function drawParticles(ctx, particles, cam, W, H) {
    for (const p of particles) {
        const sx = (p.x - cam.x) * cam.zoom + W / 2;
        const sy = (p.y - cam.y) * cam.zoom + H / 2;
        const sr = p.radius * p.life * cam.zoom;

        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        const alpha = Math.floor(p.life * 200).toString(16).padStart(2, '0');
        ctx.fillStyle = p.color + alpha;
        ctx.fill();
    }
}

/**
 * Draw the minimap showing all entities.
 * @param {CanvasRenderingContext2D} mmCtx - Minimap canvas context
 * @param {Object} player
 * @param {Array} bots
 * @param {Array} food
 * @param {Object} cam
 * @param {number} W - Main canvas width
 * @param {number} H - Main canvas height
 */
export function drawMinimap(mmCtx, player, bots, food, cam, W, H) {
    mmCtx.fillStyle = 'rgba(240, 240, 240, 0.95)';
    mmCtx.fillRect(0, 0, 160, 160);

    const scale = 160 / WORLD_SIZE;

    // Food (dim dots)
    mmCtx.fillStyle = 'rgba(160, 160, 160, 0.4)';
    for (const f of food) {
        mmCtx.fillRect(f.x * scale, f.y * scale, 1, 1);
    }

    // Bots
    for (const b of bots) {
        if (!b.alive) continue;
        mmCtx.fillStyle = b.color + '80';
        const r = Math.max(2, massToRadius(b.totalMass) * scale);
        mmCtx.beginPath();
        mmCtx.arc(b.x * scale, b.y * scale, r, 0, Math.PI * 2);
        mmCtx.fill();
    }

    // Player
    if (player && player.alive) {
        mmCtx.fillStyle = '#00f0ff';
        const r = Math.max(3, massToRadius(player.totalMass) * scale);
        mmCtx.beginPath();
        mmCtx.arc(player.centerX * scale, player.centerY * scale, r, 0, Math.PI * 2);
        mmCtx.fill();
    }

    // Camera viewport rectangle
    mmCtx.strokeStyle = 'rgba(80, 80, 80, 0.5)';
    mmCtx.lineWidth = 1;
    const vx = (cam.x - W / 2 / cam.zoom) * scale;
    const vy = (cam.y - H / 2 / cam.zoom) * scale;
    const vw = (W / cam.zoom) * scale;
    const vh = (H / cam.zoom) * scale;
    mmCtx.strokeRect(vx, vy, vw, vh);
}