"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.COLORS = void 0;
exports.makePieceId = makePieceId;
exports.COLORS = ["red", "yellow", "green", "blue"];
function makePieceId(color, index) {
    return "".concat(color, "-").concat(index);
}
