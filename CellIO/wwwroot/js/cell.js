// ═══════════════════════════════════════════════════════════════════
// cell.js — Base Cell Class
// 
// Represents a single game entity (player or bot).
// Supports multi-cell mode (splitting into multiple pieces).
// Handles movement, merging, mass decay, and rendering.
// ═══════════════════════════════════════════════════════════════════

import {
    massToRadius, dist, clamp,
    BASE_SPEED, WORLD_SIZE, MIN_SPLIT_MASS, MERGE_TIME, DECAY_RATE, START_MASS, MAX_CELLS
} from './utils.js';
import { playSound } from './audio.js';

export class Cell {
    /**
     * @param {number} x - Starting X position
     * @param {number} y - Starting Y position
     * @param {number} mass - Starting mass
     * @param {string} color - Hex color string
     * @param {string} name - Display name
     * @param {boolean} isPlayer - Whether this is the human player
     */
    constructor(x, y, mass, color, name, isPlayer = false) {
        this.x = x;
        this.y = y;
        this.mass = mass;
        this.color = color;
        this.name = name;
        this.isPlayer = isPlayer;
        this.alive = true;

        // Multi-cell array: each sub-cell has its own position and mass
        this.cells = [{ x, y, mass, vx: 0, vy: 0, splitTime: 0, wobbleSeed: Math.random() * Math.PI * 2, wobblePhase: Math.random() * Math.PI * 2 }];
    }

    /** Total mass across all sub-cells */
    get totalMass() {
        return this.cells.reduce((sum, c) => sum + c.mass, 0);
    }

    /** Radius based on total mass */
    get radius() {
        return massToRadius(this.totalMass);
    }

    /** Center X (average of all sub-cells) */
    get centerX() {
        if (this.cells.length === 0) return this.x;
        let sx = 0;
        for (const c of this.cells) sx += c.x;
        return sx / this.cells.length;
    }

    /** Center Y (average of all sub-cells) */
    get centerY() {
        if (this.cells.length === 0) return this.y;
        let sy = 0;
        for (const c of this.cells) sy += c.y;
        return sy / this.cells.length;
    }

    /**
     * Move all sub-cells toward a target point.
     * Also handles merging sub-cells back together after MERGE_TIME.
     * @param {number} tx - Target X
     * @param {number} ty - Target Y
     * @param {number} dt - Delta time
     */
    moveToward(tx, ty, dt) {
        for (const c of this.cells) {
            const dx = tx - c.x;
            const dy = ty - c.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < 1) continue;

            // Speed is inversely related to mass (bigger = slower)
            const spd = BASE_SPEED * Math.pow(c.mass, -0.08);
            c.x += (dx / d) * spd;
            c.y += (dy / d) * spd;

            // Clamp to world bounds
            c.x = clamp(c.x, 0, WORLD_SIZE);
            c.y = clamp(c.y, 0, WORLD_SIZE);
        }

        // Update entity center position
        this.x = this.centerX;
        this.y = this.centerY;

        // Attempt to merge sub-cells that are close enough and old enough
        this._tryMergeCells();
    }

    /**
     * Merge sub-cells that have existed for longer than MERGE_TIME
     * and are overlapping.
     */
    _tryMergeCells() {
        if (this.cells.length <= 1) return;

        const now = Date.now();
        for (let i = 0; i < this.cells.length; i++) {
            for (let j = i + 1; j < this.cells.length; j++) {
                const a = this.cells[i];
                const b = this.cells[j];

                // Both cells must be old enough to merge
                if (now - a.splitTime < MERGE_TIME || now - b.splitTime < MERGE_TIME) continue;

                const d = dist(a, b);
                const rA = massToRadius(a.mass);
                const rB = massToRadius(b.mass);

                if (d < rA + rB) {
                    // Absorb b into a
                    const totalMass = a.mass + b.mass;
                    a.x = (a.x * a.mass + b.x * b.mass) / totalMass;
                    a.y = (a.y * a.mass + b.y * b.mass) / totalMass;
                    a.mass = totalMass;
                    this.cells.splice(j, 1);
                    j--;
                }
            }
        }
    }

    /**
     * Split cell toward a target. Each eligible sub-cell splits in half.
     * @param {number} tx - Target X
     * @param {number} ty - Target Y
     */
    split(tx, ty) {
        if (this.cells.length >= MAX_CELLS) return;

        const newCells = [];
        for (const c of this.cells) {
            if (c.mass < MIN_SPLIT_MASS) continue;
            if (this.cells.length + newCells.length >= MAX_CELLS) break;

            const half = c.mass / 2;
            c.mass = half;

            const dx = tx - c.x;
            const dy = ty - c.y;
            const d = Math.sqrt(dx * dx + dy * dy) || 1;
            const pushDist = massToRadius(half) * 3;

            const nc = {
                x: clamp(c.x + (dx / d) * pushDist, 0, WORLD_SIZE),
                y: clamp(c.y + (dy / d) * pushDist, 0, WORLD_SIZE),
                mass: half,
                vx: (dx / d) * 10,
                vy: (dy / d) * 10,
                splitTime: Date.now(),
                wobbleSeed: Math.random() * Math.PI * 2,
                wobblePhase: Math.random() * Math.PI * 2
            };

            c.splitTime = Date.now();
            newCells.push(nc);
        }

        if (newCells.length > 0) {
            this.cells.push(...newCells);
            playSound('split');
        }
    }

    /**
     * Eject a blob of mass in a direction.
     * @param {number} tx - Target X
     * @param {number} ty - Target Y
     * @returns {Object|null} Ejected food object, or null
     */
    ejectMass(tx, ty) {
        for (const c of this.cells) {
            if (c.mass < 30) continue;

            c.mass -= 12;
            const dx = tx - c.x;
            const dy = ty - c.y;
            const d = Math.sqrt(dx * dx + dy * dy) || 1;

            playSound('eject');

            return {
                x: c.x + (dx / d) * (massToRadius(c.mass) + 10),
                y: c.y + (dy / d) * (massToRadius(c.mass) + 10),
                mass: 12,
                color: this.color,
                radius: massToRadius(12),
                ejected: true
            };
        }
        return null;
    }

    /**
     * Apply mass decay — large cells slowly lose mass over time.
     */
    decay() {
        for (const c of this.cells) {
            if (c.mass > START_MASS) {
                c.mass *= DECAY_RATE;
            }
        }
    }

    /**
     * Draw this cell (all sub-cells) on the canvas.
     * @param {CanvasRenderingContext2D} ctx
     * @param {Object} cam - Camera { x, y, zoom }
     * @param {number} W - Canvas width
     * @param {number} H - Canvas height
     */
    draw(ctx, cam, W, H) {
        const now = Date.now() / 1000;

        for (const c of this.cells) {
            const sx = (c.x - cam.x) * cam.zoom + W / 2;
            const sy = (c.y - cam.y) * cam.zoom + H / 2;
            const baseR = massToRadius(c.mass) * cam.zoom;

            // Frustum culling
            if (sx + baseR < -50 || sx - baseR > W + 50 || sy + baseR < -50 || sy - baseR > H + 50) continue;

            const seed = c.wobbleSeed || 0;
            const phase = c.wobblePhase || 0;

            // ── Pulse: gentle breathe in/out ──
            const pulse = 1 + 0.025 * Math.sin(now * 1.8 + seed);
            const sr = baseR * pulse;

            // ── Wobbly amoeba path ──
            // 7 harmonics of sine noise along the perimeter
            const POINTS = 64;
            const wobbleAmp = sr * 0.09; // how far the edge can deviate
            function wobbleR(angle) {
                return sr
                    + wobbleAmp * Math.sin(3 * angle + now * 1.1 + seed)
                    + wobbleAmp * 0.6 * Math.sin(5 * angle - now * 0.7 + phase)
                    + wobbleAmp * 0.3 * Math.sin(7 * angle + now * 0.5 + seed * 2);
            }

            // ── Outer glow ──
            const grad = ctx.createRadialGradient(sx, sy, sr * 0.5, sx, sy, sr * 1.4);
            grad.addColorStop(0, this.color + '30');
            grad.addColorStop(1, this.color + '00');
            ctx.beginPath();
            ctx.arc(sx, sy, sr * 1.4, 0, Math.PI * 2);
            ctx.fillStyle = grad;
            ctx.fill();

            // ── Main amoeba body ──
            ctx.beginPath();
            for (let i = 0; i <= POINTS; i++) {
                const angle = (i / POINTS) * Math.PI * 2;
                const r = wobbleR(angle);
                const px = sx + Math.cos(angle) * r;
                const py = sy + Math.sin(angle) * r;
                i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fillStyle = this.color + 'cc';
            ctx.fill();

            // ── Membrane: inner ring ──
            ctx.beginPath();
            for (let i = 0; i <= POINTS; i++) {
                const angle = (i / POINTS) * Math.PI * 2;
                const r = wobbleR(angle) * 0.88;
                const px = sx + Math.cos(angle) * r;
                const py = sy + Math.sin(angle) * r;
                i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.strokeStyle = this.color + '55';
            ctx.lineWidth = Math.max(1, sr * 0.06);
            ctx.stroke();

            // ── Outer border (follows wobble) ──
            ctx.beginPath();
            for (let i = 0; i <= POINTS; i++) {
                const angle = (i / POINTS) * Math.PI * 2;
                const r = wobbleR(angle);
                const px = sx + Math.cos(angle) * r;
                const py = sy + Math.sin(angle) * r;
                i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.strokeStyle = this.color;
            ctx.lineWidth = Math.max(1, 2 * cam.zoom);
            ctx.stroke();

            // ── Nucleus ──
            if (sr > 10) {
                const nR = sr * 0.22;
                const nX = sx + sr * 0.1;
                const nY = sy - sr * 0.1;
                // Nucleus body
                ctx.beginPath();
                ctx.arc(nX, nY, nR, 0, Math.PI * 2);
                ctx.fillStyle = this.color + '50';
                ctx.fill();
                ctx.strokeStyle = this.color + 'aa';
                ctx.lineWidth = Math.max(1, nR * 0.2);
                ctx.stroke();
                // Nucleolus (tiny bright dot inside nucleus)
                ctx.beginPath();
                ctx.arc(nX - nR * 0.2, nY - nR * 0.2, nR * 0.35, 0, Math.PI * 2);
                ctx.fillStyle = this.color + 'dd';
                ctx.fill();
            }

            // ── Name and mass text ──
            if (sr > 15) {
                ctx.fillStyle = '#fff';
                ctx.font = `bold ${Math.max(10, sr * 0.45)}px Orbitron, monospace`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(this.name, sx, sy + sr * 0.05);

                ctx.fillStyle = 'rgba(255,255,255,0.5)';
                ctx.font = `${Math.max(8, sr * 0.3)}px Rajdhani, sans-serif`;
                ctx.fillText(Math.floor(c.mass), sx, sy + sr * 0.38);
            }
        }
    }
}