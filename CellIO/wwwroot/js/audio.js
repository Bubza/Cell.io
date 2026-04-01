// ═══════════════════════════════════════════════════════════════════
// audio.js — Sound Effects & Background Music System
// Uses the Web Audio API to generate all sounds procedurally.
// No external audio files needed.
// ═══════════════════════════════════════════════════════════════════

const AudioCtx = window.AudioContext || window.webkitAudioContext;

let audioCtx = null;
let soundEnabled = true;
let droneOsc = null;
let droneGain = null;

/**
 * Initialize the audio context. Must be called after a user gesture.
 */
export function initAudio() {
  if (!audioCtx) {
    audioCtx = new AudioCtx();
  }
}

/**
 * Toggle sound on/off.
 * @returns {boolean} New sound state
 */
export function toggleSound() {
  soundEnabled = !soundEnabled;
  if (droneGain) {
    droneGain.gain.value = soundEnabled ? 0.03 : 0;
  }
  return soundEnabled;
}

/**
 * Check if sound is currently enabled.
 * @returns {boolean}
 */
export function isSoundEnabled() {
  return soundEnabled;
}

/**
 * Play a procedurally generated sound effect.
 * @param {string} type - Sound type: 'eat', 'split', 'death', 'eject', 'virus'
 */
export function playSound(type) {
  if (!soundEnabled || !audioCtx) return;

  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    switch (type) {
      case 'eat':
        // Short rising blip — satisfying collect sound
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(900, now + 0.08);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
        break;

      case 'split':
        // Descending saw — whoosh of splitting
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.2);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
        break;

      case 'death':
        // Long descending saw — dramatic elimination
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(60, now + 0.6);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
        osc.start(now);
        osc.stop(now + 0.7);
        break;

      case 'eject':
        // Quick descending triangle — mass ejection pop
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(500, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.1);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.start(now);
        osc.stop(now + 0.12);
        break;

      case 'virus':
        // Low square wave — dangerous pop
        osc.type = 'square';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.3);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
        break;
    }
  } catch (e) {
    // Silently fail — audio is non-critical
  }
}

/**
 * Start background ambient drone (low sine wave).
 */
export function startDrone() {
  if (!audioCtx || droneOsc) return;
  try {
    droneOsc = audioCtx.createOscillator();
    droneGain = audioCtx.createGain();
    droneOsc.type = 'sine';
    droneOsc.frequency.value = 55; // Low A
    droneGain.gain.value = soundEnabled ? 0.03 : 0;
    droneOsc.connect(droneGain);
    droneGain.connect(audioCtx.destination);
    droneOsc.start();
  } catch (e) {
    // Silently fail
  }
}

/**
 * Stop background drone.
 */
export function stopDrone() {
  try {
    if (droneOsc) {
      droneOsc.stop();
      droneOsc = null;
    }
  } catch (e) {
    droneOsc = null;
  }
}

/**
 * Mute the drone (e.g., when pausing).
 */
export function muteDrone() {
  if (droneGain) droneGain.gain.value = 0;
}

/**
 * Unmute the drone (e.g., when resuming).
 */
export function unmuteDrone() {
  if (droneGain && soundEnabled) droneGain.gain.value = 0.03;
}
