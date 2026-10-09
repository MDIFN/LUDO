import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createEngine, legalMoves, applyMove, rollDice, executeTurn, chooseCPUMove } from "../dist/game/engine.js";
import type { Player } from "../dist/shared/types.js";
import { TRACK_LENGTH, HOME_COLUMN_LENGTH, SAFE_TRACK_INDICES, isSafeSquare, colorEntryIndex } from "../dist/shared/board.js";

function makePlayers(): Player[] {
  return [
    { id: "p0", name: "Red", color: "red", seat: 0, isCPU: false, ready: true, emoticon: null },
    { id: "p1", name: "Yellow", color: "yellow", seat: 1, isCPU: false, ready: true, emoticon: null },
    { id: "p2", name: "Green", color: "green", seat: 2, isCPU: false, ready: true, emoticon: null },
    { id: "p3", name: "Blue", color: "blue", seat: 3, isCPU: false, ready: true, emoticon: null },
  ];
}

function seedEngine(pieces: Record<string, { kind: string; index?: number }>, diceRoll = () => 6) {
  const engine = createEngine(makePlayers(), diceRoll);
  for (const [pid, state] of Object.entries(pieces)) {
    engine.state.pieces.set(pid, state as any);
  }
  return engine;
}

const pid = (color: string, index: number) => `${color}-${index}`;

function bothWays(actual: unknown, expected: unknown, msg?: string) {
  try {
    assert.deepStrictEqual(actual, expected, msg);
  } catch (err) {
    try {
      assert.deepStrictEqual(expected, actual);
    } catch (_) {
      throw err;
    }
  }
}

describe("Ludo engine — basic setup", () => {
  it("creates engine with all pieces at home", () => {
    const engine = createEngine(makePlayers());
    for (const color of ["red", "yellow", "green", "blue"]) {
      for (let i = 0; i < 4; i++) {
        bothWays(engine.state.pieces.get(pid(color, i)), { kind: "home" });
      }
    }
    assert.strictEqual(engine.state.currentPlayerSeat, 0);
    assert.strictEqual(engine.state.dice, null);
  });
});

describe("Legal moves", () => {
  it("no piece can move with roll 1 when all are at home", () => {
    const engine = seedEngine({});
    assert.strictEqual(legalMoves(engine, 0, 1).length, 0);
  });

  it("roll 6 lets a home piece enter the track at the color entry point", () => {
    const engine = seedEngine({});
    const moves = legalMoves(engine, 0, 6);
    assert.ok(moves.length > 0, "expected at least one legal move");
    const m = moves[0];
    bothWays(m.from, { kind: "home" });
    bothWays(m.to, { kind: "track", index: colorEntryIndex("red") });
    assert.ok(m.pieceId.includes("red"));
  });

  it("a piece on the track advances by roll unless overshooting home", () => {
    const engine = seedEngine({ [pid("red", 0)]: { kind: "track", index: 10 } }, () => 5);
    const moves = legalMoves(engine, 0, 5);
    assert.strictEqual(moves.length, 1);
    bothWays(moves[0].to, { kind: "track", index: 15 });
  });

  it("a piece one step from the end with a small roll enters the home column", () => {
    const engine = seedEngine({ [pid("red", 0)]: { kind: "track", index: 51 } }, () => 2);
    const moves = legalMoves(engine, 0, 2);
    assert.strictEqual(moves.length, 1);
    bothWays(moves[0].to, { kind: "homeColumn", index: 1 });
  });

  it("a piece overshooting the home column has no legal move", () => {
    const engine = seedEngine({ [pid("red", 0)]: { kind: "track", index: 51 } }, () => 7);
    assert.strictEqual(legalMoves(engine, 0, 7).length, 0);
  });

  it("a piece entering home column with exact roll is legal", () => {
    const engine = seedEngine({ [pid("red", 0)]: { kind: "track", index: 51 } }, () => 1);
    const moves = legalMoves(engine, 0, 1);
    assert.strictEqual(moves.length, 1);
    bothWays(moves[0].to, { kind: "homeColumn", index: 0 });
  });

  it("a piece in home column needs exact roll to finish", () => {
    const engine = seedEngine({ [pid("red", 0)]: { kind: "homeColumn", index: 5 } }, () => 1);
    const moves = legalMoves(engine, 0, 1);
    assert.strictEqual(moves.length, 1);
    bothWays(moves[0].to, { kind: "finished" });
    assert.strictEqual(moves[0].enteredHome, true);
  });

  it("a piece in home column with wrong roll cannot move", () => {
    const engine = seedEngine({ [pid("red", 0)]: { kind: "homeColumn", index: 5 } }, () => 2);
    assert.strictEqual(legalMoves(engine, 0, 2).length, 0);
  });

  it("a piece cannot enter home column if it would overshoot the 6 steps", () => {
    const engine = seedEngine({ [pid("red", 0)]: { kind: "track", index: 51 } }, () => 7);
    assert.strictEqual(legalMoves(engine, 0, 7).length, 0);
  });

  it("only the active player's pieces are considered", () => {
    const engine = seedEngine({
      [pid("red", 0)]: { kind: "track", index: 10 },
      [pid("yellow", 0)]: { kind: "track", index: 10 },
    }, () => 5);
    const redMoves = legalMoves(engine, 0, 5);
    const yellowMoves = legalMoves(engine, 1, 5);
    assert.strictEqual(redMoves.length, 1);
    assert.strictEqual(yellowMoves.length, 1);
    assert.ok(redMoves[0].pieceId.includes("red"));
    assert.ok(yellowMoves[0].pieceId.includes("yellow"));
  });
});

describe("Safe squares", () => {
  it("defines the standard safe squares", () => {
    assert.strictEqual(isSafeSquare(6), true);
    assert.strictEqual(isSafeSquare(13), true);
    assert.strictEqual(isSafeSquare(20), true);
    assert.strictEqual(isSafeSquare(27), true);
    assert.strictEqual(isSafeSquare(34), true);
    assert.strictEqual(isSafeSquare(41), true);
    assert.strictEqual(isSafeSquare(48), true);
    assert.strictEqual(isSafeSquare(10), false);
  });

  it("the set matches the constants", () => {
    for (const idx of SAFE_TRACK_INDICES) {
      assert.strictEqual(typeof idx, "number");
      assert.ok(idx >= 0);
      assert.ok(idx < TRACK_LENGTH);
    }
  });

  it("track entry index mapping", () => {
    assert.strictEqual(colorEntryIndex("red"), 0);
    assert.strictEqual(colorEntryIndex("yellow"), 13);
    assert.strictEqual(colorEntryIndex("green"), 26);
    assert.strictEqual(colorEntryIndex("blue"), 39);
  });

  it("home column is 6 steps, finished after last", () => {
    assert.strictEqual(HOME_COLUMN_LENGTH, 6);
  });
});

describe("Captures", () => {
  it("moving onto an opponent's non-safe track square captures it", () => {
    const engine = seedEngine({
      [pid("red", 0)]: { kind: "track", index: 10 },
      [pid("yellow", 0)]: { kind: "track", index: 15 },
    }, () => 5);
    const events = applyMove(engine, 0, pid("red", 0), 5);
    const moved = events.find((e) => e.type === "moved");
    const captured = events.find((e) => e.type === "captured");
    assert.ok(moved);
    assert.ok(captured);
    assert.ok(captured!.capturedPieceId.includes("yellow"));
    bothWays(engine.state.pieces.get(pid("yellow", 0)), { kind: "home" });
  });

  it("moving onto a safe square does not capture", () => {
    const engine = seedEngine({
      [pid("red", 0)]: { kind: "track", index: 6 },
      [pid("yellow", 0)]: { kind: "track", index: 6 },
    }, () => 6);
    const events = applyMove(engine, 0, pid("red", 0), 6);
    assert.ok(!events.find((e) => e.type === "captured"));
  });

  it("cannot capture your own pieces", () => {
    const engine = seedEngine({
      [pid("red", 0)]: { kind: "track", index: 10 },
      [pid("red", 1)]: { kind: "track", index: 15 },
    }, () => 5);
    const events = applyMove(engine, 0, pid("red", 0), 5);
    assert.ok(!events.find((e) => e.type === "captured"));
  });

  it("cannot capture a finished piece", () => {
    const engine = seedEngine({
      [pid("red", 0)]: { kind: "track", index: 10 },
      [pid("yellow", 0)]: { kind: "finished" },
    }, () => 5);
    const events = applyMove(engine, 0, pid("red", 0), 5);
    assert.ok(!events.find((e) => e.type === "captured"));
  });

  it("cannot capture a piece still at home", () => {
    const engine = seedEngine({
      [pid("red", 0)]: { kind: "track", index: 10 },
      [pid("yellow", 0)]: { kind: "home" },
    }, () => 5);
    const events = applyMove(engine, 0, pid("red", 0), 5);
    assert.ok(!events.find((e) => e.type === "captured"));
  });

  it("no capture occurs when landing in the home column", () => {
    const engine = seedEngine({
      [pid("red", 0)]: { kind: "track", index: 49 },
      [pid("yellow", 0)]: { kind: "homeColumn", index: 0 },
    }, () => 3);
    const events = applyMove(engine, 0, pid("red", 0), 3);
    assert.ok(events.find((e) => e.type === "moved"));
    assert.ok(!events.find((e) => e.type === "captured"));
    bothWays(engine.state.pieces.get(pid("red", 0)), { kind: "homeColumn", index: 0 });
  });
});

describe("Home entry and winning", () => {
  it("entering home emits enteredHome event", () => {
    const engine = seedEngine({ [pid("red", 0)]: { kind: "homeColumn", index: 5 } }, () => 1);
    const events = applyMove(engine, 0, pid("red", 0), 1);
    assert.ok(events.find((e) => e.type === "enteredHome"));
  });

  it("a piece that finishes is marked finished", () => {
    const engine = seedEngine({
      [pid("red", 0)]: { kind: "homeColumn", index: 5 },
      [pid("red", 1)]: { kind: "finished" },
      [pid("red", 2)]: { kind: "finished" },
      [pid("red", 3)]: { kind: "finished" },
    }, () => 1);
    applyMove(engine, 0, pid("red", 0), 1);
    bothWays(engine.state.pieces.get(pid("red", 0)), { kind: "finished" });
  });

  it("winning emits finished from applyMove", () => {
    const engine = seedEngine({
      [pid("red", 0)]: { kind: "homeColumn", index: 5 },
      [pid("red", 1)]: { kind: "finished" },
      [pid("red", 2)]: { kind: "finished" },
      [pid("red", 3)]: { kind: "finished" },
    }, () => 1);
    const events = applyMove(engine, 0, pid("red", 0), 1);
    assert.ok(events.find((e) => e.type === "finished"));
  });

  it("winning via executeTurn also advances the turn", () => {
    const engine = seedEngine({
      [pid("red", 0)]: { kind: "homeColumn", index: 5 },
      [pid("red", 1)]: { kind: "finished" },
      [pid("red", 2)]: { kind: "finished" },
      [pid("red", 3)]: { kind: "finished" },
    }, () => 1);
    rollDice(engine, 0);
    const { events, nextSeat } = executeTurn(engine, 0, pid("red", 0));
    assert.ok(events.find((e) => e.type === "finished"));
    assert.strictEqual(events.find((e) => e.type === "turnChanged")?.nextSeat, 1);
    assert.strictEqual(nextSeat, 1);
  });
});

describe("Dice and turn flow", () => {
  it("rollDice locks the dice and returns the value", () => {
    const engine = seedEngine({}, () => 4);
    const { events, value } = rollDice(engine, 0);
    assert.strictEqual(value, 4);
    bothWays(events, [{ type: "rolled", playerSeat: 0, value: 4 }]);
    assert.strictEqual(engine.state.dice, 4);
    assert.strictEqual(engine.state.diceLock, true);
  });

  it("cannot roll twice while locked", () => {
    const engine = seedEngine({}, () => 4);
    rollDice(engine, 0);
    assert.throws(() => rollDice(engine, 0), /already locked/i);
  });

  it("executeTurn with no legal move simply passes the turn", () => {
    const dice = () => 1;
    const engine = seedEngine({}, dice);
    rollDice(engine, 0);
    const { events, nextSeat } = executeTurn(engine, 0, null);
    assert.strictEqual(events.find((e) => e.type === "turnChanged")?.nextSeat, 1);
    assert.strictEqual(nextSeat, 1);
    assert.strictEqual(engine.state.currentPlayerSeat, 1);
  });

  it("executeTurn applies a chosen legal move and advances turn", () => {
    const dice = () => 6;
    const engine = seedEngine({}, dice);
    rollDice(engine, 0);
    const moves = legalMoves(engine, 0, 6);
    assert.ok(moves.length > 0);
    const { events, nextSeat } = executeTurn(engine, 0, moves[0].pieceId);
    assert.ok(events.find((e) => e.type === "moved"));
    assert.strictEqual(events.find((e) => e.type === "turnChanged")?.nextSeat, 1);
    assert.strictEqual(nextSeat, 1);
  });

  it("executeTurn ends the turn and clears the dice lock", () => {
    const dice = () => 3;
    const engine = seedEngine({}, dice);
    rollDice(engine, 0);
    executeTurn(engine, 0, null);
    assert.strictEqual(engine.state.dice, null);
    assert.strictEqual(engine.state.diceLock, false);
  });
});

describe("CPU difficulty behavior", () => {
  it("easy picks a random legal move", () => {
    const dice = () => 5;
    const engine = seedEngine({
      [pid("red", 0)]: { kind: "track", index: 10 },
      [pid("red", 1)]: { kind: "track", index: 20 },
    }, dice);
    rollDice(engine, 0);
    const result = chooseCPUMove(engine, 0, "easy");
    assert.strictEqual(result.move, 5);
    assert.ok(result.pieceId.startsWith("red-"));
    assert.strictEqual(result.reason, "rolled");
  });

  it("easy returns noLegalMove when no moves exist", () => {
    const dice = () => 1;
    const engine = seedEngine({}, dice);
    rollDice(engine, 0);
    const result = chooseCPUMove(engine, 0, "easy");
    assert.strictEqual(result.move, 0);
    assert.strictEqual(result.reason, "noLegalMove");
  });

  it("medium prefers captures over safe squares and progress", () => {
    const dice = () => 5;
    const engine = seedEngine({
      [pid("red", 0)]: { kind: "track", index: 10 },
      [pid("yellow", 0)]: { kind: "track", index: 15 },
      [pid("red", 1)]: { kind: "track", index: 20 },
    }, dice);
    rollDice(engine, 0);
    const result = chooseCPUMove(engine, 0, "medium");
    assert.strictEqual(result.move, 5);
    assert.ok(result.pieceId.includes("red"));
    assert.strictEqual(result.reason, "captured");
  });

  it("medium picks a safe square when no capture is available", () => {
    const dice = () => 2;
    const engine = seedEngine({
      [pid("red", 0)]: { kind: "track", index: 4 },
      [pid("red", 1)]: { kind: "track", index: 12 },
    }, dice);
    rollDice(engine, 0);
    const result = chooseCPUMove(engine, 0, "medium");
    assert.strictEqual(result.move, 2);
    assert.ok(result.pieceId.includes("red-0"));
    assert.strictEqual(result.reason, "safe");
  });

  it("hard values captures highest and can block opponents", () => {
    const dice = () => 5;
    const engine = seedEngine({
      [pid("red", 0)]: { kind: "track", index: 10 },
      [pid("yellow", 0)]: { kind: "track", index: 15 },
    }, dice);
    rollDice(engine, 0);
    const result = chooseCPUMove(engine, 0, "hard");
    assert.strictEqual(result.move, 5);
    assert.strictEqual(result.reason, "captured");
  });

  it("hard chooses progress when no capture or safe target exists", () => {
    const dice = () => 2;
    const engine = seedEngine({
      [pid("red", 0)]: { kind: "track", index: 1 },
    }, dice);
    rollDice(engine, 0);
    const result = chooseCPUMove(engine, 0, "hard");
    assert.strictEqual(result.move, 2);
    assert.strictEqual(result.reason, "progress");
  });

  it("hard can block an opponent one step from a square it can occupy", () => {
    const dice = () => 2;
    const engine = seedEngine({
      [pid("red", 0)]: { kind: "track", index: 49 },
      [pid("yellow", 0)]: { kind: "track", index: 50 },
    }, dice);
    rollDice(engine, 0);
    const result = chooseCPUMove(engine, 0, "hard");
    assert.strictEqual(result.move, 2);
    assert.ok(result.pieceId.includes("red-0"));
    assert.strictEqual(result.reason, "blockedOpponent");
  });

  it("hard prefers entering home over progress", () => {
    const dice = () => 1;
    const engine = seedEngine({
      [pid("red", 0)]: { kind: "homeColumn", index: 5 },
      [pid("red", 1)]: { kind: "track", index: 1 },
    }, dice);
    rollDice(engine, 0);
    const result = chooseCPUMove(engine, 0, "hard");
    assert.strictEqual(result.move, 1);
    assert.strictEqual(result.reason, "rolled");
  });
});
