"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEngine = createEngine;
exports.legalMoves = legalMoves;
exports.applyMove = applyMove;
exports.rollDice = rollDice;
exports.executeTurn = executeTurn;
exports.chooseCPUMove = chooseCPUMove;
var types_js_1 = require("../shared/types.js");
var board_js_1 = require("../shared/board.js");
function createEngine(players, diceRoll) {
    if (diceRoll === void 0) { diceRoll = function () { return Math.floor(Math.random() * 6) + 1; }; }
    var pieces = new Map();
    for (var _i = 0, COLORS_1 = types_js_1.COLORS; _i < COLORS_1.length; _i++) {
        var color = COLORS_1[_i];
        for (var i = 0; i < 4; i++)
            pieces.set((0, types_js_1.makePieceId)(color, i), { kind: "home" });
    }
    return {
        state: {
            pieces: pieces,
            currentPlayerSeat: 0,
            dice: null,
            diceLock: false,
            turnStartTime: Date.now(),
            finished: false,
            winnerIds: [],
            lastMove: null,
            spectators: [],
        },
        players: players.slice(),
        diceRoll: diceRoll,
    };
}
function sameColor(pieceId, color) {
    return pieceId.startsWith(color + "-");
}
function clonePieces(pieces) {
    var m = new Map();
    pieces.forEach(function (v, k) { return m.set(k, v); });
    return m;
}
function legalMoves(engine, playerSeat, roll) {
    var color = engine.players[playerSeat].color;
    var pieces = engine.state.pieces;
    var entry = (0, board_js_1.colorEntryIndex)(color);
    var out = [];
    for (var i = 0; i < 4; i++) {
        var pid = (0, types_js_1.makePieceId)(color, i);
        var cur = pieces.get(pid);
        if (!cur)
            continue;
        if (cur.kind === "finished")
            continue;
        if (cur.kind === "homeColumn") {
            var needed = board_js_1.HOME_COLUMN_LENGTH - cur.index;
            if (roll === needed) {
                var to = { kind: "finished" };
                out.push({ pieceId: pid, from: cur, to: to, captured: undefined, enteredHome: true });
            }
            continue;
        }
        if (cur.kind === "home") {
            if (roll === 6) {
                var to = { kind: "track", index: entry };
                var cap = wouldCapture(pid, to, pieces);
                out.push({ pieceId: pid, from: cur, to: to, captured: cap, enteredHome: false });
            }
            continue;
        }
        if (cur.kind === "track") {
            var raw = cur.index + roll;
            if (raw >= board_js_1.TRACK_LENGTH) {
                var steps = raw - board_js_1.TRACK_LENGTH;
                if (steps >= board_js_1.HOME_COLUMN_LENGTH)
                    continue; // overshoot home
                var to = { kind: "homeColumn", index: steps };
                var cap = wouldCapture(pid, to, pieces);
                out.push({ pieceId: pid, from: cur, to: to, captured: cap, enteredHome: false });
            }
            else {
                var to = { kind: "track", index: raw };
                var cap = wouldCapture(pid, to, pieces);
                out.push({ pieceId: pid, from: cur, to: to, captured: cap, enteredHome: false });
            }
        }
    }
    return out;
}
function findCapture(pieceId, to, pieces) {
    var color = pieceId.startsWith("red") ? "red" : pieceId.startsWith("yellow") ? "yellow" : pieceId.startsWith("green") ? "green" : "blue";
    for (var _i = 0, pieces_1 = pieces; _i < pieces_1.length; _i++) {
        var _a = pieces_1[_i], otherId = _a[0], other = _a[1];
        if (otherId === pieceId)
            continue;
        if (other.kind === "home" || other.kind === "finished")
            continue;
        // Standard Ludo: no captures in the home column.
        if (to.kind === "track" && other.kind === "track" && other.index === to.index) {
            if (!sameColor(otherId, color) && !(0, board_js_1.isSafeSquare)(to.index))
                return otherId;
        }
    }
    return undefined;
}
function wouldCapture(pieceId, to, pieces) {
    return findCapture(pieceId, to, pieces);
}
function applyMove(engine, playerSeat, pieceId, roll) {
    var color = engine.players[playerSeat].color;
    var moves = legalMoves(engine, playerSeat, roll);
    var chosen = moves.find(function (m) { return m.pieceId === pieceId; });
    if (!chosen)
        throw new Error("Illegal move: ".concat(pieceId, " with roll ").concat(roll));
    var pieces = engine.state.pieces;
    var from = chosen.from;
    var to = chosen.to;
    // Captures happen when the moving piece lands on a square occupied by an opponent's non-safe piece.
    var captured = findCapture(pieceId, to, pieces);
    pieces.set(pieceId, to);
    var events = [{ type: "moved", playerSeat: playerSeat, pieceId: pieceId, from: from, to: to }];
    if (chosen.enteredHome)
        events.push({ type: "enteredHome", playerSeat: playerSeat, pieceId: pieceId });
    if (captured) {
        pieces.set(captured, { kind: "home" });
        events.push({ type: "captured", playerSeat: playerSeat, capturedPieceId: captured, byPieceId: pieceId });
    }
    if (to.kind === "finished") {
        var allDone = true;
        for (var i = 0; i < 4; i++) {
            var s = pieces.get((0, types_js_1.makePieceId)(color, i));
            if (!s || s.kind !== "finished") {
                allDone = false;
                break;
            }
        }
        if (allDone)
            events.push({ type: "finished", playerSeat: playerSeat });
    }
    return events;
}
function rollDice(engine, playerSeat) {
    if (engine.state.diceLock)
        throw new Error("Dice already locked for this turn");
    var value = engine.diceRoll();
    engine.state.dice = value;
    engine.state.diceLock = true;
    engine.state.lastMove = { type: "rolled", playerSeat: playerSeat, value: value };
    return { events: [{ type: "rolled", playerSeat: playerSeat, value: value }], value: value };
}
function nextReadySeat(players, from) {
    for (var i = 1; i <= 4; i++) {
        var seat = (from + i) % 4;
        var p = players[seat];
        if (p && p.ready)
            return seat;
    }
    return null;
}
function executeTurn(engine, playerSeat, chosenPieceId) {
    var roll = engine.state.dice;
    if (roll === null)
        throw new Error("No dice roll for turn");
    var events = chosenPieceId !== null ? applyMove(engine, playerSeat, chosenPieceId, roll) : [];
    engine.state.diceLock = false;
    engine.state.dice = null;
    var nextSeat = nextReadySeat(engine.players, playerSeat);
    engine.state.currentPlayerSeat = nextSeat;
    events.push({ type: "turnChanged", nextSeat: nextSeat });
    return { events: events, nextSeat: nextSeat };
}
function chooseCPUMove(engine, playerSeat, difficulty) {
    var roll = engine.state.dice;
    if (roll === null)
        throw new Error("No dice roll");
    var moves = legalMoves(engine, playerSeat, roll);
    if (moves.length === 0)
        return { pieceId: "", move: 0, reason: "noLegalMove" };
    if (difficulty === "easy") {
        var pick = moves[Math.floor(Math.random() * moves.length)];
        return { pieceId: pick.pieceId, move: roll, reason: pick.enteredHome ? "rolled" : "rolled" };
    }
    if (difficulty === "medium") {
        var best_1 = null;
        for (var _i = 0, moves_1 = moves; _i < moves_1.length; _i++) {
            var m = moves_1[_i];
            var score = 0;
            if (m.captured)
                score += 3;
            if (m.to.kind === "track" && (0, board_js_1.isSafeSquare)(m.to.index))
                score += 2;
            if (m.enteredHome)
                score += 2;
            if (!best_1 || score > best_1.score)
                best_1 = { pieceId: m.pieceId, score: score };
        }
        var chosen = best_1;
        return {
            pieceId: chosen.pieceId,
            move: roll,
            reason: chosen.score >= 3 ? "captured" : chosen.score >= 2 ? "safe" : "progress",
        };
    }
    // Hard
    var best = null;
    var color = engine.players[playerSeat].color;
    for (var _a = 0, moves_2 = moves; _a < moves_2.length; _a++) {
        var m = moves_2[_a];
        var score = 0;
        var reason = "progress";
        if (m.captured) {
            score += 5;
            reason = "captured";
        }
        if (m.to.kind === "track") {
            if ((0, board_js_1.isSafeSquare)(m.to.index)) {
                score += 3;
                if (reason === "progress")
                    reason = "safe";
            }
            for (var _b = 0, _c = engine.state.pieces; _b < _c.length; _b++) {
                var _d = _c[_b], opid = _d[0], ostate = _d[1];
                if (sameColor(opid, color))
                    continue;
                if (ostate.kind !== "track" || (0, board_js_1.isSafeSquare)(ostate.index))
                    continue;
                var needed = board_js_1.TRACK_LENGTH - ostate.index;
                var blockIndex = (ostate.index + needed - 1 + board_js_1.TRACK_LENGTH) % board_js_1.TRACK_LENGTH;
                if (blockIndex === m.to.index && needed <= roll) {
                    score += 2;
                    if (reason === "progress")
                        reason = "blockedOpponent";
                }
            }
        }
        if (m.enteredHome) {
            score += 4;
            if (reason === "progress")
                reason = "rolled";
        }
        if (!best || score > best.score)
            best = { pieceId: m.pieceId, score: score, reason: reason };
    }
    return { pieceId: best.pieceId, move: roll, reason: best.reason };
}
