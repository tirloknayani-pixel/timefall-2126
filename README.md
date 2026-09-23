# TIMEFALL: 2126

Milestone 2 — Authoritative Game Engine.

## Added

- Server-authoritative game state
- 12-round survival clock
- 45-second decision timer per round
- Shared Energy, Food, Stability and Robot Alert resources
- Per-player health
- Six server-validated actions: Explore, Scavenge, Scan, Rest, Repair, Wait
- Action locking and automatic round resolution
- Automatic resolution when all active players submit
- Timeout resolution when the round timer expires
- Server-side consequences for depleted food and high robot alert
- Reconnection-friendly state broadcast
- Live synchronized HUD, team health and event log
- `PORT` environment variable support

## Run

Requires Node.js 18+.

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## Milestone 2 scope

The portal, fictional locations, narrative events, component collection and multiple endings are deliberately reserved for later milestones. Starting the game now runs the authoritative survival loop only.

## Fictional-data policy

All locations, actions, resources and narrative references are fictional. No personal data, private files, email, calendar, contacts or private accounts are used.

## Deployment readiness

TIMEFALL: 2126 uses the real Socket.IO transport for multiplayer. It does not use simulated or local-only multiplayer.

Standard Node.js deployment:

```bash
npm install
npm start
```

The server uses `process.env.PORT` when supplied by the hosting platform.

Tests retained for post-deployment execution:

```bash
npm run test:engine
npm run test:integration
```

`test-integration.js` remains available for the real Socket.IO multiplayer acceptance checks after dependencies can be installed and a reachable server is available.

The included `render.yaml` uses `npm install`, `npm start`, and `/health`.

All game data is fictional. No personal data or private integrations are required.
