"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FINISHED_INDEX = exports.SAFE_TRACK_INDICES = exports.HOME_COLUMN_LENGTH = exports.TRACK_LENGTH = void 0;
exports.isSafeSquare = isSafeSquare;
exports.colorEntryIndex = colorEntryIndex;
exports.colorHomeColumnStartIndex = colorHomeColumnStartIndex;
exports.resolvePosition = resolvePosition;
exports.TRACK_LENGTH = 52;
exports.HOME_COLUMN_LENGTH = 6;
exports.SAFE_TRACK_INDICES = new Set([6, 13, 20, 27, 34, 41, 48]);
exports.FINISHED_INDEX = 57;
function isSafeSquare(trackIndex) {
    return exports.SAFE_TRACK_INDICES.has(trackIndex);
}
function colorEntryIndex(color) {
    return color === "red" ? 0 : color === "yellow" ? 13 : color === "green" ? 26 : 39;
}
function colorHomeColumnStartIndex(color) {
    return color === "red" ? 52 : color === "yellow" ? 53 : color === "green" ? 54 : 55;
}
function resolvePosition(coord) {
    if (coord.kind === "home")
        return { x: 0, y: 0 }; // fallback handled by caller
    if (coord.kind === "finished")
        return null;
    if (coord.kind === "track" && typeof coord.index === "number")
        return { x: coord.index, y: 0 };
    if (coord.kind === "homeColumn" && typeof coord.index === "number")
        return { x: coord.index, y: 0 };
    return null;
}
