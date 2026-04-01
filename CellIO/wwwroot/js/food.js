// ═══════════════════════════════════════════════════════════════════
// food.js — Food, Virus, and Particle Systems
// ═══════════════════════════════════════════════════════════════════

import {
    randomColor, massToRadius,
    WORLD_SIZE, FOOD_COUNT, VIRUS_COUNT, FOOD_MASS
} from './utils.js';

// ── FOOD ──

/**
 * Create the initial batch of food.
 * @returns {Array}
 */
export function createFood() {
    const food = [];
    for (let i = 0; i < FOOD_COUNT; i++) {
        food.push(createFoodItem());
    }
    return food;
}

/**
 * Create a single food item at a random position.
 * @returns {Object}
 */
export function createFoodItem() {
    return {
        x: Math.random() * WORLD_SIZE,
        y: Math.random() * WORLD_SIZE,
        mass: FOOD_MASS,
        color: randomColor(),
        radius: 5 + Math.random() * 3,
        ejected: false
    };
}

// ── VIRUSES ──

/**
 * Create the initial set of viruses (green spiky cells).
 * @returns {Array}
 */
export function createViruses() {
    const viruses = [];
    for (let i = 0; i < VIRUS_COUNT; i++) {
        viruses.push({
            x: 200 + Math.random() * (WORLD_SIZE - 400),
            y: 200 + Math.random() * (WORLD_SIZE - 400),
            mass: 35,
            radius: massToRadius(35),
            spikes: 18 + Math.floor(Math.random() * 8)
        });
    }
    return viruses;
}

/**
 * Respawn a virus at a new random location.
 * @param {Object} virus
 */
export function respawnVirus(virus) {
    virus.x = 200 + Math.random() * (WORLD_SIZE - 400);
    virus.y = 200 + Math.random() * (WORLD_SIZE - 400);
    virus.mass = 35;
    virus.radius = massToRadius(35);
}

// ── PARTICLES ──

/**
 * Spawn burst particles at a position (visual feedback).
 * @param {Array} particleArray - Reference to the particles array
 * @param {number} x
 * @param {number} y
 * @param {string} color
 * @param {number} count
 */
export function spawnParticles(particleArray, x, y, color, count) {
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1 + Math.random() * 4;
        particleArray.push({
            x,
            y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 1,
            color,
            radius: 2 + Math.random() * 4
        });
    }
}

/**
 * Update and cull dead particles.
 * @param {Array} particles
 */
export function updateParticles(particles) {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.025;
        p.vx *= 0.96;
        p.vy *= 0.96;

        if (p.life <= 0) {
            particles.splice(i, 1);
        }
    }
}