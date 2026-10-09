export const TRACK_LENGTH = 52;
export const HOME_COLUMN_LENGTH = 6;
export const TRACK_RADIUS = 150;
export const HOME_COLUMN_RADIUS = 60;

export const SAFE_TRACK_INDICES = new Set([6, 13, 20, 27, 34, 41, 48]);

export function isSafeSquare(index: number): boolean {
  return SAFE_TRACK_INDICES.has(index);
}

export function trackPosition(index: number, color: "red" | "yellow" | "green" | "blue"): { x: number; y: number } {
  const entryOffset = color === "red" ? 0 : color === "yellow" ? 13 : color === "green" ? 26 : 39;
  const i = (index + entryOffset) % TRACK_LENGTH;
  const angle = (i / TRACK_LENGTH) * Math.PI * 2 - Math.PI / 2;
  return {
    x: Math.cos(angle) * TRACK_RADIUS,
    y: Math.sin(angle) * TRACK_RADIUS,
  };
}

export function homeColumnPosition(index: number, color: "red" | "yellow" | "green" | "blue"): { x: number; y: number } {
  const center = colorCenter(color);
  const angle = colorAngle(color);
  const dist = HOME_COLUMN_RADIUS + index * 16;
  return {
    x: center.x + Math.cos(angle) * dist,
    y: center.y + Math.sin(angle) * dist,
  };
}

export function finishedPosition(color: "red" | "yellow" | "green" | "blue"): { x: number; y: number } {
  const center = colorCenter(color);
  const angle = colorAngle(color);
  const dist = HOME_COLUMN_RADIUS + HOME_COLUMN_LENGTH * 16;
  return {
    x: center.x + Math.cos(angle) * dist,
    y: center.y + Math.sin(angle) * dist,
  };
}

export function colorCenter(color: "red" | "yellow" | "green" | "blue"): { x: number; y: number } {
  const angle = colorAngle(color);
  return {
    x: Math.cos(angle) * (TRACK_RADIUS - 20),
    y: Math.sin(angle) * (TRACK_RADIUS - 20),
  };
}

export function colorAngle(color: "red" | "yellow" | "green" | "blue"): number {
  return color === "red" ? -Math.PI / 4 : color === "yellow" ? Math.PI / 4 : color === "green" ? 3 * Math.PI / 4 : -3 * Math.PI / 4;
}
