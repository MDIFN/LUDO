export const TRACK_LENGTH = 52;
export const HOME_COLUMN_LENGTH = 6;
export const SAFE_TRACK_INDICES = new Set([6, 13, 20, 27, 34, 41, 48]);
export const FINISHED_INDEX = 57;

export function isSafeSquare(trackIndex: number): boolean {
  return SAFE_TRACK_INDICES.has(trackIndex);
}

export function colorEntryIndex(color: "red" | "yellow" | "green" | "blue"): number {
  return color === "red" ? 0 : color === "yellow" ? 13 : color === "green" ? 26 : 39;
}

export function colorHomeColumnStartIndex(color: "red" | "yellow" | "green" | "blue"): number {
  return color === "red" ? 52 : color === "yellow" ? 53 : color === "green" ? 54 : 55;
}

export function resolvePosition(coord: { kind: string; index?: number }): { x: number; y: number } | null {
  if (coord.kind === "home") return { x: 0, y: 0 }; // fallback handled by caller
  if (coord.kind === "finished") return null;
  if (coord.kind === "track" && typeof coord.index === "number") return { x: coord.index, y: 0 };
  if (coord.kind === "homeColumn" && typeof coord.index === "number") return { x: coord.index, y: 0 };
  return null;
}
