const assert = require('assert');
const { createGameState, resolveRound } = require('./game/state');

const ids = ['player-a', 'player-b'];
const g = createGameState(ids);
assert.equal(g.round, 1);
assert.deepEqual(g.resources, { energy: 80, food: 60, stability: 75, alert: 10 });
assert.equal(g.players['player-a'].health, 100);
assert.equal(g.players['player-b'].health, 100);

g.roundEndsAt = Date.now() - 1;
g.players['player-a'].action = 'explore';
g.players['player-a'].submitted = true;
g.players['player-b'].action = 'wait';
g.players['player-b'].submitted = true;
resolveRound(g);
assert.equal(g.round, 2);
assert.equal(g.phase, 'decision');
assert.equal(g.players['player-a'].submitted, false);
assert.equal(g.players['player-b'].submitted, false);
assert.equal(g.resources.food, 55);
assert.equal(g.resources.energy, 75);
assert.equal(g.resources.stability, 76);
assert.equal(g.resources.alert, 13);

// Simulates timeout: an unanswered player is treated as wait by resolveRound.
g.players['player-a'].action = 'scavenge';
g.players['player-a'].submitted = true;
g.players['player-b'].action = null;
g.players['player-b'].submitted = false;
resolveRound(g);
assert.equal(g.round, 3);
assert.equal(g.players['player-a'].submitted, false);
assert.equal(g.players['player-b'].submitted, false);

// Shared resource/health mutation remains bounded.
g.resources.food = 0;
g.players['player-a'].action = 'wait';
g.players['player-a'].submitted = true;
g.players['player-b'].action = 'wait';
g.players['player-b'].submitted = true;
resolveRound(g);
assert(g.players['player-a'].health <= 100 && g.players['player-a'].health >= 0);
assert(g.players['player-b'].health <= 100 && g.players['player-b'].health >= 0);
for (const value of Object.values(g.resources)) assert(value >= 0 && value <= 100);

console.log('PASS: authoritative game engine rules, timeout fallback, round advancement, and bounded state.');
