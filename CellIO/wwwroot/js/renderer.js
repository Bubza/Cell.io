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
  ctx.fillStyle = '#0a0e17';
  ctx.fillRect(0, 0, W, H);
}

/**
 * Draw the background grid.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} cam - { x, y, zoom }
 * @param {number} W
 * @param {number} H
 */
export function drawGrid(ctx, cam, W, H) {
  const gridSize = 60;
  ctx.strokeStyle = 'rgba(0, 240, 255, 0.04)';
  ctx.lineWidth = 1;

  const startX = Math.floor((cam.x - W / 2 / cam.zoom) / gridSize) * gridSize;
  const startY = Math.floor((cam.y - H / 2 / cam.zoom) / gridSize) * gridSize;
  const endX = cam.x + W / 2 / cam.zoom;
  const endY = cam.y + H / 2 / cam.zoom;

  ctx.beginPath();
  for (let x = startX; x <= endX; x += gridSize) {
    const sx = (x - cam.x) * cam.zoom + W / 2;
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, H);
  }
  for (let y = startY; y <= endY; y += gridSize) {
    const sy = (y - cam.y) * cam.zoom + H / 2;
    ctx.moveTo(0, sy);
    ctx.lineTo(W, sy);
  }
  ctx.stroke();
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
  ctx.strokeStyle = 'rgba(255, 45, 117, 0.35)';
  ctx.lineWidth = 3 * z;
  ctx.strokeRect(x, y, w, h);

  // Darken areas outside the world
  ctx.fillStyle = 'rgba(10, 14, 23, 0.7)';
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

    // Frustum culling
    if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) continue;

    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fillStyle = f.color + 'cc';
    ctx.fill();
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
  for (const v of viruses) {
    const sx = (v.x - cam.x) * cam.zoom + W / 2;
    const sy = (v.y - cam.y) * cam.zoom + H / 2;
    const sr = v.radius * cam.zoom;

    if (sx + sr < -50 || sx - sr > W + 50 || sy + sr < -50 || sy - sr > H + 50) continue;

    // Draw spiky polygon
    ctx.beginPath();
    for (let i = 0; i < v.spikes * 2; i++) {
      const angle = (i * Math.PI) / v.spikes;
      const r = i % 2 === 0 ? sr * 1.15 : sr * 0.85;
      const px = sx + Math.cos(angle) * r;
      const py = sy + Math.sin(angle) * r;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(90, 255, 138, 0.15)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(90, 255, 138, 0.5)';
    ctx.lineWidth = 2 * cam.zoom;
    ctx.stroke();
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
  mmCtx.fillStyle = 'rgba(10, 14, 23, 0.9)';
  mmCtx.fillRect(0, 0, 160, 160);

  const scale = 160 / WORLD_SIZE;

  // Food (dim dots)
  mmCtx.fillStyle = 'rgba(0, 240, 255, 0.15)';
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
  mmCtx.strokeStyle = 'rgba(0, 240, 255, 0.3)';
  mmCtx.lineWidth = 1;
  const vx = (cam.x - W / 2 / cam.zoom) * scale;
  const vy = (cam.y - H / 2 / cam.zoom) * scale;
  const vw = (W / cam.zoom) * scale;
  const vh = (H / cam.zoom) * scale;
  mmCtx.strokeRect(vx, vy, vw, vh);
}
