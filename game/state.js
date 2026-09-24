const LOCATIONS = [
  { id: "neo", name: "Neo-Delhi Sector", x: 420, y: 300, color: "#48d7ff" },
  { id: "helix", name: "Helix Transit", x: 980, y: 260, color: "#b78cff" },
  { id: "arcology", name: "Arcology 7", x: 1250, y: 690, color: "#6cf59a" },
  { id: "archive", name: "Quantum Archive", x: 690, y: 820, color: "#ffd166" },
  { id: "machine", name: "Machine District", x: 260, y: 760, color: "#ff7b8a" },
  { id: "facility", name: "Temporal Facility", x: 1080, y: 900, color: "#7ea7ff" }
];

const ACTIONS = ["explore", "scavenge", "scan", "repair", "rest", "rescue"];

function code() {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

function createRoom() {
  return {
    code: code(),
    started: false,
    round: 1,
    maxRounds: 12,
    roundTime: 45,
    energy: 80,
    food: 60,
    stability: 75,
    alert: 10,
    portal: { core: false, stabilizer: false, key: false, cell: false },
    log: ["Temporal displacement confirmed. Reach the portal before the timeline collapses."],
    players: new Map(),
    lastTick: Date.now()
  };
}

function addPlayer(room, id, name) {
  const colors = ["#5ee7ff", "#ff78b8", "#ffd166", "#79f2a0", "#a78bfa", "#ff8f70"];
  const i = room.players.size;
  room.players.set(id, {
    id, name,
    x: 180 + i * 55,
    y: 520 + (i % 2) * 45,
    hp: 100,
    color: colors[i % colors.length],
    action: null,
    lastInput: Date.now()
  });
}

function removePlayer(room, id) {
  room.players.delete(id);
}

function startRoom(room, socketId) {
  if (!room.players.has(socketId)) return;
  room.started = true;
  room.log.unshift("The squad is moving. Find the four portal components.");
}

function movePlayer(room, id, input = {}) {
  const p = room.players.get(id);
  if (!p || !room.started || p.hp <= 0) return;
  const dx = Math.max(-1, Math.min(1, Number(input.dx) || 0));
  const dy = Math.max(-1, Math.min(1, Number(input.dy) || 0));
  const speed = 7;
  p.x = Math.max(55, Math.min(1435, p.x + dx * speed));
  p.y = Math.max(55, Math.min(1045, p.y + dy * speed));
  p.lastInput = Date.now();
}

function chooseAction(room, id, action) {
  const p = room.players.get(id);
  if (!p || !ACTIONS.includes(action)) return;
  p.action = action;
}

function nearestLocation(p) {
  let best = null, d = Infinity;
  for (const l of LOCATIONS) {
    const dist = Math.hypot(p.x - l.x, p.y - l.y);
    if (dist < d) { d = dist; best = l; }
  }
  return { location: best, distance: d };
}

function resolveRound(room) {
  const actions = [...room.players.values()].map(p => p.action).filter(Boolean);
  const unique = new Set(actions);
  if (unique.has("scavenge")) {
    room.food = Math.min(100, room.food + 6);
    room.energy = Math.max(0, room.energy - 3);
  }
  if (unique.has("scan")) room.stability = Math.min(100, room.stability + 3);
  if (unique.has("repair")) {
    room.stability = Math.min(100, room.stability + 7);
    room.energy = Math.max(0, room.energy - 5);
  }
  if (unique.has("rest")) room.energy = Math.min(100, room.energy + 5);
  if (unique.has("explore")) {
    room.alert = Math.min(100, room.alert + 4);
    room.energy = Math.max(0, room.energy - 4);
  }

  for (const p of room.players.values()) {
    if (p.action === "rescue") p.hp = Math.min(100, p.hp + 12);
    p.action = null;
  }

  room.food = Math.max(0, room.food - Math.max(1, room.players.size));
  room.round += 1;
  room.roundTime = 45;

  if (room.round % 3 === 0) room.alert = Math.min(100, room.alert + 8);
  if (room.food === 0) {
    for (const p of room.players.values()) p.hp = Math.max(0, p.hp - 4);
    room.log.unshift("Food reserves depleted. The crew is losing health.");
  }
  room.log.unshift(`Round ${room.round - 1} resolved. Keep moving.`);
}

function collectAtLocation(room) {
  for (const p of room.players.values()) {
    const { location, distance } = nearestLocation(p);
    if (distance < 95) {
      if (location.id === "neo") room.portal.core = true;
      if (location.id === "helix") room.portal.stabilizer = true;
      if (location.id === "arcology") room.portal.key = true;
      if (location.id === "facility") room.portal.cell = true;
    }
  }
}

function tickRoom(room) {
  if (!room.started) return;
  const now = Date.now();
  const dt = (now - room.lastTick) / 1000;
  room.lastTick = now;
  room.roundTime -= dt;
  collectAtLocation(room);

  if (room.roundTime <= 0) resolveRound(room);

  const all = room.portal.core && room.portal.stabilizer && room.portal.key && room.portal.cell;
  if (all) room.log.unshift("PORTAL READY — return to the Temporal Facility to escape.");
  if (room.stability <= 0 || room.round > room.maxRounds) {
    room.started = false;
    room.log.unshift("TIMELINE LOST — the portal window closed.");
  }
}

function getPublicState(room) {
  return {
    code: room.code,
    started: room.started,
    round: Math.min(room.round, room.maxRounds),
    maxRounds: room.maxRounds,
    roundTime: Math.max(0, Math.ceil(room.roundTime)),
    energy: room.energy,
    food: room.food,
    stability: room.stability,
    alert: room.alert,
    portal: room.portal,
    locations: LOCATIONS,
    log: room.log.slice(0, 5),
    players: [...room.players.values()].map(({ id, name, x, y, hp, color }) => ({ id, name, x, y, hp, color }))
  };
}

module.exports = {
  createRoom, addPlayer, removePlayer, movePlayer, chooseAction,
  tickRoom, getPublicState, startRoom
};
