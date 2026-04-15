// ═══════════════════════════════════════════════════════════════════
// cell.js — Base Cell Class
// Bacteria-style rendering: rod/capsule shape, flagella, cell wall,
// internal granules, slime trail.
// ═══════════════════════════════════════════════════════════════════

import {
    massToRadius, dist, clamp,
    BASE_SPEED, WORLD_SIZE, MIN_SPLIT_MASS, MERGE_TIME, DECAY_RATE, START_MASS, MAX_CELLS
} from './utils.js';
import { playSound } from './audio.js';

export class Cell {
    constructor(x, y, mass, color, name, isPlayer = false) {
        this.x = x;
        this.y = y;
        this.mass = mass;
        this.color = color;
        this.name = name;
        this.isPlayer = isPlayer;
        this.alive = true;
        this.cells = [{ x, y, mass, vx: 0, vy: 0, splitTime: 0, wobbleSeed: Math.random() * Math.PI * 2, wobblePhase: Math.random() * Math.PI * 2, trail: [], angle: Math.random() * Math.PI * 2 }];
    }

    get totalMass() { return this.cells.reduce((sum, c) => sum + c.mass, 0); }
    get radius() { return massToRadius(this.totalMass); }
    get centerX() { if (!this.cells.length) return this.x; let s = 0; for (const c of this.cells) s += c.x; return s / this.cells.length; }
    get centerY() { if (!this.cells.length) return this.y; let s = 0; for (const c of this.cells) s += c.y; return s / this.cells.length; }

    moveToward(tx, ty, dt) {
        for (const c of this.cells) {
            const dx = tx - c.x, dy = ty - c.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < 1) continue;
            const spd = BASE_SPEED * Math.pow(c.mass, -0.08);
            c.x += (dx / d) * spd; c.y += (dy / d) * spd;
            c.x = clamp(c.x, 0, WORLD_SIZE); c.y = clamp(c.y, 0, WORLD_SIZE);
            // Track movement angle for bacteria orientation
            c.angle = Math.atan2(dy, dx);
        }
        this.x = this.centerX; this.y = this.centerY;
        this._tryMergeCells();
    }

    _tryMergeCells() {
        if (this.cells.length <= 1) return;
        const now = Date.now();
        for (let i = 0; i < this.cells.length; i++) {
            for (let j = i + 1; j < this.cells.length; j++) {
                const a = this.cells[i], b = this.cells[j];
                if (now - a.splitTime < MERGE_TIME || now - b.splitTime < MERGE_TIME) continue;
                const d = dist(a, b);
                if (d < massToRadius(a.mass) + massToRadius(b.mass)) {
                    const total = a.mass + b.mass;
                    a.x = (a.x * a.mass + b.x * b.mass) / total; a.y = (a.y * a.mass + b.y * b.mass) / total;
                    a.mass = total; this.cells.splice(j, 1); j--;
                }
            }
        }
    }

    split(tx, ty) {
        if (this.cells.length >= MAX_CELLS) return;
        const newCells = [];
        for (const c of this.cells) {
            if (c.mass < MIN_SPLIT_MASS) continue;
            if (this.cells.length + newCells.length >= MAX_CELLS) break;
            const half = c.mass / 2; c.mass = half;
            const dx = tx - c.x, dy = ty - c.y;
            const d = Math.sqrt(dx * dx + dy * dy) || 1;
            const pushDist = massToRadius(half) * 3;
            newCells.push({
                x: clamp(c.x + (dx / d) * pushDist, 0, WORLD_SIZE),
                y: clamp(c.y + (dy / d) * pushDist, 0, WORLD_SIZE),
                mass: half, vx: (dx / d) * 10, vy: (dy / d) * 10,
                splitTime: Date.now(),
                wobbleSeed: Math.random() * Math.PI * 2, wobblePhase: Math.random() * Math.PI * 2,
                trail: [], angle: Math.atan2(dy, dx)
            });
            c.splitTime = Date.now();
        }
        if (newCells.length > 0) { this.cells.push(...newCells); playSound('split'); }
    }

    ejectMass(tx, ty) {
        for (const c of this.cells) {
            if (c.mass < 30) continue;
            c.mass -= 12;
            const dx = tx - c.x, dy = ty - c.y;
            const d = Math.sqrt(dx * dx + dy * dy) || 1;
            playSound('eject');
            return { x: c.x + (dx / d) * (massToRadius(c.mass) + 10), y: c.y + (dy / d) * (massToRadius(c.mass) + 10), mass: 12, color: this.color, radius: massToRadius(12), ejected: true };
        }
        return null;
    }

    decay() {
        for (const c of this.cells) { if (c.mass > START_MASS) c.mass *= DECAY_RATE; }
    }

    draw(ctx, cam, W, H) {
        const now = Date.now() / 1000;

        for (const c of this.cells) {
            const sx = (c.x - cam.x) * cam.zoom + W / 2;
            const sy = (c.y - cam.y) * cam.zoom + H / 2;
            const baseR = massToRadius(c.mass) * cam.zoom;

            if (sx + baseR < -80 || sx - baseR > W + 80 || sy + baseR < -80 || sy - baseR > H + 80) continue;

            const seed = c.wobbleSeed || 0;
            const angle = c.angle || 0;

            // ── Slime trail ──
            if (!c.trail) c.trail = [];
            c.trail.push({ x: sx, y: sy, r: baseR });
            if (c.trail.length > 18) c.trail.shift();
            for (let t = 0; t < c.trail.length; t++) {
                const tp = c.trail[t];
                const progress = t / c.trail.length;
                const alpha = progress * 0.18;
                const tr = tp.r * (0.25 + progress * 0.4);
                ctx.beginPath();
                ctx.arc(tp.x, tp.y, tr, 0, Math.PI * 2);
                ctx.fillStyle = this.color + Math.floor(alpha * 255).toString(16).padStart(2, '0');
                ctx.fill();
            }

            // ── Bacteria shape: elongated capsule with wobble ──
            const pulse = 1 + 0.018 * Math.sin(now * 1.6 + seed);
            const sr = baseR * pulse;
            // Elongation: bacteria are ~1.6x longer than wide
            const elongation = 1.55;
            const wobbleAmp = sr * 0.055;

            ctx.save();
            ctx.translate(sx, sy);
            ctx.rotate(angle);

            // Outer glow
            const glow = ctx.createRadialGradient(0, 0, sr * 0.3, 0, 0, sr * 1.5);
            glow.addColorStop(0, this.color + '28');
            glow.addColorStop(1, this.color + '00');
            ctx.beginPath();
            ctx.ellipse(0, 0, sr * elongation * 1.4, sr * 1.4, 0, 0, Math.PI * 2);
            ctx.fillStyle = glow;
            ctx.fill();

            // ── Flagella (whip-like tail) ──
            if (sr > 6) {
                const flagCount = Math.min(3, 1 + Math.floor(sr / 20));
                for (let f = 0; f < flagCount; f++) {
                    const fOffset = (f - (flagCount - 1) / 2) * sr * 0.35;
                    const fLen = sr * (2.2 + f * 0.3);
                    const waveAmp = sr * 0.4;
                    const waveFreq = 3.5;
                    const waveSpeed = now * 4 + f * 1.2;
                    ctx.beginPath();
                    const steps = 24;
                    for (let i = 0; i <= steps; i++) {
                        const t2 = i / steps;
                        const fx = -(sr * elongation * 0.9) - t2 * fLen;
                        const fy = fOffset + Math.sin(t2 * waveFreq * Math.PI + waveSpeed) * waveAmp * t2;
                        i === 0 ? ctx.moveTo(fx, fy) : ctx.lineTo(fx, fy);
                    }
                    ctx.strokeStyle = this.color + '55';
                    ctx.lineWidth = Math.max(0.8, sr * 0.045);
                    ctx.lineCap = 'round';
                    ctx.stroke();
                }
            }

            // ── Cell wall (outer capsule) ──
            const POINTS = 48;
            function bacteriaPath(scale, wAmp) {
                ctx.beginPath();
                for (let i = 0; i <= POINTS; i++) {
                    const a = (i / POINTS) * Math.PI * 2;
                    const wobble = wAmp * Math.sin(4 * a + now * 1.2 + seed) + wAmp * 0.5 * Math.sin(7 * a - now * 0.8 + seed);
                    const rx = sr * elongation * scale + wobble;
                    const ry = sr * scale + wobble * 0.5;
                    const px = Math.cos(a) * rx;
                    const py = Math.sin(a) * ry;
                    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
                }
                ctx.closePath();
            }

            // Body fill
            bacteriaPath(1.0, wobbleAmp);
            ctx.fillStyle = this.color + 'bb';
            ctx.fill();

            // Inner membrane (slightly darker, inset)
            bacteriaPath(0.84, wobbleAmp * 0.6);
            ctx.strokeStyle = this.color + '66';
            ctx.lineWidth = Math.max(1, sr * 0.07);
            ctx.stroke();

            // Outer cell wall
            bacteriaPath(1.0, wobbleAmp);
            ctx.strokeStyle = this.color;
            ctx.lineWidth = Math.max(1, sr * 0.055);
            ctx.stroke();

            // ── Internal granules (storage bodies inside bacteria) ──
            if (sr > 8) {
                const granuleCount = Math.min(5, 2 + Math.floor(sr / 18));
                for (let g = 0; g < granuleCount; g++) {
                    const ga = (g / granuleCount) * Math.PI * 2 + seed;
                    const gx = Math.cos(ga) * sr * elongation * 0.38;
                    const gy = Math.sin(ga) * sr * 0.28;
                    const gr = sr * (0.08 + 0.06 * Math.sin(g * 2.3 + seed));
                    ctx.beginPath();
                    ctx.arc(gx, gy, gr, 0, Math.PI * 2);
                    ctx.fillStyle = this.color + '55';
                    ctx.fill();
                }
            }

            // ── Septum line (cell division mark, center) ──
            if (sr > 12) {
                ctx.beginPath();
                ctx.moveTo(0, -sr * 0.72);
                ctx.lineTo(0, sr * 0.72);
                ctx.strokeStyle = this.color + '33';
                ctx.lineWidth = Math.max(0.5, sr * 0.035);
                ctx.stroke();
            }

            ctx.restore();

            // ── Name and mass text ──
            if (sr > 15) {
                ctx.fillStyle = '#fff';
                ctx.font = `bold ${Math.max(10, sr * 0.38)}px Orbitron, monospace`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(this.name, sx, sy);
                ctx.fillStyle = 'rgba(255,255,255,0.5)';
                ctx.font = `${Math.max(8, sr * 0.26)}px Rajdhani, sans-serif`;
                ctx.fillText(Math.floor(c.mass), sx, sy + sr * 0.42);
            }
        }
    }
}