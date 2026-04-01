// ═══════════════════════════════════════════════════════════════════
// fsm.js — Reusable Finite State Machine Class
// 
// This module implements a generic FSM that can be attached to any
// game entity. It manages states, transitions, and keeps a history
// log of all state changes for debugging.
//
// FSM States:
//   Each state is an object with optional enter(), update(), exit() 
//   callbacks that receive the owner entity.
//
// FSM Transitions:
//   Each transition has: from (state name or 'ANY'), to (target state),
//   and condition (function returning boolean).
//
// Usage:
//   const fsm = new FSM({
//     initial: 'IDLE',
//     states: { IDLE: { enter, update, exit }, ... },
//     transitions: [{ from: 'IDLE', to: 'RUN', condition: (owner, ctx) => ... }]
//   }, ownerEntity);
//
//   // In game loop:
//   fsm.update(dt, context);
// ═══════════════════════════════════════════════════════════════════

export class FSM {
  /**
   * Create a new Finite State Machine.
   * @param {Object} config - FSM configuration
   * @param {string} config.initial - The initial state name
   * @param {Object} config.states - Map of state names to state objects { enter, update, exit }
   * @param {Array}  config.transitions - Array of transition objects { from, to, condition }
   * @param {Object} owner - The entity this FSM controls
   */
  constructor(config, owner) {
    this.states = config.states;
    this.transitions = config.transitions;
    this.owner = owner;
    this.currentState = config.initial;
    this.previousState = null;
    this.stateTime = 0;          // Time spent in current state (in frames)
    this.totalTransitions = 0;   // Total number of transitions made
    this.history = [];            // Log of recent state changes

    // Call enter() on the initial state
    const initialState = this.states[this.currentState];
    if (initialState && initialState.enter) {
      initialState.enter(owner);
    }
  }

  /**
   * Evaluate all transitions and update the current state.
   * Called once per frame.
   * @param {number} dt - Delta time (frame count)
   * @param {Object} context - Additional context data (e.g., game world info)
   */
  update(dt, context) {
    this.stateTime += dt;

    // Evaluate transitions — first matching transition wins
    for (const t of this.transitions) {
      const matchesCurrent = (t.from === this.currentState || t.from === 'ANY');
      if (matchesCurrent && t.condition(this.owner, context)) {
        this.changeState(t.to);
        break; // Only one transition per frame
      }
    }

    // Execute current state's update logic
    const state = this.states[this.currentState];
    if (state && state.update) {
      state.update(this.owner, dt, context);
    }
  }

  /**
   * Force a state transition.
   * Calls exit() on old state and enter() on new state.
   * @param {string} newState - Name of the target state
   */
  changeState(newState) {
    if (newState === this.currentState) return;

    // Exit old state
    const oldState = this.states[this.currentState];
    if (oldState && oldState.exit) {
      oldState.exit(this.owner);
    }

    // Record transition in history
    this.previousState = this.currentState;
    this.history.push({
      from: this.currentState,
      to: newState,
      time: Date.now(),
      frameTime: this.stateTime
    });

    // Keep history manageable
    if (this.history.length > 30) {
      this.history.shift();
    }

    this.totalTransitions++;

    // Enter new state
    this.currentState = newState;
    this.stateTime = 0;

    const nState = this.states[newState];
    if (nState && nState.enter) {
      nState.enter(this.owner);
    }
  }

  /**
   * Get the current state name.
   * @returns {string}
   */
  getState() {
    return this.currentState;
  }

  /**
   * Get the previous state name (null if no transition has occurred).
   * @returns {string|null}
   */
  getPreviousState() {
    return this.previousState;
  }

  /**
   * Get the time spent in the current state (in frames).
   * @returns {number}
   */
  getStateTime() {
    return this.stateTime;
  }

  /**
   * Get transition history (most recent last).
   * @returns {Array}
   */
  getHistory() {
    return this.history;
  }

  /**
   * Check if the FSM is currently in a specific state.
   * @param {string} stateName
   * @returns {boolean}
   */
  isInState(stateName) {
    return this.currentState === stateName;
  }
}
