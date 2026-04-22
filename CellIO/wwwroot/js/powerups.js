// ═══════════════════════════════════════════════════════════════════
// powerups.js — Power-up system
// Types: speed, shield, toxin
// ═══════════════════════════════════════════════════════════════════
import { WORLD_SIZE } from './utils.js';

export const POWERUP_TYPES = {
    speed: { color: '#ffd32a', icon: '⚡', label: 'SPEED BOOST', duration: 5000 },
    shield: { color: '#00f0ff', icon: '🛡', label: 'SHIELD', duration: 6000 },
    toxin: { color: '#5aff8a', icon: '☠', label: 'TOXIN CLOUD', duration: 4000 },
};

export function createPowerup() {
    const types = Object.keys(POWERUP_TYPES);
    const type = types[Math.floor(Math.random() * types.length)];
    return {
        x: 100 + Math.random() * (WORLD_SIZE - 200),
        y: 100 + Math.random() * (WORLD_SIZE - 200),
        type,
        radius: 18,
        pulse: Math.random() * Math.PI * 2,
        age: 0,
        lifespan: 30000, // ms before despawn
    };
}

export function updatePowerups(powerups, dt) {
    const now = Date.now();
    for (let i = powerups.length - 1; i >= 0; i--) {
        powerups[i].age += dt * 16;
        if (powerups[i].age > powerups[i].lifespan) powerups.splice(i, 1);
    }
}

export function drawPowerups(ctx, powerups, cam, W, H) {
    const now = Date.now() / 1000;
    for (const p of powerups) {
        const sx = (p.x - cam.x) * cam.zoom + W / 2;
        const sy = (p.y - cam.y) * cam.zoom + H / 2;
        const sr = p.radius * cam.zoom;
        if (sx + sr < -50 || sx - sr > W + 50 || sy + sr < -50 || sy - sr > H + 50) continue;

        const def = POWERUP_TYPES[p.type];
        const pulse = 1 + 0.15 * Math.sin(now * 3 + p.pulse);

        // Outer ring glow
        ctx.beginPath();
        ctx.arc(sx, sy, sr * 1.5 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = def.color + '22';
        ctx.fill();

        // Main circle
        ctx.beginPath();
        ctx.arc(sx, sy, sr * pulse, 0, Math.PI * 2);
        ctx.fillStyle = def.color + 'cc';
        ctx.fill();
        ctx.strokeStyle = def.color;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Icon text
        ctx.font = `${Math.max(10, sr * 1.0)}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(def.icon, sx, sy);
    }
}

// Apply power-up effect to player
export function applyPowerup(player, type, activeEffects) {
    const def = POWERUP_TYPES[type];
    activeEffects[type] = { expiresAt: Date.now() + def.duration };
}

// Check if player has active effect
export function hasEffect(activeEffects, type) {
    const e = activeEffects[type];
    return e && Date.now() < e.expiresAt;
}

// Draw active effects HUD bar
export function drawEffectsHUD(ctx, activeEffects, W, H) {
    const now = Date.now();
    let x = W / 2 - 120;
    const y = H - 50;
    for (const [type, e] of Object.entries(activeEffects)) {
        if (now >= e.expiresAt) continue;
        const def = POWERUP_TYPES[type];
        const remaining = (e.expiresAt - now) / def.duration;

        // Background pill
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath();
        ctx.roundRect(x, y, 100, 28, 6);
        ctx.fill();

        // Progress bar
        ctx.fillStyle = def.color + 'aa';
        ctx.beginPath();
        ctx.roundRect(x, y, 100 * remaining, 28, 6);
        ctx.fill();

        // Label
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px Orbitron, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(def.icon + ' ' + def.label, x + 50, y + 14);

        x += 110;
    }
}