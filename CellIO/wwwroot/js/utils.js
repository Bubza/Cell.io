// ═══════════════════════════════════════════════════════════════════
// utils.js — Utility Functions and Game Constants
// ═══════════════════════════════════════════════════════════════════

// ── WORLD CONSTANTS ──
export const WORLD_SIZE = 5000;
export const FOOD_COUNT = 600;
export const BOT_COUNT = 15;
export const VIRUS_COUNT = 8;
export const FOOD_MASS = 1;
export const START_MASS = 20;
export const MIN_SPLIT_MASS = 40;
export const MERGE_TIME = 15000;  // ms before split cells can merge
export const DECAY_RATE = 0.9998; // mass decay per frame for large cells
export const BASE_SPEED = 4;
export const MAX_CELLS = 8;       // max split pieces per entity

// ── CELL COLORS ──
export const CELL_COLORS = [
  '#ff2d75', '#00f0ff', '#7b2dff', '#ffa726', '#5aff8a',
  '#ff6b6b', '#48dbfb', '#ffd32a', '#ff9ff3', '#54a0ff',
  '#00d2d3', '#ff6348', '#2ed573', '#eccc68', '#a29bfe',
  '#fd79a8', '#6c5ce7', '#00cec9', '#fab1a0', '#e17055'
];

// ── BOT NAMES ──
export const BOT_NAMES = [
  'Blob', 'Nom', 'Devour', 'Gobble', 'Munch', 'Chomp',
  'Gulp', 'Nibble', 'Snack', 'Feast', 'Gloop', 'Ooze',
  'Splat', 'Jelly', 'Plop', 'Slurp', 'Bloop', 'Fizz',
  'Morph', 'Flux', 'Drift', 'Nova', 'Pixel', 'Byte',
  'Void', 'Echo', 'Glitch', 'Neon', 'Pulse', 'Surge'
];

// ── MATH UTILITIES ──

/**
 * Calculate distance between two objects with x, y properties.
 * @param {Object} a - {x, y}
 * @param {Object} b - {x, y}
 * @returns {number}
 */
export function dist(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/**
 * Convert mass value to a visual radius.
 * @param {number} mass
 * @returns {number}
 */
export function massToRadius(mass) {
  return Math.sqrt(mass) * 4;
}

/**
 * Clamp a value between min and max.
 * @param {number} v
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

/**
 * Linear interpolation between two values.
 * @param {number} a - Start value
 * @param {number} b - End value
 * @param {number} t - Interpolation factor (0-1)
 * @returns {number}
 */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Get a random color from the palette.
 * @returns {string}
 */
export function randomColor() {
  return CELL_COLORS[Math.floor(Math.random() * CELL_COLORS.length)];
}

/**
 * Get a random bot name.
 * @returns {string}
 */
export function randomName() {
  return BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
}

/**
 * Generate a random number within a range.
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function randomRange(min, max) {
  return min + Math.random() * (max - min);
}
