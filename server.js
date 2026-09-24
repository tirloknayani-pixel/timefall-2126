const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const {
  createRoom,
  addPlayer,
  removePlayer,
  movePlayer,
  chooseAction,
  tickRoom,
  getPublicState,
  startRoom
} = require("./game/state");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  transports: ["websocket", "polling"]
});

const rooms = new Map();
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (_req, res) => res.json({ ok: true, game: "TIMEFALL: 2126" }));

function emitRoom(code) {
  const room = rooms.get(code);
  if (room) io.to(code).emit("state", getPublicState(room));
}

io.on("connection", (socket) => {
  socket.on("createRoom", ({ name } = {}, cb = () => {}) => {
    const playerName = String(name || "Nova").trim().slice(0, 14) || "Nova";
    let room;
    do room = createRoom(); while (rooms.has(room.code));
    addPlayer(room, socket.id, playerName);
    rooms.set(room.code, room);
    socket.join(room.code);
    socket.data.room = room.code;
    cb({ ok: true, code: room.code, id: socket.id });
    emitRoom(room.code);
  });

  socket.on("joinRoom", ({ code, name } = {}, cb = () => {}) => {
    const roomCode = String(code || "").trim().toUpperCase();
    const room = rooms.get(roomCode);
    if (!room) return cb({ ok: false, error: "Room not found." });
    if (room.players.size >= 6) return cb({ ok: false, error: "Room is full (6 players)." });
    const playerName = String(name || "Ranger").trim().slice(0, 14) || "Ranger";
    addPlayer(room, socket.id, playerName);
    socket.join(room.code);
    socket.data.room = room.code;
    cb({ ok: true, code: room.code, id: socket.id });
    emitRoom(room.code);
  });

  socket.on("startGame", () => {
    const code = socket.data.room;
    const room = rooms.get(code);
    if (!room) return;
    startRoom(room, socket.id);
    emitRoom(code);
  });

  socket.on("input", (input = {}) => {
    const code = socket.data.room;
    const room = rooms.get(code);
    if (!room) return;
    movePlayer(room, socket.id, input);
  });

  socket.on("action", ({ action } = {}) => {
    const code = socket.data.room;
    const room = rooms.get(code);
    if (!room) return;
    chooseAction(room, socket.id, action);
    emitRoom(code);
  });

  socket.on("chat", ({ message } = {}) => {
    const code = socket.data.room;
    const room = rooms.get(code);
    if (!room) return;
    const p = room.players.get(socket.id);
    const msg = String(message || "").trim().slice(0, 120);
    if (!p || !msg) return;
    io.to(code).emit("chat", { name: p.name, message: msg });
  });

  socket.on("disconnect", () => {
    const code = socket.data.room;
    const room = rooms.get(code);
    if (!room) return;
    removePlayer(room, socket.id);
    if (room.players.size === 0) rooms.delete(code);
    else emitRoom(code);
  });
});

setInterval(() => {
  for (const [code, room] of rooms) {
    tickRoom(room);
    if (room.players.size) emitRoom(code);
  }
}, 100);

const PORT = process.env.PORT || 10000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`TIMEFALL: 2126 running on port ${PORT}`);
});
