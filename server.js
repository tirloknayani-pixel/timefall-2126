const path = require("path");
const crypto = require("crypto");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const { createGameState, publicGameState, resolveRound } = require("./game/state");
const { MIN_PLAYERS, MAX_PLAYERS, ACTIONS } = require("./game/rules");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = Number(process.env.PORT) || 3000;
const RECONNECT_GRACE_MS = 60_000;
const rooms = new Map();
const timers = new Map();
const disconnectTimers = new Map();

app.use(express.static(path.join(__dirname, "public")));

function makeId(prefix = "p") { return `${prefix}_${crypto.randomBytes(9).toString("hex")}`; }
function makeRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do code = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  while (rooms.has(code));
  return code;
}
function makeReconnectToken() { return crypto.randomBytes(24).toString("hex"); }

function safePlayer(room, p) {
  return { id: p.id, name: p.name, ready: p.ready, connected: p.connected, isHost: p.id === room.hostId };
}
function publicRoom(room) {
  return {
    code: room.code,
    phase: room.phase,
    players: [...room.players.values()].map(p => safePlayer(room, p)),
    game: room.game ? publicGameState(room.game) : null
  };
}
function broadcast(room) { io.to(room.code).emit("room:state", publicRoom(room)); }
function clearTimer(code) { if (timers.has(code)) { clearInterval(timers.get(code)); timers.delete(code); } }
function clearDisconnectTimer(playerId) { if (disconnectTimers.has(playerId)) { clearTimeout(disconnectTimers.get(playerId)); disconnectTimers.delete(playerId); } }

function bindSocketToPlayer(socket, room, player) {
  clearDisconnectTimer(player.id);
  player.socketId = socket.id;
  player.connected = true;
  socket.data.roomCode = room.code;
  socket.data.playerId = player.id;
  socket.data.reconnectToken = player.reconnectToken;
  socket.join(room.code);
}

function startGame(room) {
  room.phase = "game";
  room.game = createGameState([...room.players.keys()]);
  clearTimer(room.code);
  const tick = setInterval(() => {
    if (!rooms.has(room.code) || !room.game || room.game.phase !== "decision") return clearTimer(room.code);
    if (Date.now() >= room.game.roundEndsAt) {
      resolveRound(room.game);
      broadcast(room);
    } else {
      io.to(room.code).emit("game:tick", { roundEndsAt: room.game.roundEndsAt });
    }
  }, 250);
  timers.set(room.code, tick);
}

function removeDisconnectedPlayer(room, playerId) {
  const player = room.players.get(playerId);
  if (!player || player.connected) return;
  room.players.delete(playerId);
  if (room.game) delete room.game.players[playerId];
  if (room.hostId === playerId) {
    const next = [...room.players.values()].find(p => p.connected);
    room.hostId = next ? next.id : null;
  }
  if (!room.players.size) {
    clearTimer(room.code);
    rooms.delete(room.code);
  } else {
    broadcast(room);
  }
}

function scheduleDisconnect(room, player) {
  clearDisconnectTimer(player.id);
  const timer = setTimeout(() => removeDisconnectedPlayer(room, player.id), RECONNECT_GRACE_MS);
  disconnectTimers.set(player.id, timer);
}

function leaveRoom(socket, permanent = false) {
  const code = socket.data.roomCode;
  const playerId = socket.data.playerId;
  if (!code || !playerId) return;
  const room = rooms.get(code);
  socket.data.roomCode = null;
  socket.data.playerId = null;
  if (!room) return;
  const player = room.players.get(playerId);
  if (!player) return;
  if (player.socketId && player.socketId !== socket.id) return;

  socket.leave(code);
  if (permanent) {
    clearDisconnectTimer(playerId);
    removeDisconnectedPlayer(room, playerId);
    return;
  }

  player.connected = false;
  player.socketId = null;
  scheduleDisconnect(room, player);
  broadcast(room);
}

io.on("connection", socket => {
  const token = String(socket.handshake.auth?.reconnectToken || "");
  if (token) {
    for (const room of rooms.values()) {
      const player = [...room.players.values()].find(p => p.reconnectToken === token);
      if (player) {
        bindSocketToPlayer(socket, room, player);
        io.to(room.code).emit("session:restored", { playerId: player.id });
        broadcast(room);
        break;
      }
    }
  }

  socket.on("room:create", ({ name } = {}, ack = () => {}) => {
    if (socket.data.roomCode) return ack({ ok: false, error: "Already in a room." });
    const clean = String(name || "").trim().slice(0, 20);
    if (!clean) return ack({ ok: false, error: "Enter a player name." });
    const code = makeRoomCode();
    const room = { code, hostId: null, phase: "lobby", players: new Map(), game: null };
    const player = { id: makeId(), name: clean, ready: true, connected: true, socketId: socket.id, reconnectToken: makeReconnectToken() };
    room.hostId = player.id;
    room.players.set(player.id, player);
    rooms.set(code, room);
    bindSocketToPlayer(socket, room, player);
    ack({ ok: true, room: publicRoom(room), reconnectToken: player.reconnectToken });
    broadcast(room);
  });

  socket.on("room:join", ({ code, name } = {}, ack = () => {}) => {
    if (socket.data.roomCode) return ack({ ok: false, error: "Already in a room." });
    const cleanCode = String(code || "").trim().toUpperCase();
    const clean = String(name || "").trim().slice(0, 20);
    const room = rooms.get(cleanCode);
    if (!clean) return ack({ ok: false, error: "Enter a player name." });
    if (!room) return ack({ ok: false, error: "Room not found." });
    if (room.phase !== "lobby") return ack({ ok: false, error: "That expedition has already started." });
    if (room.players.size >= MAX_PLAYERS) return ack({ ok: false, error: "Room is full." });
    const player = { id: makeId(), name: clean, ready: false, connected: true, socketId: socket.id, reconnectToken: makeReconnectToken() };
    room.players.set(player.id, player);
    bindSocketToPlayer(socket, room, player);
    ack({ ok: true, room: publicRoom(room), reconnectToken: player.reconnectToken });
    broadcast(room);
  });

  socket.on("player:ready", (ready, ack = () => {}) => {
    const room = rooms.get(socket.data.roomCode);
    const player = room?.players.get(socket.data.playerId);
    if (!room || !player || room.phase !== "lobby") return ack({ ok: false, error: "Not in a lobby." });
    player.ready = Boolean(ready);
    ack({ ok: true });
    broadcast(room);
  });

  socket.on("room:start", (ack = () => {}) => {
    const room = rooms.get(socket.data.roomCode);
    const playerId = socket.data.playerId;
    if (!room) return ack({ ok: false, error: "Room not found." });
    if (room.hostId !== playerId) return ack({ ok: false, error: "Only the host can start." });
    if (room.players.size < MIN_PLAYERS) return ack({ ok: false, error: `At least ${MIN_PLAYERS} players are required.` });
    if (![...room.players.values()].every(p => p.connected)) return ack({ ok: false, error: "Every player must be connected." });
    if (![...room.players.values()].every(p => p.ready)) return ack({ ok: false, error: "Every player must be ready." });
    startGame(room);
    ack({ ok: true });
    broadcast(room);
  });

  socket.on("player:move", (payload = {}, ack = () => {}) => {
    const room = rooms.get(socket.data.roomCode);
    const game = room?.game;
    const playerId = socket.data.playerId;
    const player = game?.players[playerId];
    if (!room || room.phase !== "game" || !game || game.phase !== "decision") return ack({ ok: false, error: "Movement unavailable." });
    if (!player || player.health <= 0) return ack({ ok: false, error: "You cannot move while incapacitated." });
    const now = Date.now();
    if (player.lastMoveAt && now - player.lastMoveAt < 45) return ack({ ok: false });
    const x = Number(payload.x), y = Number(payload.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return ack({ ok: false, error: "Invalid position." });
    player.x = Math.max(55, Math.min(785, x));
    player.y = Math.max(70, Math.min(485, y));
    player.lastMoveAt = now;
    io.to(room.code).emit("player:positions", Object.fromEntries(Object.entries(game.players).map(([id, p]) => [id, { x: p.x, y: p.y }])));
    ack({ ok: true });
  });

  socket.on("game:action", (action, ack = () => {}) => {
    const room = rooms.get(socket.data.roomCode);
    const game = room?.game;
    const playerId = socket.data.playerId;
    const player = game?.players[playerId];
    if (!room || room.phase !== "game" || !game || game.phase !== "decision") return ack({ ok: false, error: "The game is not accepting actions." });
    if (!ACTIONS.has(action)) return ack({ ok: false, error: "Invalid action." });
    if (!player || player.health <= 0) return ack({ ok: false, error: "You cannot act while incapacitated." });
    if (player.submitted) return ack({ ok: false, error: "Action already submitted this round." });
    player.action = action;
    player.submitted = true;
    ack({ ok: true });
    if (Object.values(game.players).every(p => p.submitted || p.health <= 0)) resolveRound(game);
    broadcast(room);
  });

  socket.on("room:leave", () => leaveRoom(socket, true));
  socket.on("disconnect", () => leaveRoom(socket, false));
});

app.get("/health", (_req, res) => res.json({ ok: true, game: "TIMEFALL: 2126", milestone: 2 }));
server.listen(PORT, () => console.log(`TIMEFALL: 2126 listening on port ${PORT}`));
