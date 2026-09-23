// Run after `npm install`. This is a two-client Socket.IO integration suite.
const assert = require('assert');
const { io } = require('socket.io-client');
const { spawn } = require('child_process');

const PORT = 34126;
const URL = `http://127.0.0.1:${PORT}`;
const server = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
server.stdout.on('data', b => output += b.toString());
server.stderr.on('data', b => output += b.toString());

const wait = ms => new Promise(r => setTimeout(r, ms));
const connect = token => new Promise((resolve, reject) => {
  const s = io(URL, { auth: { reconnectToken: token }, reconnection: true, timeout: 3000 });
  s.once('connect', () => resolve(s));
  s.once('connect_error', reject);
});
const once = (s, event, timeout = 5000) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), timeout);
  s.once(event, x => { clearTimeout(t); resolve(x); });
});

(async () => {
  let a, b;
  try {
    await wait(500);
    a = await connect(cryptoRandom());
    b = await connect(cryptoRandom());

    const create = await new Promise(resolve => a.emit('room:create', { name: 'NOVA-A' }, resolve));
    assert(create.ok);
    const code = create.room.code;
    const tokenA = create.reconnectToken;

    const join = await new Promise(resolve => b.emit('room:join', { code, name: 'NOVA-B' }, resolve));
    assert(join.ok);
    const tokenB = join.reconnectToken;

    const readyA = new Promise(resolve => a.emit('player:ready', true, resolve));
    const readyB = new Promise(resolve => b.emit('player:ready', true, resolve));
    await Promise.all([readyA, readyB]);

    const started = new Promise(resolve => a.emit('room:start', resolve));
    assert((await started).ok);

    const stateA = await once(a, 'room:state');
    const stateB = await once(b, 'room:state');
    assert.equal(stateA.game.round, stateB.game.round);
    assert.equal(stateA.game.roundEndsAt, stateB.game.roundEndsAt);
    assert.deepEqual(stateA.game.resources, stateB.game.resources);

    const actionA = new Promise(resolve => a.emit('game:action', 'explore', resolve));
    const actionB = new Promise(resolve => b.emit('game:action', 'scavenge', resolve));
    assert((await actionA).ok);
    assert((await actionB).ok);

    const resolvedA = await once(a, 'room:state');
    const resolvedB = await once(b, 'room:state');
    assert.equal(resolvedA.game.round, 2);
    assert.equal(resolvedB.game.round, 2);
    assert.deepEqual(resolvedA.game.resources, resolvedB.game.resources);
    assert.deepEqual(resolvedA.game.players, resolvedB.game.players);

    const duplicate = await new Promise(resolve => a.emit('game:action', 'wait', resolve));
    assert.equal(duplicate.ok, false);

    const invalid = await new Promise(resolve => b.emit('game:action', 'hack', resolve));
    assert.equal(invalid.ok, false);

    // Disconnect B briefly and verify its player remains in authoritative state.
    const playerB = Object.keys(resolvedA.game.players).find(id => resolvedA.game.players[id]);
    b.disconnect();
    await wait(300);
    const offlineState = await once(a, 'room:state');
    assert(offlineState.players.some(p => !p.connected));

    // Reconnect with B's token; the same stable player identity must return.
    b = await connect(tokenB);
    const restored = await once(b, 'room:state');
    assert(restored.players.some(p => p.connected && p.name === 'NOVA-B'));
    assert(Object.keys(restored.game.players).includes(playerB));
    assert.deepEqual(restored.game.resources, offlineState.game.resources);

    // Leave B silent and force the timer path by waiting for a fresh round timeout.
    const before = restored.game.round;
    const timeoutState = await once(a, 'room:state', 50000);
    assert(timeoutState.game.round > before);
    assert.deepEqual(timeoutState.game.resources, (await once(b, 'room:state')).game.resources);

    console.log('PASS: two-client room, synchronized round/timer/resources, valid actions, duplicate/invalid rejection, reconnect state preservation, and timer resolution.');
  } finally {
    if (a) a.disconnect();
    if (b) b.disconnect();
    server.kill('SIGTERM');
    await wait(100);
    if (output) process.stderr.write(output);
  }
})().catch(err => { console.error('FAIL:', err.message); server.kill('SIGTERM'); process.exit(1); });

function cryptoRandom() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
