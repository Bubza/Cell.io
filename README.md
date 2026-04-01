# CELL.IO — Devour or Be Devoured

A browser-based Agar.io clone built with HTML5 Canvas and vanilla JavaScript.  
Features intelligent bot enemies controlled by a **Finite State Machine (FSM)** with 6 distinct states.

---

## How to Play

| Control | Action |
|---------|--------|
| **Mouse** | Move your cell toward the cursor |
| **Left Click** / **Space** | Split your cell toward the cursor |
| **Right Click** / **W** | Eject mass in cursor direction |
| **Scroll Wheel** | Zoom in/out |
| **ESC** | Pause / Resume |
| **Enter** | Start game / Restart |
| **Touch** (mobile) | Drag to move, tap to split |

### Rules
- Eat food (small colored dots) to grow
- Eat cells **smaller** than you (you must be 15% larger)
- Avoid cells **bigger** than you — they will eat you
- Green spiky **viruses** will split you if you're bigger than them
- Score is based on total mass consumed

---

## Bot AI — Finite State Machine

Each of the 15 bots is controlled by a reusable `FSM` class (`js/fsm.js`) with **6 distinct states** and personality-driven behavior via an `aggressionLevel` trait.

### FSM State Diagram

```
                        ┌──────────────┐
                ┌──────►│   WANDER     │◄──────────────┐
                │       │ (default)    │               │
                │       └──┬───┬───┬───┘               │
                │          │   │   │                   │
                │  prey    │   │   │  threat           │ no threat
                │  found   │   │   │  found            │
                │          ▼   │   ▼                   │
                │   ┌──────┐   │   ┌──────┐        ┌───┴───┐
                │   │ HUNT │   │   │ FLEE │───────►│ MERGE │
                │   └──┬───┘   │   └──────┘        └───────┘
                │      │       │       ▲               ▲
                │      │ big + │       │               │
                │      │ close │       │ bigger threat │ too many
                │      ▼       │       │               │ cells
                │ ┌────────────┴─┐     │               │
                │ │  AGGRESSIVE  │─────┘               │
                │ └──────────────┘                     │
                │                                      │
                │  ┌──────┐                            │
                └──│ DEAD │ (respawn timer)             │
                   └──────┘                            │
                       ▲                               │
                       │ totalMass <= 0                │
                       │ (from ANY state)              │
                       └───────────────────────────────┘
```

### FSM Transition Table

| # | Current State | Condition | Next State | Action |
|---|---------------|-----------|------------|--------|
| 1 | ANY | `totalMass <= 0` | DEAD | Start respawn timer (3-7s) |
| 2 | WANDER | Threat within 300px | FLEE | Set target to threat, run away |
| 3 | WANDER | Prey within 400px | HUNT | Set target to nearest prey |
| 4 | WANDER | Player within 350px AND bot > player×1.3 AND aggression > 0.7 | AGGRESSIVE | Target the player |
| 5 | HUNT | Threat within 250px | FLEE | Abort hunt, run from threat |
| 6 | HUNT | Player within 500px AND bot > player×1.15 AND aggression > 0.6 | AGGRESSIVE | Switch to attack mode |
| 7 | HUNT | cells.length > 3 | MERGE | Regroup before continuing |
| 8 | HUNT | Target distance > 500px | WANDER | Prey escaped, resume patrol |
| 9 | AGGRESSIVE | Bigger threat within 200px (threat > bot×1.5) | FLEE | Abort attack, flee |
| 10 | AGGRESSIVE | Player distance > 600px OR bot < player×0.9 | WANDER | Give up chase |
| 11 | FLEE | No threats within 400px | WANDER | Safe to wander again |
| 12 | FLEE | cells.length > 2 AND no threats within 300px | MERGE | Regroup while safe |
| 13 | MERGE | cells.length <= 1 | WANDER | Done merging, resume roaming |
| 14 | DEAD | respawnTimer expires | WANDER | Respawn at random location |

### State Descriptions

- **WANDER** — Default state. Bot moves toward random patrol points, picking a new destination every time it arrives within 80px of its target. This is the idle/patrol behavior.
- **HUNT** — Bot has detected food or a smaller entity within 400px. It moves directly toward the target to consume it.
- **FLEE** — A larger threat (>115% of bot's mass) was detected nearby. Bot moves in the opposite direction to escape.
- **AGGRESSIVE** — Bot specifically targets the human player. Will attempt split-attacks when close enough (4× radius distance, on cooldown). Only triggered for bots with high `aggressionLevel`.
- **DEAD** — Bot was consumed. Waits 3-7 seconds, then respawns at a random world location with fresh mass.
- **MERGE** — Bot has been split into multiple cells. Moves toward its own center to merge cells back together before re-engaging.

---

## Implemented Events (19 total)

| # | Event Type | Usage |
|---|-----------|-------|
| 1 | `mousemove` | Track mouse position for player movement + custom cursor |
| 2 | `click` | Split cell toward mouse position |
| 3 | `contextmenu` | Right-click to eject mass |
| 4 | `wheel` | Scroll to zoom in/out |
| 5 | `keydown` | ESC (pause), W (eject mass), Space (split) |
| 6 | `keyup` | Release key tracking |
| 7 | `resize` | Responsive canvas that adapts to window size |
| 8 | `focus` | Resume background audio when tab is focused |
| 9 | `blur` | Auto-pause game when window loses focus |
| 10 | `load` | Initialize canvas and focus name input |
| 11 | `visibilitychange` | Pause on tab switch |
| 12 | `mousedown` | Track mouse button press state |
| 13 | `mouseup` | Track mouse button release state |
| 14 | `keypress` | Enter key to start/restart game from screens |
| 15 | `touchstart` | Mobile: begin tracking touch position |
| 16 | `touchmove` | Mobile: update touch position for movement |
| 17 | `touchend` | Mobile: tap to split |
| 18 | Custom: `gameStart` | Dispatched when a new game begins |
| 19 | Custom: `gameOver` | Dispatched when the player is consumed |

Additional game-specific mechanisms:
- `requestAnimationFrame` for the game loop
- `setTimeout` used internally for FSM respawn timers

---

## Project Structure

```
/game
├── index.html            # Main HTML entry point
├── README.md             # This documentation
├── css/
│   └── style.css         # All game styles (cyberpunk/neon theme)
├── js/
│   ├── main.js           # Game loop, events, collisions, HUD
│   ├── fsm.js            # Reusable FSM class (automata theory)
│   ├── cell.js           # Base Cell class (shared by player & bots)
│   ├── player.js         # Player class (extends Cell)
│   ├── enemy.js          # Bot class with FSM AI (extends Cell)
│   ├── food.js           # Food, virus, and particle systems
│   ├── renderer.js       # All Canvas drawing functions
│   └── utils.js          # Constants and utility functions
└── assets/
    ├── images/
    └── sounds/
```

---

## Technologies Used

- **HTML5 Canvas** — All game rendering (no DOM elements for game objects)
- **Vanilla JavaScript (ES6+)** — Classes, modules, arrow functions, const/let
- **Web Audio API** — Procedurally generated sound effects and background music
- **CSS3** — Custom properties, animations, backdrop-filter, gradients
- **ES6 Modules** — Separate files imported via `<script type="module">`

---

## Features

- Main menu with name input
- Game Over screen with final score
- Pause menu (ESC key)
- HUD: Score, Mass, Leaderboard, Minimap, Controls hint
- FSM Debug panel showing real-time bot AI states
- Sound effects with mute toggle
- Background ambient drone music
- Smooth camera follow with dynamic zoom
- 15 bot enemies with 6-state FSM AI
- Cell splitting and mass ejection mechanics
- Virus cells that pop larger players
- Particle effects on eat/death events
- Custom cursor
- Mobile touch support
- Auto-pause on tab switch / window blur
- Responsive canvas

---

## How to Run

1. Clone this repository
2. Open `index.html` in a browser (or use a local server for ES6 modules)
3. Enter your name and click PLAY

For local development:
```bash
# Using Python
python -m http.server 8080

# Using Node.js
npx serve .
```

Then open `http://localhost:8080` in your browser.

---

## License

This project was created for the Math for Devs & IT course.
