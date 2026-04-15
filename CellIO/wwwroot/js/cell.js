// ═══════════════════════════════════════════════════════════════════
// cell.js — Bacteria rendering: rod shape, pili, single flagellum,
// plasma membrane, nucleoid region, cytoplasm texture
// ═══════════════════════════════════════════════════════════════════

import {
    massToRadius, dist, clamp,
    BASE_SPEED, WORLD_SIZE, MIN_SPLIT_MASS, MERGE_TIME, DECAY_RATE, START_MASS, MAX_CELLS
} from './utils.js';
import { playSound } from './audio.js';

export class Cell {
    constructor(x, y, mass, color, name, isPlayer = false) {
        this.x = x; this.y = y; this.mass = mass; this.color = color;
        this.name = name; this.isPlayer = isPlayer; this.alive = true;
        this.cells = [{
            x, y, mass, vx: 0, vy: 0, splitTime: 0,
            wobbleSeed: Math.random() * Math.PI * 2, wobblePhase: Math.random() * Math.PI * 2,
            trail: [], angle: Math.random() * Math.PI * 2
        }];
    }

    get totalMass() { return this.cells.reduce((s, c) => s + c.mass, 0); }
    get radius() { return massToRadius(this.totalMass); }
    get centerX() { let s = 0; for (const c of this.cells) s += c.x; return s / this.cells.length; }
    get centerY() { let s = 0; for (const c of this.cells) s += c.y; return s / this.cells.length; }

    moveToward(tx, ty, dt) {
        for (const c of this.cells) {
            const dx = tx - c.x, dy = ty - c.y, d = Math.sqrt(dx * dx + dy * dy);
            if (d < 1) continue;
            const spd = BASE_SPEED * Math.pow(c.mass, -0.08);
            c.x += (dx / d) * spd; c.y += (dy / d) * spd;
            c.x = clamp(c.x, 0, WORLD_SIZE); c.y = clamp(c.y, 0, WORLD_SIZE);
            c.angle = Math.atan2(dy, dx);
        }
        this.x = this.centerX; this.y = this.centerY;
        this._tryMergeCells();
    }

    _tryMergeCells() {
        if (this.cells.length <= 1) return;
        const now = Date.now();
        for (let i = 0; i < this.cells.length; i++) for (let j = i + 1; j < this.cells.length; j++) {
            const a = this.cells[i], b = this.cells[j];
            if (now - a.splitTime < MERGE_TIME || now - b.splitTime < MERGE_TIME) continue;
            if (dist(a, b) < massToRadius(a.mass) + massToRadius(b.mass)) {
                const t = a.mass + b.mass;
                a.x = (a.x * a.mass + b.x * b.mass) / t; a.y = (a.y * a.mass + b.y * b.mass) / t;
                a.mass = t; this.cells.splice(j, 1); j--;
            }
        }
    }

    split(tx, ty) {
        if (this.cells.length >= MAX_CELLS) return;
        const nc = [];
        for (const c of this.cells) {
            if (c.mass < MIN_SPLIT_MASS) continue;
            if (this.cells.length + nc.length >= MAX_CELLS) break;
            const half = c.mass / 2; c.mass = half;
            const dx = tx - c.x, dy = ty - c.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
            nc.push({
                x: clamp(c.x + (dx / d) * massToRadius(half) * 3, 0, WORLD_SIZE),
                y: clamp(c.y + (dy / d) * massToRadius(half) * 3, 0, WORLD_SIZE),
                mass: half, vx: (dx / d) * 10, vy: (dy / d) * 10, splitTime: Date.now(),
                wobbleSeed: Math.random() * Math.PI * 2, wobblePhase: Math.random() * Math.PI * 2,
                trail: [], angle: Math.atan2(dy, dx)
            });
            c.splitTime = Date.now();
        }
        if (nc.length > 0) { this.cells.push(...nc); playSound('split'); }
    }

    ejectMass(tx, ty) {
        for (const c of this.cells) {
            if (c.mass < 30) continue; c.mass -= 12;
            const dx = tx - c.x, dy = ty - c.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
            playSound('eject');
            return {
                x: c.x + (dx / d) * (massToRadius(c.mass) + 10), y: c.y + (dy / d) * (massToRadius(c.mass) + 10),
                mass: 12, color: this.color, radius: massToRadius(12), ejected: true
            };
        } return null;
    }

    decay() { for (const c of this.cells) if (c.mass > START_MASS) c.mass *= DECAY_RATE; }

    draw(ctx, cam, W, H) {
        const now = Date.now() / 1000;
        for (const c of this.cells) {
            const sx = (c.x - cam.x) * cam.zoom + W / 2, sy = (c.y - cam.y) * cam.zoom + H / 2;
            const baseR = massToRadius(c.mass) * cam.zoom;
            if (sx + baseR < -100 || sx - baseR > W + 100 || sy + baseR < -100 || sy - baseR > H + 100) continue;

            const seed = c.wobbleSeed || 0, phase = c.wobblePhase || 0;
            const angle = c.angle || 0;

            // Slime trail
            if (!c.trail) c.trail = [];
            c.trail.push({ x: sx, y: sy, r: baseR });
            if (c.trail.length > 14) c.trail.shift();
            for (let t = 0; t < c.trail.length; t++) {
                const tp = c.trail[t], prog = t / c.trail.length;
                ctx.beginPath(); ctx.arc(tp.x, tp.y, tp.r * (0.18 + prog * 0.3), 0, Math.PI * 2);
                ctx.fillStyle = this.color + Math.floor(prog * 0.12 * 255).toString(16).padStart(2, '0');
                ctx.fill();
            }

            const sr = baseR * (1 + 0.015 * Math.sin(now * 1.5 + seed));
            const elong = 2.2;  // clear rod shape like the diagram

            ctx.save();
            ctx.translate(sx, sy);
            ctx.rotate(angle);

            // ── Single flagellum off the back ──
            if (sr > 8) {
                const fLen = sr * 3.2;
                const wAmp = sr * 0.55;
                ctx.beginPath();
                ctx.moveTo(-sr * elong * 0.92, 0);
                for (let i = 1; i <= 30; i++) {
                    const t2 = i / 30;
                    const fx = -sr * elong * 0.92 - t2 * fLen;
                    const fy = Math.sin(t2 * Math.PI * 3 + now * 4) * wAmp * t2;
                    ctx.lineTo(fx, fy);
                }
                ctx.strokeStyle = this.color + '55';
                ctx.lineWidth = Math.max(0.8, sr * 0.038);
                ctx.lineCap = 'round'; ctx.stroke();
            }

            // ── Capsule/outer wall path ──
            const POINTS = 56;
            const wAmp2 = sr * 0.04;
            const capsulePath = (scale) => {
                ctx.beginPath();
                for (let i = 0; i <= POINTS; i++) {
                    const a = (i / POINTS) * Math.PI * 2;
                    const wobble = wAmp2 * Math.sin(3 * a + now * 0.9 + seed) + wAmp2 * 0.4 * Math.sin(6 * a - now * 0.6 + phase);
                    const px = Math.cos(a) * (sr * elong * scale + wobble);
                    const py = Math.sin(a) * (sr * scale + wobble * 0.5);
                    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
                }
                ctx.closePath();
            };

            // Outer glow
            const glow = ctx.createRadialGradient(0, 0, sr * 0.1, 0, 0, sr * elong * 1.25);
            glow.addColorStop(0, this.color + '18'); glow.addColorStop(1, this.color + '00');
            capsulePath(1.08);
            ctx.fillStyle = glow; ctx.fill();

            // ── Pili — short stubby spikes all around body ──
            if (sr > 10) {
                const piliCount = Math.floor(sr * 1.2);
                for (let p = 0; p < piliCount; p++) {
                    const pa = (p / piliCount) * Math.PI * 2;
                    const pLen = sr * (0.32 + 0.12 * Math.sin(p * 3.7 + seed));
                    const rx = sr * elong; const ry = sr;
                    // point on ellipse surface
                    const norm = Math.sqrt((Math.cos(pa) / rx) ** 2 + (Math.sin(pa) / ry) ** 2);
                    const bx = Math.cos(pa) / (norm * rx) * rx;
                    const by = Math.sin(pa) / (norm * ry) * ry;
                    const ex = bx + (Math.cos(pa) / Math.sqrt((Math.cos(pa) / rx) ** 2 + (Math.sin(pa) / ry) ** 2)) * pLen / sr;
                    // simpler: just radiate from ellipse edge
                    const ex2 = Math.cos(pa) * (sr * elong + pLen);
                    const ey2 = Math.sin(pa) * (sr + pLen);
                    ctx.beginPath();
                    ctx.moveTo(Math.cos(pa) * sr * elong * 0.97, Math.sin(pa) * sr * 0.97);
                    ctx.lineTo(ex2 * 0.97, ey2 * 0.97);
                    ctx.strokeStyle = this.color + "99";;
                    ctx.lineWidth = Math.max(0.8, sr * 0.04);
                    ctx.lineCap = 'round'; ctx.stroke();
                }
            }

            // Capsule fill (body)
            capsulePath(1.0);
            ctx.fillStyle = this.color + 'bb'; ctx.fill();

            // Plasma membrane (inner ring)
            capsulePath(0.80);
            ctx.strokeStyle = this.color + '70';
            ctx.lineWidth = Math.max(1, sr * 0.07); ctx.stroke();

            // Outer cell wall
            capsulePath(1.0);
            ctx.strokeStyle = this.color + 'dd';
            ctx.lineWidth = Math.max(1, sr * 0.045); ctx.stroke();

            // ── Nucleoid region (irregular darker blob in center) ──
            if (sr > 12) {
                ctx.save();
                ctx.beginPath();
                // Clip to body so nucleoid stays inside
                capsulePath(0.78);
                ctx.clip();
                // Draw irregular nucleoid
                const nw = sr * elong * 0.55, nh = sr * 0.45;
                const nx = sr * 0.05, ny = -sr * 0.04;
                const ng = ctx.createRadialGradient(nx, ny, 0, nx, ny, Math.max(nw, nh));
                ng.addColorStop(0, this.color + '55');
                ng.addColorStop(0.5, this.color + '33');
                ng.addColorStop(1, this.color + '00');
                ctx.beginPath();
                ctx.ellipse(nx, ny, nw, nh, now * 0.1 + seed, 0, Math.PI * 2);
                ctx.fillStyle = ng; ctx.fill();
                ctx.restore();
            }

            // ── Ribosomes/granules scattered in cytoplasm ──
            if (sr > 14) {
                for (let g = 0; g < 6; g++) {
                    const ga = (g / 6) * Math.PI * 2 + seed * 1.7;
                    const gx = Math.cos(ga) * sr * elong * 0.42, gy = Math.sin(ga) * sr * 0.35;
                    ctx.beginPath();
                    ctx.arc(gx, gy, Math.max(1, sr * 0.055), 0, Math.PI * 2);
                    ctx.fillStyle = this.color + '40'; ctx.fill();
                }
            }

            ctx.restore();

            // Name + mass
            if (sr > 15) {
                ctx.save();
                ctx.translate(sx, sy);
                ctx.rotate(angle > Math.PI / 2 || angle < -Math.PI / 2 ? angle + Math.PI : angle);
                ctx.fillStyle = '#fff';
                ctx.font = `bold ${Math.max(10, sr * 0.35)}px Orbitron,monospace`;
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(this.name, 0, 0);
                ctx.fillStyle = 'rgba(255,255,255,0.5)';
                ctx.font = `${Math.max(8, sr * 0.24)}px Rajdhani,sans-serif`;
                ctx.fillText(Math.floor(c.mass), 0, sr * 0.38);
                ctx.restore();
            }
        }
    }
}