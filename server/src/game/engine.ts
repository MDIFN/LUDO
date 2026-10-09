import { Color, COLORS, makePieceId, PositionLike, PieceState, Player, CPUResult } from "../shared/types.js";
import { TRACK_LENGTH, HOME_COLUMN_LENGTH, SAFE_TRACK_INDICES, isSafeSquare, colorEntryIndex } from "../shared/board.js";

export type Engine = {
  state: GameStateInternal;
  players: Player[];
  diceRoll: () => number;
};

export type GameStateInternal = {
  pieces: Map<string, PieceState>;
  currentPlayerSeat: number | null;
  dice: number | null;
  diceLock: boolean;
  turnStartTime: number;
  finished: boolean;
  winnerIds: string[];
  lastMove: MoveEvent | null;
  spectators: string[];
};

export type MoveEvent =
  | { type: "rolled"; playerSeat: number; value: number }
  | { type: "moved"; playerSeat: number; pieceId: string; from: PositionLike; to: PositionLike }
  | { type: "captured"; playerSeat: number; capturedPieceId: string; byPieceId: string }
  | { type: "enteredHome"; playerSeat: number; pieceId: string }
  | { type: "finished"; playerSeat: number }
  | { type: "turnChanged"; nextSeat: number | null }
  | { type: "gameOver"; winnerIds: string[] }
  | { type: "emoticon"; playerId: string; emoticon: string };

export type LegalMove = {
  pieceId: string;
  from: PositionLike;
  to: PositionLike;
  captured?: string;
  enteredHome?: boolean;
};

export function createEngine(players: Player[], diceRoll: () => number = () => Math.floor(Math.random() * 6) + 1): Engine {
  const pieces = new Map<string, PieceState>();
  for (const color of COLORS) {
    for (let i = 0; i < 4; i++) pieces.set(makePieceId(color, i), { kind: "home" });
  }
  return {
    state: {
      pieces,
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
    diceRoll,
  };
}

function sameColor(pieceId: string, color: Color): boolean {
  return pieceId.startsWith(color + "-");
}

function clonePieces(pieces: Map<string, PieceState>): Map<string, PieceState> {
  const m = new Map<string, PieceState>();
  pieces.forEach((v, k) => m.set(k, v));
  return m;
}

export function legalMoves(engine: Engine, playerSeat: number, roll: number): LegalMove[] {
  const color = engine.players[playerSeat]!.color;
  const pieces = engine.state.pieces;
  const entry = colorEntryIndex(color);
  const out: LegalMove[] = [];

  for (let i = 0; i < 4; i++) {
    const pid = makePieceId(color, i);
    const cur = pieces.get(pid);
    if (!cur) continue;

    if (cur.kind === "finished") continue;

    if (cur.kind === "homeColumn") {
      const needed = HOME_COLUMN_LENGTH - cur.index;
      if (roll === needed) {
        const to: PositionLike = { kind: "finished" };
        out.push({ pieceId: pid, from: cur, to, captured: undefined, enteredHome: true });
      }
      continue;
    }

    if (cur.kind === "home") {
      if (roll === 6) {
        const to: PositionLike = { kind: "track", index: entry };
        const cap = wouldCapture(pid, to, pieces);
        out.push({ pieceId: pid, from: cur, to, captured: cap, enteredHome: false });
      }
      continue;
    }

    if (cur.kind === "track") {
      const raw = cur.index + roll;
      if (raw >= TRACK_LENGTH) {
        const steps = raw - TRACK_LENGTH;
        if (steps >= HOME_COLUMN_LENGTH) continue; // overshoot home
        const to: PositionLike = { kind: "homeColumn", index: steps };
        const cap = wouldCapture(pid, to, pieces);
        out.push({ pieceId: pid, from: cur, to, captured: cap, enteredHome: false });
      } else {
        const to: PositionLike = { kind: "track", index: raw };
        const cap = wouldCapture(pid, to, pieces);
        out.push({ pieceId: pid, from: cur, to, captured: cap, enteredHome: false });
      }
    }
  }

  return out;
}

function findCapture(pieceId: string, to: PositionLike, pieces: Map<string, PieceState>): string | undefined {
  const color = pieceId.startsWith("red") ? "red" : pieceId.startsWith("yellow") ? "yellow" : pieceId.startsWith("green") ? "green" : "blue";
  for (const [otherId, other] of pieces) {
    if (otherId === pieceId) continue;
    if (other.kind === "home" || other.kind === "finished") continue;
    // Standard Ludo: no captures in the home column.
    if (to.kind === "track" && other.kind === "track" && other.index === to.index) {
      if (!sameColor(otherId, color) && !isSafeSquare(to.index)) return otherId;
    }
  }
  return undefined;
}

function wouldCapture(pieceId: string, to: PositionLike, pieces: Map<string, PieceState>): string | undefined {
  return findCapture(pieceId, to, pieces);
}

export function applyMove(engine: Engine, playerSeat: number, pieceId: string, roll: number): MoveEvent[] {
  const color = engine.players[playerSeat]!.color;
  const moves = legalMoves(engine, playerSeat, roll);
  const chosen = moves.find((m) => m.pieceId === pieceId);
  if (!chosen) throw new Error(`Illegal move: ${pieceId} with roll ${roll}`);

  const pieces = engine.state.pieces;
  const from = chosen.from;
  const to = chosen.to;

  // Captures happen when the moving piece lands on a square occupied by an opponent's non-safe piece.
  const captured = findCapture(pieceId, to, pieces);
  pieces.set(pieceId, to);

  const events: MoveEvent[] = [{ type: "moved", playerSeat, pieceId, from, to }];
  if (chosen.enteredHome) events.push({ type: "enteredHome", playerSeat, pieceId });
  if (captured) {
    pieces.set(captured, { kind: "home" });
    events.push({ type: "captured", playerSeat, capturedPieceId: captured, byPieceId: pieceId });
  }
  if (to.kind === "finished") {
    let allDone = true;
    for (let i = 0; i < 4; i++) {
      const s = pieces.get(makePieceId(color, i));
      if (!s || s.kind !== "finished") { allDone = false; break; }
    }
    if (allDone) events.push({ type: "finished", playerSeat });
  }
  return events;
}

export function rollDice(engine: Engine, playerSeat: number): { events: MoveEvent[]; value: number } {
  if (engine.state.diceLock) throw new Error("Dice already locked for this turn");
  const value = engine.diceRoll();
  engine.state.dice = value;
  engine.state.diceLock = true;
  engine.state.lastMove = { type: "rolled", playerSeat, value };
  return { events: [{ type: "rolled", playerSeat, value }], value };
}

function nextReadySeat(players: Player[], from: number): number | null {
  for (let i = 1; i <= 4; i++) {
    const seat = (from + i) % 4;
    const p = players[seat];
    if (p && p.ready) return seat;
  }
  return null;
}

export function executeTurn(engine: Engine, playerSeat: number, chosenPieceId: string | null): { events: MoveEvent[]; nextSeat: number | null } {
  const roll = engine.state.dice;
  if (roll === null) throw new Error("No dice roll for turn");

  const events = chosenPieceId !== null ? applyMove(engine, playerSeat, chosenPieceId, roll) : [];
  engine.state.diceLock = false;
  engine.state.dice = null;

  const nextSeat = nextReadySeat(engine.players, playerSeat);
  engine.state.currentPlayerSeat = nextSeat;
  events.push({ type: "turnChanged", nextSeat });

  return { events, nextSeat };
}

export function chooseCPUMove(engine: Engine, playerSeat: number, difficulty: "easy" | "medium" | "hard"): CPUResult {
  const roll = engine.state.dice;
  if (roll === null) throw new Error("No dice roll");
  const moves = legalMoves(engine, playerSeat, roll);
  if (moves.length === 0) return { pieceId: "", move: 0, reason: "noLegalMove" };

  if (difficulty === "easy") {
    const pick = moves[Math.floor(Math.random() * moves.length)];
    return { pieceId: pick.pieceId, move: roll, reason: pick.enteredHome ? "rolled" : "rolled" };
  }

  if (difficulty === "medium") {
    let best: { pieceId: string; score: number } | null = null;
    for (const m of moves) {
      let score = 0;
      if (m.captured) score += 3;
      if (m.to.kind === "track" && isSafeSquare(m.to.index)) score += 2;
      if (m.enteredHome) score += 2;
      if (!best || score > best.score) best = { pieceId: m.pieceId, score };
    }
    const chosen = best!;
    return {
      pieceId: chosen.pieceId,
      move: roll,
      reason: chosen.score >= 3 ? "captured" : chosen.score >= 2 ? "safe" : "progress",
    };
  }

  // Hard
  let best: { pieceId: string; score: number; reason: CPUResult["reason"] } | null = null;
  const color = engine.players[playerSeat]!.color;
  for (const m of moves) {
    let score = 0;
    let reason: CPUResult["reason"] = "progress";
    if (m.captured) {
      score += 5;
      reason = "captured";
    }
    if (m.to.kind === "track") {
      if (isSafeSquare(m.to.index)) {
        score += 3;
        if (reason === "progress") reason = "safe";
      }
      for (const [opid, ostate] of engine.state.pieces) {
        if (sameColor(opid, color)) continue;
        if (ostate.kind !== "track" || isSafeSquare(ostate.index)) continue;
        const needed = TRACK_LENGTH - ostate.index;
        const blockIndex = (ostate.index + needed - 1 + TRACK_LENGTH) % TRACK_LENGTH;
        if (blockIndex === m.to.index && needed <= roll) {
          score += 2;
          if (reason === "progress") reason = "blockedOpponent";
        }
      }
    }
    if (m.enteredHome) {
      score += 4;
      if (reason === "progress") reason = "rolled";
    }
    if (!best || score > best.score) best = { pieceId: m.pieceId, score, reason };
  }
  return { pieceId: best!.pieceId, move: roll, reason: best!.reason };
}
