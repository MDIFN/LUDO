export type Color = "red" | "yellow" | "green" | "blue";

export const COLORS: Color[] = ["red", "yellow", "green", "blue"];

export type PieceState =
  | { kind: "home" }
  | { kind: "track"; index: number }
  | { kind: "homeColumn"; index: number }
  | { kind: "finished" };

export type Player = {
  id: string;
  name: string;
  color: Color;
  seat: number;
  isCPU: boolean;
  difficulty?: "easy" | "medium" | "hard";
  ready: boolean;
  emoticon: string | null;
};

export type Room = {
  id: string;
  code: string;
  invite: number;
  seats: (Player | null)[];
  spectators: string[];
  started: boolean;
  winnerIds: string[];
  createdAt: number;
};

export type GameState = {
  roomId: string;
  pieces: Map<string, PieceState>;
  currentPlayerSeat: number | null;
  dice: number | null;
  diceLock: boolean;
  turnStartTime: number;
  finished: boolean;
  winnerIds: string[];
  lastMove: MoveEvent | null;
  spectators: string[];
  turnNumber: number;
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

export type PositionLike =
  | { kind: "track"; index: number }
  | { kind: "homeColumn"; index: number }
  | { kind: "home" }
  | { kind: "finished" };

export type CPUResult = {
  pieceId: string;
  move: number;
  reason: "blocked" | "noLegalMove" | "rolled" | "captured" | "safe" | "progress" | "blockedOpponent";
};

export type JoinMode = "create" | "join";

export type PublicRoom = Omit<Room, "spectators"> & { spectatorCount: number };

export function makePieceId(color: Color, index: number): string {
  return `${color}-${index}`;
}
