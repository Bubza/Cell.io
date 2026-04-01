// ═══════════════════════════════════════════════════════════════════
// enemy.js — Bot/Enemy Class with FSM AI
//
// Each bot is controlled by a Finite State Machine with 6 states:
//   1. WANDER     — Roam randomly, eat nearby food
//   2. HUNT       — Pursue smaller cells and food
//   3. FLEE       — Run away from larger threats
//   4. AGGRESSIVE — Actively target the player (split-attack)
//   5. DEAD       — Wait for respawn timer
//   6. MERGE      — Regroup split cells before acting
//
// Transition Table:
// ┌────────────┬──────────────────────────────┬────────────┬──────────────────────────┐
// │ From       │ Condition                    │ To         │ Action                   │
// ├────────────┼──────────────────────────────┼────────────┼──────────────────────────┤
// │ ANY        │ totalMass <= 0               │ DEAD       │ Start respawn timer      │
// │ WANDER     │ Threat within 300px          │ FLEE       │ Set target to threat     │
// │ WANDER     │ Prey within 400px            │ HUNT       │ Set target to prey       │
// │ WANDER     │ Player near & bot is big     │ AGGRESSIVE │ Target the player        │
// │ HUNT       │ Threat within 250px          │ FLEE       │ Switch to fleeing        │
// │ HUNT       │ Player near & bot > player   │ AGGRESSIVE │ Go offensive             │
// │ HUNT       │ Too many cells               │ MERGE      │ Regroup first            │
// │ HUNT       │ Prey escapes (>500px)        │ WANDER     │ Resume roaming           │
// │ AGGRESSIVE │ Bigger threat appears         │ FLEE       │ Abort attack             │
// │ AGGRESSIVE │ Player escapes or bot shrinks│ WANDER     │ Give up chase            │
// │ FLEE       │ No threats within 400px      │ WANDER     │ Safe to roam again       │
// │ FLEE       │ Multi-cell & no threats      │ MERGE      │ Regroup while safe       │
// │ MERGE      │ Single cell again            │ WANDER     │ Done merging             │
// │ DEAD       │ Respawn timer expires        │ WANDER     │ Respawn at random loc    │
// └────────────┴──────────────────────────────┴────────────┴──────────────────────────┘
// ═══════════════════════════════════════════════════════════════════

import { Cell } from './cell.js';
import { FSM } from './fsm.js';
import {
    dist, clamp, massToRadius, randomColor,
    WORLD_SIZE, START_MASS, MIN_SPLIT_MASS
} from './utils.js';

/**
 * Find the nearest entity that is bigger than the bot (a threat).
 * @param {Bot} bot
 * @param {number} range - Search radius
 * @param {Object|null} player - Player object
 * @param {Array} allBots - All bots in the game
 * @returns {Object|null}
 */
export function findNearestThreat(bot, range, player, allBots) {
    let nearest = null;
    let minD = range;

    // Check player cells
    if (player && player.alive) {
        for (const c of player.cells) {
            const d = dist(bot, c);
            if (d < minD && c.mass > bot.totalMass * 1.15) {
                minD = d;
                nearest = { x: c.x, y: c.y, totalMass: c.mass };
            }
        }
    }

    // Check other bots
    for (const b of allBots) {
        if (b === bot || !b.alive) continue;
        const d = dist(bot, b);
        if (d < minD && b.totalMass > bot.totalMass * 1.15) {
            minD = d;
            nearest = b;
        }
    }

    return nearest;
}

/**
 * Find the nearest food or smaller entity (prey).
 * @param {Bot} bot
 * @param {number} range - Search radius
 * @param {Object|null} player - Player object
 * @param {Array} allBots - All bots in the game
 * @param {Array} food - All food items
 * @returns {Object|null}
 */
export function findNearestPrey(bot, range, player, allBots, food) {
    let nearest = null;
    let minD = range;

    // Check food
    for (const f of food) {
        const d = dist(bot, f);
        if (d < minD) {
            minD = d;
            nearest = f;
        }
    }

    // Check player cells
    if (player && player.alive) {
        for (const c of player.cells) {
            const d = dist(bot, c);
            if (d < minD && bot.totalMass > c.mass * 1.15) {
                minD = d;
                nearest = { x: c.x, y: c.y, totalMass: c.mass };
            }
        }
    }

    // Check smaller bots
    for (const b of allBots) {
        if (b === bot || !b.alive) continue;
        const d = dist(bot, b);
        if (d < minD && bot.totalMass > b.totalMass * 1.15) {
            minD = d;
            nearest = b;
        }
    }

    return nearest;
}

// ═══════════════════════════════════════════════════════════════════
// BOT CLASS
// ═══════════════════════════════════════════════════════════════════
export class Bot extends Cell {
    /**
     * @param {number} x
     * @param {number} y
     * @param {number} mass
     * @param {string} color
     * @param {string} name
     */
    constructor(x, y, mass, color, name) {
        super(x, y, mass, color, name, false);

        this.target = null;          // Current target entity/position
        this.patrolTarget = {        // Random wander destination
            x: Math.random() * WORLD_SIZE,
            y: Math.random() * WORLD_SIZE
        };
        this.splitCooldown = 0;      // Frames until split is available again
        this.respawnTimer = 0;       // Frames until respawn
        this.aggressionLevel = 0.3 + Math.random() * 0.7; // Personality trait

        // References set by the game manager
        this._playerRef = null;
        this._botsRef = [];
        this._foodRef = [];

        // Build the FSM
        this.fsm = this._createFSM();
    }

    /**
     * Set references to game world objects (called by game manager).
     * @param {Object} player
     * @param {Array} bots
     * @param {Array} food
     */
    setWorldRefs(player, bots, food) {
        this._playerRef = player;
        this._botsRef = bots;
        this._foodRef = food;
    }

    /**
     * Build the FSM with all 6 states and transition rules.
     * @returns {FSM}
     */
    _createFSM() {
        const bot = this;

        return new FSM({
            initial: 'WANDER',
            states: {
                // ── STATE 1: WANDER ──
                // Default idle state. Moves toward random patrol points.
                WANDER: {
                    enter: () => {
                        bot.pickNewPatrolPoint();
                    },
                    update: (owner, dt) => {
                        owner.moveToward(owner.patrolTarget.x, owner.patrolTarget.y, dt);
                        if (dist(owner, owner.patrolTarget) < 80) {
                            owner.pickNewPatrolPoint();
                        }
                    },
                    exit: () => { }
                },

                // ── STATE 2: HUNT ──
                // Chasing food or a smaller cell.
                // Target is refreshed every frame so stale references (eaten food) never freeze the bot.
                HUNT: {
                    enter: () => { },
                    update: (owner, dt) => {
                        // Always re-evaluate nearest prey so we never chase a stale/eaten food position
                        const prey = findNearestPrey(owner, 400, owner._playerRef, owner._botsRef, owner._foodRef);
                        owner.target = prey; // null if nothing found — triggers HUNT→WANDER next frame
                        if (owner.target) {
                            owner.moveToward(owner.target.x, owner.target.y, dt);
                        }
                    },
                    exit: () => { }
                },

                // ── STATE 3: FLEE ──
                // Running away from a larger threat.
                // Threat position is refreshed every frame so the flee direction stays accurate.
                FLEE: {
                    enter: () => { },
                    update: (owner, dt) => {
                        // Refresh to the nearest current threat so we flee from its live position
                        const threat = findNearestThreat(owner, 400, owner._playerRef, owner._botsRef);
                        if (threat) owner.target = threat;

                        if (owner.target) {
                            // Move in the opposite direction from the threat
                            const dx = owner.x - owner.target.x;
                            const dy = owner.y - owner.target.y;
                            const d = Math.sqrt(dx * dx + dy * dy) || 1;
                            const fleeX = clamp(owner.x + (dx / d) * 400, 50, WORLD_SIZE - 50);
                            const fleeY = clamp(owner.y + (dy / d) * 400, 50, WORLD_SIZE - 50);
                            owner.moveToward(fleeX, fleeY, dt);
                        }
                    },
                    exit: () => { }
                },

                // ── STATE 4: AGGRESSIVE ──
                // Actively targeting the player, will attempt split-attacks.
                // Player position is refreshed every frame so the bot tracks movement correctly.
                AGGRESSIVE: {
                    enter: (owner) => {
                        // Immediately lock onto the player when entering this state
                        const p = owner._playerRef;
                        if (p && p.alive) owner.target = { x: p.centerX, y: p.centerY };
                    },
                    update: (owner, dt) => {
                        // Refresh target to player's current live position every frame
                        const p = owner._playerRef;
                        if (p && p.alive) owner.target = { x: p.centerX, y: p.centerY };

                        if (owner.target) {
                            owner.moveToward(owner.target.x, owner.target.y, dt);

                            // Attempt a split-attack if conditions are right
                            if (owner.splitCooldown <= 0 && owner.totalMass > MIN_SPLIT_MASS * 2) {
                                const d = dist(owner, owner.target);
                                const r = massToRadius(owner.totalMass);
                                if (d < r * 4 && d > r * 1.5) {
                                    owner.split(owner.target.x, owner.target.y);
                                    owner.splitCooldown = 8000;
                                }
                            }
                        }
                    },
                    exit: () => { }
                },

                // ── STATE 5: DEAD ──
                // Waiting to respawn after being consumed.
                DEAD: {
                    enter: (owner) => {
                        owner.alive = false;
                        owner.respawnTimer = 3000 + Math.random() * 4000;
                    },
                    update: (owner, dt) => {
                        owner.respawnTimer -= dt * 16.67; // Convert frames to ms approx
                        if (owner.respawnTimer <= 0) {
                            owner.respawn();
                        }
                    },
                    exit: () => { }
                },

                // ── STATE 6: MERGE ──
                // Moving sub-cells toward center to regroup before next action.
                MERGE: {
                    enter: () => { },
                    update: (owner, dt) => {
                        const cx = owner.centerX;
                        const cy = owner.centerY;
                        owner.moveToward(cx, cy, dt);
                    },
                    exit: () => { }
                }
            },

            transitions: [
                // ── DEATH TRANSITION (from any state) ──
                {
                    from: 'ANY',
                    to: 'DEAD',
                    condition: (owner) => owner.alive && owner.totalMass <= 0
                },

                // ── FLEE TRANSITIONS ──
                {
                    from: 'WANDER',
                    to: 'FLEE',
                    condition: (owner) => {
                        const threat = findNearestThreat(owner, 300, owner._playerRef, owner._botsRef);
                        if (threat) { owner.target = threat; return true; }
                        return false;
                    }
                },
                {
                    from: 'HUNT',
                    to: 'FLEE',
                    condition: (owner) => {
                        const threat = findNearestThreat(owner, 250, owner._playerRef, owner._botsRef);
                        if (threat) { owner.target = threat; return true; }
                        return false;
                    }
                },
                {
                    from: 'AGGRESSIVE',
                    to: 'FLEE',
                    condition: (owner) => {
                        const threat = findNearestThreat(owner, 200, owner._playerRef, owner._botsRef);
                        if (threat && threat.totalMass > owner.totalMass * 1.5) {
                            owner.target = threat;
                            return true;
                        }
                        return false;
                    }
                },

                // ── HUNT TRANSITIONS ──
                {
                    from: 'WANDER',
                    to: 'HUNT',
                    condition: (owner) => {
                        const prey = findNearestPrey(owner, 400, owner._playerRef, owner._botsRef, owner._foodRef);
                        if (prey) { owner.target = prey; return true; }
                        return false;
                    }
                },

                // ── AGGRESSIVE TRANSITIONS ──
                {
                    from: 'HUNT',
                    to: 'AGGRESSIVE',
                    condition: (owner) => {
                        const p = owner._playerRef;
                        if (!p || !p.alive) return false;
                        const d = dist(owner, p);
                        if (d < 500 && owner.totalMass > p.totalMass * 1.15 && owner.aggressionLevel > 0.6) {
                            owner.target = { x: p.centerX, y: p.centerY }; // Lock onto player
                            return true;
                        }
                        return false;
                    }
                },
                {
                    from: 'WANDER',
                    to: 'AGGRESSIVE',
                    condition: (owner) => {
                        const p = owner._playerRef;
                        if (!p || !p.alive) return false;
                        const d = dist(owner, p);
                        if (d < 350 && owner.totalMass > p.totalMass * 1.3 && owner.aggressionLevel > 0.7) {
                            owner.target = { x: p.centerX, y: p.centerY }; // Lock onto player
                            return true;
                        }
                        return false;
                    }
                },

                // ── MERGE TRANSITIONS ──
                {
                    from: 'FLEE',
                    to: 'MERGE',
                    condition: (owner) => {
                        return owner.cells.length > 2 &&
                            !findNearestThreat(owner, 300, owner._playerRef, owner._botsRef);
                    }
                },
                {
                    from: 'HUNT',
                    to: 'MERGE',
                    condition: (owner) => owner.cells.length > 3
                },

                // ── RETURN TO WANDER ──
                {
                    from: 'FLEE',
                    to: 'WANDER',
                    condition: (owner) => {
                        return !findNearestThreat(owner, 400, owner._playerRef, owner._botsRef);
                    }
                },
                {
                    from: 'HUNT',
                    to: 'WANDER',
                    condition: (owner) => {
                        if (!owner.target) return true;
                        return dist(owner, owner.target) > 500;
                    }
                },
                {
                    from: 'AGGRESSIVE',
                    to: 'WANDER',
                    condition: (owner) => {
                        const p = owner._playerRef;
                        if (!p || !p.alive) return true;
                        return dist(owner, p) > 600 || owner.totalMass < p.totalMass * 0.9;
                    }
                },
                {
                    from: 'MERGE',
                    to: 'WANDER',
                    condition: (owner) => owner.cells.length <= 1
                }
            ]
        }, this);
    }

    /**
     * Pick a new random patrol destination near the bot's current position.
     */
    pickNewPatrolPoint() {
        this.patrolTarget = {
            x: clamp(this.x + (Math.random() - 0.5) * 1200, 100, WORLD_SIZE - 100),
            y: clamp(this.y + (Math.random() - 0.5) * 1200, 100, WORLD_SIZE - 100)
        };
    }

    /**
     * Respawn the bot at a random location with fresh mass.
     */
    respawn() {
        this.x = Math.random() * WORLD_SIZE;
        this.y = Math.random() * WORLD_SIZE;
        this.mass = START_MASS + Math.random() * 30;
        this.cells = [{ x: this.x, y: this.y, mass: this.mass, vx: 0, vy: 0, splitTime: 0 }];
        this.alive = true;
        this.target = null;
        this.color = randomColor();
        this.fsm.changeState('WANDER');
    }

    /**
     * Per-frame update: advance FSM, decay mass, update cooldowns.
     * @param {number} dt
     */
    update(dt) {
        if (this.splitCooldown > 0) this.splitCooldown -= dt * 16.67;
        this.fsm.update(dt, {});
        this.decay();
    }
}