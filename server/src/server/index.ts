import http from "node:http";
import express from "express";
import { Server } from "socket.io";
import { v4 as uuidv4 } from "uuid";
import { Engine, createEngine, legalMoves, rollDice, executeTurn, chooseCPUMove, applyMove } from "../game/engine.js";
import { Room, Player, PublicRoom, makePieceId, Color, COLORS, PositionLike } from "../shared/types.js";

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, methods: ["GET", "POST"] }, transports: ["websocket", "polling"] });

app.use(express.static("public"));

interface RoomInstanceState {
  room: Room;
  engine: Engine;
  turnTimer: ReturnType<typeof setTimeout> | null;
}

const rooms = new Map<string, RoomInstanceState>();

function generateCode(): string {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += charset[Math.floor(Math.random() * charset.length)];
  if (rooms.has(code)) return generateCode();
  return code;
}

function generateInvite(): number {
  return Math.floor(100000 + Math.random() * 900000);
}

function findRoomByCode(code: string): Room | undefined {
  return rooms.get(code.toUpperCase())?.room;
}

function createRoom(): RoomInstanceState {
  const id = uuidv4();
  const code = generateCode();
  const invite = generateInvite();
  const room: Room = { id, code, invite, seats: [null, null, null, null], spectators: [], started: false, winnerIds: [], createdAt: Date.now() };
  const players: Player[] = [];
  for (let i = 0; i < 4; i++) {
    players.push({ id: `slot-${i}`, name: `Seat ${i + 1}`, color: COLORS[i], seat: i, isCPU: false, ready: false, emoticon: null });
  }
  const engine = createEngine(players);
  const entry: RoomInstanceState = { room, engine, turnTimer: null };
  return entry;
}

function addSpectator(roomId: string, socketId: string): boolean {
  const entry = rooms.get(roomId);
  if (!entry) return false;
  if (entry.room.spectators.length >= 6) return false;
  if (entry.room.spectators.includes(socketId)) return true;
  entry.room.spectators.push(socketId);
  return true;
}

function removeSpectator(roomId: string, socketId: string): void {
  const entry = rooms.get(roomId);
  if (!entry) return;
  entry.room.spectators = entry.room.spectators.filter((s) => s !== socketId);
}

function broadcast(roomId: string, event: string, payload?: unknown, skipSocketId?: string) {
  const entry = rooms.get(roomId);
  if (!entry) return;
  const room = entry.room;
  const publicRoom: PublicRoom = {
    id: room.id,
    code: room.code,
    invite: room.invite,
    seats: room.seats,
    started: room.started,
    winnerIds: room.winnerIds,
    createdAt: room.createdAt,
    spectatorCount: room.spectators.length,
  };
  if (skipSocketId) {
    io.to(roomId).except(skipSocketId).emit(event, payload ?? publicRoom);
  } else {
    io.to(roomId).emit(event, payload ?? publicRoom);
  }
}

function gameStateSnapshot(entry: RoomInstanceState): object {
  const { engine } = entry;
  const pieces = Object.fromEntries(engine.state.pieces);
  return {
    roomId: entry.room.id,
    pieces,
    currentPlayerSeat: engine.state.currentPlayerSeat,
    dice: engine.state.dice,
    diceLock: engine.state.diceLock,
    finished: engine.state.finished,
    winnerIds: engine.state.winnerIds,
    spectators: entry.room.spectators,
    lastMove: engine.state.lastMove,
  };
}

function broadcastState(entry: RoomInstanceState, skipSocketId?: string) {
  broadcast(entry.room.id, "game-state", gameStateSnapshot(entry), skipSocketId);
}

function advanceTurn(entry: RoomInstanceState, fromSeat: number) {
  const { engine } = entry;
  const nextSeat = ((fromSeat + 1) % 4);
  let seat = nextSeat;
  for (let i = 0; i < 4; i++) {
    const p = entry.room.seats[seat];
    if (p && p.ready) {
      engine.state.currentPlayerSeat = seat;
      startPlayerTurn(entry, seat);
      return;
    }
    seat = (seat + 1) % 4;
  }
  engine.state.currentPlayerSeat = null;
  broadcastState(entry);
}

function startPlayerTurn(entry: RoomInstanceState, seat: number) {
  const { engine, room } = entry;
  const player = room.seats[seat];
  if (!player || !player.ready) {
    advanceTurn(entry, seat);
    return;
  }
  engine.state.currentPlayerSeat = seat;
  if (player.isCPU) {
    cpuTurn(entry, seat);
  } else {
    broadcastState(entry);
  }
}

function cpuTurn(entry: RoomInstanceState, seat: number) {
  const { engine, room } = entry;
  const player = room.seats[seat] as Player;
  const difficulty = player.difficulty ?? "medium";
  let turnCount = 0;
  const maxTurns = 6;

  function step() {
    if (engine.state.finished) return;
    if (turnCount >= maxTurns) {
      advanceTurn(entry, seat);
      return;
    }
    turnCount++;
    const roll = engine.diceRoll();
    const { events, value } = rollDice(engine, seat);
    engine.state.lastMove = { type: "rolled", playerSeat: seat, value };
    engine.state.diceLock = true;
    broadcastState(entry);

    const delay = 700 + Math.floor(Math.random() * 500);
    entry.turnTimer = setTimeout(() => {
      if (engine.state.finished) return;
      const moves = legalMoves(engine, seat, value);
      if (moves.length === 0) {
        engine.state.diceLock = false;
        engine.state.dice = null;
        broadcastState(entry);
        const delay2 = 500;
        entry.turnTimer = setTimeout(() => advanceTurn(entry, seat), delay2);
        return;
      }
      const cpuResult = chooseCPUMove(engine, seat, difficulty);
      if (cpuResult.move === 0 || cpuResult.pieceId === "") {
        engine.state.diceLock = false;
        engine.state.dice = null;
        broadcastState(entry);
        entry.turnTimer = setTimeout(() => advanceTurn(entry, seat), 500);
        return;
      }
      const events2 = applyMove(engine, seat, cpuResult.pieceId, value);
      for (const ev of events2) {
        engine.state.lastMove = ev;
        broadcastState(entry);
      }
      const delay2 = 600;
      entry.turnTimer = setTimeout(() => {
        if (engine.state.finished) return;
        engine.state.diceLock = false;
        engine.state.dice = null;
        broadcastState(entry);
        advanceTurn(entry, seat);
      }, delay2);
    }, delay);
  }
  step();
}

function resetTimers(entry: RoomInstanceState) {
  if (entry.turnTimer) {
    clearTimeout(entry.turnTimer);
    entry.turnTimer = null;
  }
}

io.on("connection", (socket) => {
  let currentRoomId: string | null = null;

  socket.on("create-room", (name: string) => {
    const entry = createRoom();
    const room = entry.room;
    const player: Player = { id: socket.id, name: name || "Player", color: COLORS[0], seat: 0, isCPU: false, ready: false, emoticon: null };
    room.seats[0] = player;
    entry.engine.players[0] = player;
    currentRoomId = room.id;
    socket.join(room.id);
    socket.emit("room-created", {
      room: { id: room.id, code: room.code, invite: room.invite, seats: room.seats, started: room.started, winnerIds: room.winnerIds, createdAt: room.createdAt, spectatorCount: 0 },
      mySeat: 0,
      myColor: COLORS[0],
    });
    broadcast(room.id, "room-state", undefined, socket.id);
  });

  socket.on("join-room", (code: string, name: string) => {
    const found = findRoomByCode(code);
    if (!found) { socket.emit("error", { message: "Room not found" }); return; }
    const entry = rooms.get(found.id);
    if (!entry) { socket.emit("error", { message: "Room not found" }); return; }
    if (entry.room.started) {
      if (addSpectator(entry.room.id, socket.id)) {
        currentRoomId = entry.room.id;
        socket.join(entry.room.id);
        socket.emit("joined-spectator", {
          room: { id: entry.room.id, code: entry.room.code, invite: entry.room.invite, seats: entry.room.seats, started: entry.room.started, winnerIds: entry.room.winnerIds, createdAt: entry.room.createdAt, spectatorCount: entry.room.spectators.length },
        });
        broadcast(entry.room.id, "room-state");
      } else { socket.emit("error", { message: "Spectator limit reached" }); }
      return;
    }
    const existing = entry.room.seats.findIndex((s) => s?.id === socket.id);
    if (existing !== -1) { socket.emit("error", { message: "Already joined" }); return; }
    const seatIndex = entry.room.seats.findIndex((s) => s === null);
    if (seatIndex === -1) {
      if (addSpectator(entry.room.id, socket.id)) {
        currentRoomId = entry.room.id;
        socket.join(entry.room.id);
        socket.emit("joined-spectator", {
          room: { id: entry.room.id, code: entry.room.code, invite: entry.room.invite, seats: entry.room.seats, started: entry.room.started, winnerIds: entry.room.winnerIds, createdAt: entry.room.createdAt, spectatorCount: entry.room.spectators.length },
        });
        broadcast(entry.room.id, "room-state");
      } else { socket.emit("error", { message: "Spectator limit reached" }); }
      return;
    }
    const player: Player = { id: socket.id, name: name || "Player", color: COLORS[seatIndex], seat: seatIndex, isCPU: false, ready: false, emoticon: null };
    entry.room.seats[seatIndex] = player;
    entry.engine.players[seatIndex] = player;
    currentRoomId = entry.room.id;
    socket.join(entry.room.id);
    socket.emit("room-joined", {
      room: { id: entry.room.id, code: entry.room.code, invite: entry.room.invite, seats: entry.room.seats, started: entry.room.started, winnerIds: entry.room.winnerIds, createdAt: entry.room.createdAt, spectatorCount: entry.room.spectators.length },
      mySeat: seatIndex,
      myColor: COLORS[seatIndex],
    });
    broadcast(entry.room.id, "room-state");
  });

  socket.on("start-game", () => {
    if (!currentRoomId) return;
    const entry = rooms.get(currentRoomId);
    if (!entry) return;
    const room = entry.room;
    if (room.seats.every((s) => s === null)) { socket.emit("error", { message: "No players in room" }); return; }
    for (let i = 0; i < 4; i++) {
      if (room.seats[i] === null) {
        const difficulties = ["easy", "medium", "hard"] as const;
        const cpu: Player = { id: `cpu-${room.id}-${i}`, name: `CPU ${COLORS[i]}`, color: COLORS[i], seat: i, isCPU: true, difficulty: difficulties[i % 3], ready: true, emoticon: null };
        room.seats[i] = cpu;
        entry.engine.players[i] = cpu;
      }
    }
    room.started = true;
    entry.engine.state.currentPlayerSeat = 0;
    broadcast(room.id, "game-started", undefined);
    startPlayerTurn(entry, 0);
  });

  socket.on("ready-toggle", () => {
    if (!currentRoomId) return;
    const entry = rooms.get(currentRoomId);
    if (!entry) return;
    const idx = entry.room.seats.findIndex((s) => s?.id === socket.id);
    if (idx !== -1) {
      entry.room.seats[idx]!.ready = !entry.room.seats[idx]!.ready;
      broadcast(currentRoomId, "room-state");
    }
  });

  socket.on("roll-dice", () => {
    if (!currentRoomId) return;
    const entry = rooms.get(currentRoomId);
    if (!entry) return;
    const seat = entry.engine.state.currentPlayerSeat;
    if (seat === null) return;
    const player = entry.room.seats[seat];
    if (!player || player.id !== socket.id) return;
    if (entry.engine.state.dice !== null) return;
    if (entry.turnTimer) { resetTimers(entry); }
    const { events, value } = rollDice(entry.engine, seat);
    entry.engine.state.lastMove = { type: "rolled", playerSeat: seat, value };
    broadcastState(entry);
    entry.turnTimer = setTimeout(() => {
      if (entry.engine.state.finished) return;
      const moves = legalMoves(entry.engine, seat, value);
      if (moves.length === 0) {
        entry.engine.state.diceLock = false;
        entry.engine.state.dice = null;
        broadcastState(entry);
        entry.turnTimer = setTimeout(() => advanceTurn(entry, seat), 500);
        return;
      }
      broadcastState(entry);
    }, 700);
  });

  socket.on("make-move", (pieceIdEncoded: string) => {
    if (!currentRoomId) return;
    const entry = rooms.get(currentRoomId);
    if (!entry) return;
    const seat = entry.engine.state.currentPlayerSeat;
    if (seat === null) return;
    const player = entry.room.seats[seat];
    if (!player || player.id !== socket.id) return;
    if (entry.engine.state.dice === null) return;
    if (entry.turnTimer) { resetTimers(entry); }
    let pidDecoded: string;
    try { pidDecoded = Buffer.from(pieceIdEncoded, "base64url").toString("utf8"); } catch { return; }
    try {
      const events = applyMove(entry.engine, seat, pidDecoded, entry.engine.state.dice!);
      for (const ev of events) {
        entry.engine.state.lastMove = ev;
        broadcastState(entry);
      }
      entry.turnTimer = setTimeout(() => {
        if (entry.engine.state.finished) return;
        entry.engine.state.diceLock = false;
        entry.engine.state.dice = null;
        broadcastState(entry);
        advanceTurn(entry, seat);
      }, 600);
    } catch (err) {
      socket.emit("error", { message: "Illegal move" });
    }
  });

  socket.on("send-emoticon", (emoticon: string) => {
    if (!currentRoomId) return;
    const entry = rooms.get(currentRoomId);
    if (!entry) return;
    const idx = entry.room.seats.findIndex((s) => s?.id === socket.id);
    if (idx !== -1) {
      entry.room.seats[idx]!.emoticon = emoticon;
      io.to(currentRoomId!).emit("emoticon", { playerId: socket.id, seat: idx, emoticon });
      setTimeout(() => {
        if (entry.room.seats[idx]) entry.room.seats[idx].emoticon = null;
        io.to(currentRoomId!).emit("emoticon-cleared", { seat: idx });
      }, 2000);
    }
  });

  socket.on("leave-room", () => {
    if (currentRoomId) {
      const entry = rooms.get(currentRoomId);
      if (entry) {
        resetTimers(entry);
        for (let i = 0; i < 4; i++) {
          if (entry.room.seats[i]?.id === socket.id) {
            entry.room.seats[i] = null;
            entry.engine.players[i] = { id: `slot-${i}`, name: `Seat ${i + 1}`, color: COLORS[i], seat: i, isCPU: false, ready: false, emoticon: null };
          }
        }
        removeSpectator(currentRoomId, socket.id);
        if (entry.room.seats.every((s) => s === null) && entry.room.spectators.length === 0) {
          rooms.delete(currentRoomId);
        } else {
          broadcast(currentRoomId, "room-state");
        }
      }
      currentRoomId = null;
    }
  });

  socket.on("disconnect", () => {
    if (currentRoomId) {
      const entry = rooms.get(currentRoomId);
      if (entry) {
        resetTimers(entry);
        for (let i = 0; i < 4; i++) {
          if (entry.room.seats[i]?.id === socket.id) {
            entry.room.seats[i] = null;
            entry.engine.players[i] = { id: `slot-${i}`, name: `Seat ${i + 1}`, color: COLORS[i], seat: i, isCPU: false, ready: false, emoticon: null };
          }
        }
        removeSpectator(currentRoomId, socket.id);
        if (entry.room.seats.every((s) => s === null) && entry.room.spectators.length === 0) {
          rooms.delete(currentRoomId);
        } else {
          broadcast(currentRoomId, "room-state");
        }
      }
      currentRoomId = null;
    }
  });
});

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
server.listen(PORT, () => console.log(`Ludo server listening on port ${PORT}`));
