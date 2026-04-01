// ═══════════════════════════════════════════════════════════════════
// player.js — Player Class
// 
// Extends Cell with player-specific behavior.
// The player is controlled by mouse movement.
// Supports splitting, ejecting mass, and zoom tracking.
// ═══════════════════════════════════════════════════════════════════

import { Cell } from './cell.js';
import { START_MASS } from './utils.js';

export class Player extends Cell {
  /**
   * @param {number} x
   * @param {number} y
   * @param {string} name - Player's chosen name
   * @param {string} color
   */
  constructor(x, y, name, color = '#00f0ff') {
    super(x, y, START_MASS, color, name, true);
    this.score = 0;
    this.highScore = 0;
    this.killCount = 0;
    this.timeAlive = 0; // frames
  }

  /**
   * Per-frame update: move toward mouse world coordinates and decay.
   * @param {number} worldMouseX
   * @param {number} worldMouseY
   * @param {number} dt
   */
  update(worldMouseX, worldMouseY, dt) {
    if (!this.alive) return;
    this.moveToward(worldMouseX, worldMouseY, dt);
    this.decay();
    this.timeAlive += dt;
  }

  /**
   * Add score when eating food or other cells.
   * @param {number} amount
   */
  addScore(amount) {
    this.score += Math.floor(amount);
    if (this.score > this.highScore) {
      this.highScore = this.score;
    }
  }

  /**
   * Called when the player is completely consumed.
   * @returns {Object} Final stats
   */
  die() {
    this.alive = false;
    return {
      score: this.score,
      highScore: this.highScore,
      killCount: this.killCount,
      timeAlive: this.timeAlive
    };
  }

  /**
   * Get the optimal camera zoom level based on player size.
   * @returns {number}
   */
  getTargetZoom() {
    // Larger player = more zoomed out
    const zoom = 60 / Math.sqrt(this.totalMass);
    return Math.max(0.15, Math.min(1.5, zoom));
  }
}
