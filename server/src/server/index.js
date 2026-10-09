"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var node_http_1 = require("node:http");
var express_1 = require("express");
var socket_io_1 = require("socket.io");
var uuid_1 = require("uuid");
var engine_js_1 = require("../game/engine.js");
var types_js_1 = require("../shared/types.js");
var app = (0, express_1.default)();
var server = node_http_1.default.createServer(app);
var io = new socket_io_1.Server(server, { cors: { origin: true, methods: ["GET", "POST"] }, transports: ["websocket", "polling"] });
app.use(express_1.default.static("public"));
var rooms = new Map();
function generateCode() {
    var charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    var code = "";
    for (var i = 0; i < 6; i++)
        code += charset[Math.floor(Math.random() * charset.length)];
    if (rooms.has(code))
        return generateCode();
    return code;
}
function generateInvite() {
    return Math.floor(100000 + Math.random() * 900000);
}
function findRoomByCode(code) {
    var _a;
    return (_a = rooms.get(code.toUpperCase())) === null || _a === void 0 ? void 0 : _a.room;
}
function createRoom() {
    var id = (0, uuid_1.v4)();
    var code = generateCode();
    var invite = generateInvite();
    var room = { id: id, code: code, invite: invite, seats: [null, null, null, null], spectators: [], started: false, winnerIds: [], createdAt: Date.now() };
    var players = [];
    for (var i = 0; i < 4; i++) {
        players.push({ id: "slot-".concat(i), name: "Seat ".concat(i + 1), color: types_js_1.COLORS[i], seat: i, isCPU: false, ready: false, emoticon: null });
    }
    var engine = (0, engine_js_1.createEngine)(players);
    var entry = { room: room, engine: engine, turnTimer: null };
    return entry;
}
function addSpectator(roomId, socketId) {
    var entry = rooms.get(roomId);
    if (!entry)
        return false;
    if (entry.room.spectators.length >= 6)
        return false;
    if (entry.room.spectators.includes(socketId))
        return true;
    entry.room.spectators.push(socketId);
    return true;
}
function removeSpectator(roomId, socketId) {
    var entry = rooms.get(roomId);
    if (!entry)
        return;
    entry.room.spectators = entry.room.spectators.filter(function (s) { return s !== socketId; });
}
function broadcast(roomId, event, payload, skipSocketId) {
    var entry = rooms.get(roomId);
    if (!entry)
        return;
    var room = entry.room;
    var publicRoom = {
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
        io.to(roomId).except(skipSocketId).emit(event, payload !== null && payload !== void 0 ? payload : publicRoom);
    }
    else {
        io.to(roomId).emit(event, payload !== null && payload !== void 0 ? payload : publicRoom);
    }
}
function gameStateSnapshot(entry) {
    var engine = entry.engine;
    var pieces = Object.fromEntries(engine.state.pieces);
    return {
        roomId: entry.room.id,
        pieces: pieces,
        currentPlayerSeat: engine.state.currentPlayerSeat,
        dice: engine.state.dice,
        diceLock: engine.state.diceLock,
        finished: engine.state.finished,
        winnerIds: engine.state.winnerIds,
        spectators: entry.room.spectators,
        lastMove: engine.state.lastMove,
    };
}
function broadcastState(entry, skipSocketId) {
    broadcast(entry.room.id, "game-state", gameStateSnapshot(entry), skipSocketId);
}
function advanceTurn(entry, fromSeat) {
    var engine = entry.engine;
    var nextSeat = ((fromSeat + 1) % 4);
    var seat = nextSeat;
    for (var i = 0; i < 4; i++) {
        var p = entry.room.seats[seat];
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
function startPlayerTurn(entry, seat) {
    var engine = entry.engine, room = entry.room;
    var player = room.seats[seat];
    if (!player || !player.ready) {
        advanceTurn(entry, seat);
        return;
    }
    engine.state.currentPlayerSeat = seat;
    if (player.isCPU) {
        cpuTurn(entry, seat);
    }
    else {
        broadcastState(entry);
    }
}
function cpuTurn(entry, seat) {
    var _a;
    var engine = entry.engine, room = entry.room;
    var player = room.seats[seat];
    var difficulty = (_a = player.difficulty) !== null && _a !== void 0 ? _a : "medium";
    var turnCount = 0;
    var maxTurns = 6;
    function step() {
        if (engine.state.finished)
            return;
        if (turnCount >= maxTurns) {
            advanceTurn(entry, seat);
            return;
        }
        turnCount++;
        var roll = engine.diceRoll();
        var _a = (0, engine_js_1.rollDice)(engine, seat), events = _a.events, value = _a.value;
        engine.state.lastMove = { type: "rolled", playerSeat: seat, value: value };
        engine.state.diceLock = true;
        broadcastState(entry);
        var delay = 700 + Math.floor(Math.random() * 500);
        entry.turnTimer = setTimeout(function () {
            if (engine.state.finished)
                return;
            var moves = (0, engine_js_1.legalMoves)(engine, seat, value);
            if (moves.length === 0) {
                engine.state.diceLock = false;
                engine.state.dice = null;
                broadcastState(entry);
                var delay2_1 = 500;
                entry.turnTimer = setTimeout(function () { return advanceTurn(entry, seat); }, delay2_1);
                return;
            }
            var cpuResult = (0, engine_js_1.chooseCPUMove)(engine, seat, difficulty);
            if (cpuResult.move === 0 || cpuResult.pieceId === "") {
                engine.state.diceLock = false;
                engine.state.dice = null;
                broadcastState(entry);
                entry.turnTimer = setTimeout(function () { return advanceTurn(entry, seat); }, 500);
                return;
            }
            var events2 = (0, engine_js_1.applyMove)(engine, seat, cpuResult.pieceId, value);
            for (var _i = 0, events2_1 = events2; _i < events2_1.length; _i++) {
                var ev = events2_1[_i];
                engine.state.lastMove = ev;
                broadcastState(entry);
            }
            var delay2 = 600;
            entry.turnTimer = setTimeout(function () {
                if (engine.state.finished)
                    return;
                engine.state.diceLock = false;
                engine.state.dice = null;
                broadcastState(entry);
                advanceTurn(entry, seat);
            }, delay2);
        }, delay);
    }
    step();
}
function resetTimers(entry) {
    if (entry.turnTimer) {
        clearTimeout(entry.turnTimer);
        entry.turnTimer = null;
    }
}
io.on("connection", function (socket) {
    var currentRoomId = null;
    socket.on("create-room", function (name) {
        var entry = createRoom();
        var room = entry.room;
        var player = { id: socket.id, name: name || "Player", color: types_js_1.COLORS[0], seat: 0, isCPU: false, ready: false, emoticon: null };
        room.seats[0] = player;
        entry.engine.players[0] = player;
        currentRoomId = room.id;
        socket.join(room.id);
        socket.emit("room-created", {
            room: { id: room.id, code: room.code, invite: room.invite, seats: room.seats, started: room.started, winnerIds: room.winnerIds, createdAt: room.createdAt, spectatorCount: 0 },
            mySeat: 0,
            myColor: types_js_1.COLORS[0],
        });
        broadcast(room.id, "room-state", undefined, socket.id);
    });
    socket.on("join-room", function (code, name) {
        var found = findRoomByCode(code);
        if (!found) {
            socket.emit("error", { message: "Room not found" });
            return;
        }
        var entry = rooms.get(found.id);
        if (!entry) {
            socket.emit("error", { message: "Room not found" });
            return;
        }
        if (entry.room.started) {
            if (addSpectator(entry.room.id, socket.id)) {
                currentRoomId = entry.room.id;
                socket.join(entry.room.id);
                socket.emit("joined-spectator", {
                    room: { id: entry.room.id, code: entry.room.code, invite: entry.room.invite, seats: entry.room.seats, started: entry.room.started, winnerIds: entry.room.winnerIds, createdAt: entry.room.createdAt, spectatorCount: entry.room.spectators.length },
                });
                broadcast(entry.room.id, "room-state");
            }
            else {
                socket.emit("error", { message: "Spectator limit reached" });
            }
            return;
        }
        var existing = entry.room.seats.findIndex(function (s) { return (s === null || s === void 0 ? void 0 : s.id) === socket.id; });
        if (existing !== -1) {
            socket.emit("error", { message: "Already joined" });
            return;
        }
        var seatIndex = entry.room.seats.findIndex(function (s) { return s === null; });
        if (seatIndex === -1) {
            if (addSpectator(entry.room.id, socket.id)) {
                currentRoomId = entry.room.id;
                socket.join(entry.room.id);
                socket.emit("joined-spectator", {
                    room: { id: entry.room.id, code: entry.room.code, invite: entry.room.invite, seats: entry.room.seats, started: entry.room.started, winnerIds: entry.room.winnerIds, createdAt: entry.room.createdAt, spectatorCount: entry.room.spectators.length },
                });
                broadcast(entry.room.id, "room-state");
            }
            else {
                socket.emit("error", { message: "Spectator limit reached" });
            }
            return;
        }
        var player = { id: socket.id, name: name || "Player", color: types_js_1.COLORS[seatIndex], seat: seatIndex, isCPU: false, ready: false, emoticon: null };
        entry.room.seats[seatIndex] = player;
        entry.engine.players[seatIndex] = player;
        currentRoomId = entry.room.id;
        socket.join(entry.room.id);
        socket.emit("room-joined", {
            room: { id: entry.room.id, code: entry.room.code, invite: entry.room.invite, seats: entry.room.seats, started: entry.room.started, winnerIds: entry.room.winnerIds, createdAt: entry.room.createdAt, spectatorCount: entry.room.spectators.length },
            mySeat: seatIndex,
            myColor: types_js_1.COLORS[seatIndex],
        });
        broadcast(entry.room.id, "room-state");
    });
    socket.on("start-game", function () {
        if (!currentRoomId)
            return;
        var entry = rooms.get(currentRoomId);
        if (!entry)
            return;
        var room = entry.room;
        if (room.seats.every(function (s) { return s === null; })) {
            socket.emit("error", { message: "No players in room" });
            return;
        }
        for (var i = 0; i < 4; i++) {
            if (room.seats[i] === null) {
                var difficulties = ["easy", "medium", "hard"];
                var cpu = { id: "cpu-".concat(room.id, "-").concat(i), name: "CPU ".concat(types_js_1.COLORS[i]), color: types_js_1.COLORS[i], seat: i, isCPU: true, difficulty: difficulties[i % 3], ready: true, emoticon: null };
                room.seats[i] = cpu;
                entry.engine.players[i] = cpu;
            }
        }
        room.started = true;
        entry.engine.state.currentPlayerSeat = 0;
        broadcast(room.id, "game-started", undefined);
        startPlayerTurn(entry, 0);
    });
    socket.on("ready-toggle", function () {
        if (!currentRoomId)
            return;
        var entry = rooms.get(currentRoomId);
        if (!entry)
            return;
        var idx = entry.room.seats.findIndex(function (s) { return (s === null || s === void 0 ? void 0 : s.id) === socket.id; });
        if (idx !== -1) {
            entry.room.seats[idx].ready = !entry.room.seats[idx].ready;
            broadcast(currentRoomId, "room-state");
        }
    });
    socket.on("roll-dice", function () {
        if (!currentRoomId)
            return;
        var entry = rooms.get(currentRoomId);
        if (!entry)
            return;
        var seat = entry.engine.state.currentPlayerSeat;
        if (seat === null)
            return;
        var player = entry.room.seats[seat];
        if (!player || player.id !== socket.id)
            return;
        if (entry.engine.state.dice !== null)
            return;
        if (entry.turnTimer) {
            resetTimers(entry);
        }
        var _a = (0, engine_js_1.rollDice)(entry.engine, seat), events = _a.events, value = _a.value;
        entry.engine.state.lastMove = { type: "rolled", playerSeat: seat, value: value };
        broadcastState(entry);
        entry.turnTimer = setTimeout(function () {
            if (entry.engine.state.finished)
                return;
            var moves = (0, engine_js_1.legalMoves)(entry.engine, seat, value);
            if (moves.length === 0) {
                entry.engine.state.diceLock = false;
                entry.engine.state.dice = null;
                broadcastState(entry);
                entry.turnTimer = setTimeout(function () { return advanceTurn(entry, seat); }, 500);
                return;
            }
            broadcastState(entry);
        }, 700);
    });
    socket.on("make-move", function (pieceIdEncoded) {
        if (!currentRoomId)
            return;
        var entry = rooms.get(currentRoomId);
        if (!entry)
            return;
        var seat = entry.engine.state.currentPlayerSeat;
        if (seat === null)
            return;
        var player = entry.room.seats[seat];
        if (!player || player.id !== socket.id)
            return;
        if (entry.engine.state.dice === null)
            return;
        if (entry.turnTimer) {
            resetTimers(entry);
        }
        var pidDecoded;
        try {
            pidDecoded = Buffer.from(pieceIdEncoded, "base64url").toString("utf8");
        }
        catch (_a) {
            return;
        }
        try {
            var events = (0, engine_js_1.applyMove)(entry.engine, seat, pidDecoded, entry.engine.state.dice);
            for (var _i = 0, events_1 = events; _i < events_1.length; _i++) {
                var ev = events_1[_i];
                entry.engine.state.lastMove = ev;
                broadcastState(entry);
            }
            entry.turnTimer = setTimeout(function () {
                if (entry.engine.state.finished)
                    return;
                entry.engine.state.diceLock = false;
                entry.engine.state.dice = null;
                broadcastState(entry);
                advanceTurn(entry, seat);
            }, 600);
        }
        catch (err) {
            socket.emit("error", { message: "Illegal move" });
        }
    });
    socket.on("send-emoticon", function (emoticon) {
        if (!currentRoomId)
            return;
        var entry = rooms.get(currentRoomId);
        if (!entry)
            return;
        var idx = entry.room.seats.findIndex(function (s) { return (s === null || s === void 0 ? void 0 : s.id) === socket.id; });
        if (idx !== -1) {
            entry.room.seats[idx].emoticon = emoticon;
            io.to(currentRoomId).emit("emoticon", { playerId: socket.id, seat: idx, emoticon: emoticon });
            setTimeout(function () {
                if (entry.room.seats[idx])
                    entry.room.seats[idx].emoticon = null;
                io.to(currentRoomId).emit("emoticon-cleared", { seat: idx });
            }, 2000);
        }
    });
    socket.on("leave-room", function () {
        var _a;
        if (currentRoomId) {
            var entry = rooms.get(currentRoomId);
            if (entry) {
                resetTimers(entry);
                for (var i = 0; i < 4; i++) {
                    if (((_a = entry.room.seats[i]) === null || _a === void 0 ? void 0 : _a.id) === socket.id) {
                        entry.room.seats[i] = null;
                        entry.engine.players[i] = { id: "slot-".concat(i), name: "Seat ".concat(i + 1), color: types_js_1.COLORS[i], seat: i, isCPU: false, ready: false, emoticon: null };
                    }
                }
                removeSpectator(currentRoomId, socket.id);
                if (entry.room.seats.every(function (s) { return s === null; }) && entry.room.spectators.length === 0) {
                    rooms.delete(currentRoomId);
                }
                else {
                    broadcast(currentRoomId, "room-state");
                }
            }
            currentRoomId = null;
        }
    });
    socket.on("disconnect", function () {
        var _a;
        if (currentRoomId) {
            var entry = rooms.get(currentRoomId);
            if (entry) {
                resetTimers(entry);
                for (var i = 0; i < 4; i++) {
                    if (((_a = entry.room.seats[i]) === null || _a === void 0 ? void 0 : _a.id) === socket.id) {
                        entry.room.seats[i] = null;
                        entry.engine.players[i] = { id: "slot-".concat(i), name: "Seat ".concat(i + 1), color: types_js_1.COLORS[i], seat: i, isCPU: false, ready: false, emoticon: null };
                    }
                }
                removeSpectator(currentRoomId, socket.id);
                if (entry.room.seats.every(function (s) { return s === null; }) && entry.room.spectators.length === 0) {
                    rooms.delete(currentRoomId);
                }
                else {
                    broadcast(currentRoomId, "room-state");
                }
            }
            currentRoomId = null;
        }
    });
});
var PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
server.listen(PORT, function () { return console.log("Ludo server listening on port ".concat(PORT)); });
