const MAX_ROUNDS = 12;
const ROUND_SECONDS = 45;
const MAX = { energy: 100, food: 100, stability: 100, alert: 100 };

function clamp(n, min = 0, max = 100) { return Math.max(min, Math.min(max, n)); }

function createGameState(playerIds) {
  const players = {};
  for (const id of playerIds) players[id] = { health: 100, action: null, submitted: false };
  return {
    round: 1,
    maxRounds: MAX_ROUNDS,
    phase: "decision",
    roundSeconds: ROUND_SECONDS,
    roundEndsAt: Date.now() + ROUND_SECONDS * 1000,
    resources: { energy: 80, food: 60, stability: 75, alert: 10 },
    players,
    log: ["Temporal displacement confirmed. Survive until the portal can be located."]
  };
}

function publicGameState(state) {
  return {
    round: state.round,
    maxRounds: state.maxRounds,
    phase: state.phase,
    roundSeconds: state.roundSeconds,
    roundEndsAt: state.roundEndsAt,
    resources: { ...state.resources },
    players: Object.fromEntries(Object.entries(state.players).map(([id, p]) => [id, { health: p.health, submitted: p.submitted }])) ,
    log: state.log.slice(-8)
  };
}

function applyDelta(state, delta) {
  for (const key of Object.keys(delta)) state.resources[key] = clamp(state.resources[key] + delta[key]);
}

function resolveRound(state) {
  const choices = Object.values(state.players).map(p => p.action || "wait");
  const counts = choices.reduce((m, a) => (m[a] = (m[a] || 0) + 1, m), {});
  const n = choices.length;
  const delta = { energy: 0, food: -n * 2, stability: 0, alert: 0 };

  if (counts.scavenge) { delta.energy += counts.scavenge * 8; delta.food += counts.scavenge * 3; delta.alert += counts.scavenge * 2; }
  if (counts.explore) { delta.energy -= counts.explore * 5; delta.food -= counts.explore; delta.stability += counts.explore * 3; delta.alert += counts.explore * 3; }
  if (counts.scan) { delta.energy -= counts.scan * 7; delta.stability += counts.scan * 5; delta.alert += counts.scan; }
  if (counts.rest) { delta.stability += counts.rest * 6; delta.energy += counts.rest * 2; }
  if (counts.repair) { delta.energy -= counts.repair * 9; delta.stability += counts.repair * 7; delta.alert += counts.repair; }
  if (counts.wait) { delta.stability -= counts.wait * 2; }

  applyDelta(state, delta);
  if (state.resources.food <= 0) {
    for (const p of Object.values(state.players)) p.health = clamp(p.health - 8);
    state.log.push("Food reserves are depleted. Every survivor loses 8 health.");
  }
  if (state.resources.alert >= 80) {
    for (const p of Object.values(state.players)) p.health = clamp(p.health - 5);
    state.resources.stability = clamp(state.resources.stability - 8);
    state.log.push("A patrol sweep catches the team. Everyone loses 5 health.");
  }
  state.log.push(`Round ${state.round} resolved: ${Object.entries(counts).map(([a,c]) => `${c}× ${a}`).join(", ")}.`);
  for (const p of Object.values(state.players)) { p.action = null; p.submitted = false; }
  state.round += 1;
  if (state.round > state.maxRounds || state.resources.stability <= 0 || Object.values(state.players).every(p => p.health <= 0)) {
    state.phase = "ended";
    state.log.push("The survival engine has ended this expedition. The portal system will be implemented in a later milestone.");
    return;
  }
  state.roundEndsAt = Date.now() + ROUND_SECONDS * 1000;
}

module.exports = { createGameState, publicGameState, resolveRound, ROUND_SECONDS };
