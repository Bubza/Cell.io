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
            case 'eat': {
                // Wet slurp — low freq blub rising then dropping
                const filter = audioCtx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.value = 600;
                osc.connect(filter);
                filter.connect(gain);
                osc.type = 'sine';
                osc.frequency.setValueAtTime(180, now);
                osc.frequency.linearRampToValueAtTime(320, now + 0.06);
                osc.frequency.exponentialRampToValueAtTime(90, now + 0.18);
                gain.gain.setValueAtTime(0.0, now);
                gain.gain.linearRampToValueAtTime(0.18, now + 0.04);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
                osc.start(now);
                osc.stop(now + 0.22);
                return; // already connected via filter
            }

            case 'split': {
                // Membrane pop — sharp burst of noise-like tone
                osc.type = 'sine';
                osc.frequency.setValueAtTime(520, now);
                osc.frequency.exponentialRampToValueAtTime(80, now + 0.12);
                gain.gain.setValueAtTime(0.14, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
                osc.start(now);
                osc.stop(now + 0.2);
                break;
            }

            case 'death': {
                // Wet splat — descending bubble burst
                const filt2 = audioCtx.createBiquadFilter();
                filt2.type = 'lowpass';
                filt2.frequency.value = 400;
                osc.connect(filt2);
                filt2.connect(gain);
                osc.type = 'sine';
                osc.frequency.setValueAtTime(260, now);
                osc.frequency.exponentialRampToValueAtTime(40, now + 0.55);
                gain.gain.setValueAtTime(0.22, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
                osc.start(now);
                osc.stop(now + 0.65);
                return;
            }

            case 'eject': {
                // Squirt — quick rising squeak
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(300, now);
                osc.frequency.exponentialRampToValueAtTime(600, now + 0.05);
                osc.frequency.exponentialRampToValueAtTime(200, now + 0.13);
                gain.gain.setValueAtTime(0.07, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
                osc.start(now);
                osc.stop(now + 0.15);
                break;
            }

            case 'virus': {
                // Membrane rupture — deep thump + high crackle
                osc.type = 'square';
                osc.frequency.setValueAtTime(120, now);
                osc.frequency.exponentialRampToValueAtTime(35, now + 0.4);
                gain.gain.setValueAtTime(0.18, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
                osc.start(now);
                osc.stop(now + 0.45);
                break;
            }
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