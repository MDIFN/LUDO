import React, { useEffect, useState, useRef, useCallback, useContext, createContext } from "react";
import { io, Socket } from "socket.io-client";
import { Color, Player, Room, Position } from "./client-types";
import { trackPosition, homeColumnPosition, finishedPosition, colorCenter, colorAngle, TRACK_LENGTH, HOME_COLUMN_LENGTH, HOME_COLUMN_RADIUS, SAFE_TRACK_INDICES, isSafeSquare } from "./board-geo";
import { createHost, AudioHost } from "./audio";

export const EMOTICONS = ["😀", "😂", "😍", "😎", "🥳", "👍", "🔥", "💜", "🎉", "👏", "🙌", "🤔", "😢", "😡"];
export const COLORS: Color[] = ["red", "yellow", "green", "blue"];
const BASE_URL = "http://localhost:3000";

interface AudioCtxValue {
  host: AudioHost | null;
  muted: boolean;
  setMuted: (m: boolean) => void;
}
const AudioCtx = createContext<AudioCtxValue>({ host: null, muted: false, setMuted: () => {} });

function useAudio() {
  return useContext(AudioCtx);
}

function pidColor(pid: string): Color {
  return (pid.split("-")[0] as Color) || "red";
}

function GameBoard({ pieces, size }: { pieces: Map<string, Position>; size: number }) {
  const clamped = Math.min(Math.max(window.innerWidth - 48, 280), window.innerHeight - 360, size);
  const scale = clamped / size;
  const half = size / 2;

  return (
    <div className="board-stage" style={{ width: size * scale, height: size * scale, transform: `scale(${1 / scale})`, transformOrigin: "top left", position: "relative", left: "50%", top: "50%", marginLeft: -half, marginTop: -half }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <BoardPath size={size} />
        <HomeColumns size={size} />
        <HomeBases size={size} pieces={pieces} />
        <Pieces size={size} pieces={pieces} />
      </svg>
    </div>
  );
}

function BoardPath({ size }: { size: number }) {
  const r = size / 2 - 30;
  const d = Array.from({ length: TRACK_LENGTH }, (_, i) => {
    const angle = (i / TRACK_LENGTH) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(angle) * r + size / 2;
    const y = Math.sin(angle) * r + size / 2;
    return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ");
  return <path d={d} fill="none" stroke="#334155" strokeWidth="6" strokeLinejoin="round" />;
}

function HomeColumns({ size }: { size: number }) {
  return (
    <>
      {COLORS.map((c) => {
        const center = colorCenter(c);
        const cx = center.x + size / 2;
        const cy = center.y + size / 2;
        const angle = colorAngle(c);
        return (
          <g key={c}>
            <circle cx={cx} cy={cy} r={HOME_COLUMN_RADIUS} fill="#0f172a" stroke="#475569" strokeWidth="3" />
            {Array.from({ length: HOME_COLUMN_LENGTH }, (_, k) => {
              const pos = homeColumnPosition(k, c);
              return <circle key={k} cx={pos.x + size / 2} cy={pos.y + size / 2} r={9} fill="#1e293b" stroke="#334155" strokeWidth="1.5" />;
            })}
          </g>
        );
      })}
    </>
  );
}

function HomeBases({ size, pieces }: { size: number; pieces: Map<string, Position> }) {
  return (
    <>
      {COLORS.map((c) => {
        const center = colorCenter(c);
        const cx = center.x + size / 2;
        const cy = center.y + size / 2;
        const members: string[] = [];
        for (let i = 0; i < 4; i++) {
          const pid = `${c}-${i}`;
          const p = pieces.get(pid);
          if (!p || p.kind === "home") members.push(pid);
        }
        const count = members.length;
        return (
          <g key={c}>
            <circle cx={cx} cy={cy} r={22} fill={c} fillOpacity={0.15} stroke={c} strokeWidth={2.5} />
            {members.map((pid, i) => {
              const t = count > 0 ? i / count : 0;
              const angle = t * Math.PI * 2 - Math.PI / 2;
              const r = 11;
              const x = cx + Math.cos(angle) * r;
              const y = cy + Math.sin(angle) * r;
              return <circle key={pid} cx={x} cy={y} r={9} fill={c} stroke="#000" strokeWidth="1.5" />;
            })}
          </g>
        );
      })}
    </>
  );
}

function Pieces({ size, pieces }: { size: number; pieces: Map<string, Position> }) {
  const renderOne = (id: string, pos: Position) => {
    const color = pidColor(id);
    let cx = 0, cy = 0;
    if (pos.kind === "home") {
      const center = colorCenter(color);
      cx = center.x + size / 2;
      cy = center.y + size / 2;
    } else if (pos.kind === "track") {
      const idx = pos.index ?? 0;
      const p = trackPosition(idx, color);
      cx = p.x + size / 2;
      cy = p.y + size / 2;
    } else if (pos.kind === "homeColumn") {
      const idx = pos.index ?? 0;
      const p = homeColumnPosition(idx, color);
      cx = p.x + size / 2;
      cy = p.y + size / 2;
    } else if (pos.kind === "finished") {
      const p = finishedPosition(color);
      cx = p.x + size / 2;
      cy = p.y + size / 2;
    }
    const isSafe = pos.kind === "track" && isSafeSquare(pos.index ?? 0);
    const isFinished = pos.kind === "finished";
    const stroke = isSafe ? "#facc15" : isFinished ? "#22c55e" : "#000";
    const sw = isSafe || isFinished ? 3 : 1.5;
    return (
      <g key={id} transform={`translate(${cx} ${cy})`}>
        <circle r={11} fill={color} stroke={stroke} strokeWidth={sw} />
        <text y={3.5} textAnchor="middle" fontSize={10} fill="#fff" fontWeight="700" fontFamily="system-ui">{id.split("-")[1]}</text>
      </g>
    );
  };

  const items: Array<[string, Position]> = [];
  COLORS.forEach((c) => {
    for (let i = 0; i < 4; i++) {
      const id = `${c}-${i}`;
      const pos = pieces.get(id);
      if (pos) items.push([id, pos]);
    }
  });
  return <>{items.map(([id, pos]) => renderOne(id, pos))}</>;
}

function TurnPill({ seat, mySeat, color }: { seat: number | null; mySeat: number | null; color: string | null }) {
  if (seat === null) return <div className="turn-pill"><span className="turn-name muted">No active player</span></div>;
  const isMe = mySeat !== null && seat === mySeat;
  const name = isMe ? "Your turn" : `Player ${seat + 1}'s turn`;
  return (
    <div className={`turn-pill ${isMe ? "active" : ""}`}>
      <span className="turn-dot" style={{ background: color ?? "#64748b" }} />
      <span className="turn-name">{name}</span>
    </div>
  );
}

function SpectatorView({ room, socket, serverUrl, onGameOver }: {
  room: Room; socket: Socket; serverUrl: string; onGameOver: () => void;
}) {
  const [pieces, setPieces] = useState<Map<string, Position>>(new Map());
  const [currentSeat, setCurrentSeat] = useState<number | null>(null);
  const [dice, setDice] = useState<number | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [winnerIds, setWinnerIds] = useState<string[]>([]);
  const [emoticons, setEmoticons] = useState<Map<number, string>>(new Map());
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    const s = socket;
    s.on("game-state", (snapshot: any) => {
      if (snapshot?.pieces) {
        const m = new Map<string, Position>();
        for (const [k, v] of Object.entries(snapshot.pieces)) {
          m.set(k, v as Position);
        }
        setPieces(m);
        setCurrentSeat(snapshot.currentPlayerSeat);
        setDice(snapshot.dice);
        setGameOver(!!snapshot.finished);
        setWinnerIds(snapshot.winnerIds ?? []);
      }
    });
    s.on("emoticon", (e: any) => {
      setEmoticons((prev) => new Map(prev).set(e.seat, e.emoticon));
      setTimeout(() => setEmoticons((prev) => { const m = new Map(prev); m.delete(e.seat); return m; }), 2200);
    });
    s.on("game-over", () => { onGameOver(); });
    return () => {
      s.off("game-state");
      s.off("emoticon");
      s.off("game-over");
    };
  }, [socket, onGameOver]);

  const sendEmoticon = (emoji: string) => {
    socket.emit("send-emoticon", emoji);
    setShowPicker(false);
  };

  return (
    <div className="spectator-wrap">
      <RoomHeader room={room} />
      <SeatStrip seats={room.seats} />
      <div className="board-panel">
        <TurnPill seat={currentSeat} mySeat={null} color={null} />
        <DiceDisplay dice={dice} />
        <GameBoard pieces={pieces} size={520} />
      </div>
      <EmoticonBar emoticons={emoticons} showPicker={showPicker} setShowPicker={setShowPicker} onSend={sendEmoticon} />
    </div>
  );
}

function RoomHeader({ room }: { room: Room }) {
  return (
    <div className="room-header">
      <div className="room-code">
        <span className="label">Room</span>
        <span className="code">{room.code}</span>
        <span className="invite">Invite {room.invite}</span>
      </div>
    </div>
  );
}

function SeatStrip({ seats }: { seats: (Player | null)[] }) {
  return (
    <div className="seats-panel">
      {seats.map((p, i) => <SeatCard key={i} player={p} isMe={false} />)}
    </div>
  );
}

function SeatCard({ player, isMe }: { player: Player | null; isMe: boolean }) {
  if (!player) return <div className="seat empty">Empty seat</div>;
  return (
    <div className={`seat ${player.isCPU ? "cpu" : ""} ${isMe ? "me" : ""}`}>
      <div className="seat-head" style={{ borderColor: player.color }}>
        <span className="dot" style={{ background: player.color }} />
        <span className="name">{player.name}</span>
        {player.isCPU && <span className="cpu-tag">CPU {player.difficulty?.toUpperCase()}</span>}
      </div>
      {player.emoticon && <div className="emoticon-badge">{player.emoticon}</div>}
    </div>
  );
}

function DiceDisplay({ dice }: { dice: number | null }) {
  return dice !== null ? <div className="dice-display"><span className="dice-value">{dice}</span></div> : null;
}

function EmoticonBar({ emoticons, showPicker, setShowPicker, onSend }: {
  emoticons: Map<number, string>; showPicker: boolean; setShowPicker: (b: boolean) => void; onSend: (e: string) => void;
}) {
  return (
    <>
      <div className="emoticon-row">
        <button className="ghost small" onClick={() => setShowPicker((v) => !v)}>😊 Emoticons</button>
      </div>
      {showPicker && (
        <div className="picker">
          {EMOTICONS.map((e) => <button key={e} className="emoji" onClick={() => onSend(e)}>{e}</button>)}
        </div>
      )}
    </>
  );
}

function RoomView({ room, socket, serverUrl, mySeat, myColor }: {
  room: Room; socket: Socket; serverUrl: string; mySeat: number | null; myColor: Color | null;
}) {
  const [gameStarted, setGameStarted] = useState(room.started);
  const [gameState, setGameState] = useState<any>(null);
  const [gameOver, setGameOver] = useState(false);
  const [winnerIds, setWinnerIds] = useState<string[]>([]);
  const [, refresh] = useState(0);
  const tick = useCallback(() => refresh((n) => n + 1), []);
  const [showPicker, setShowPicker] = useState(false);
  const audio = useAudio();

  useEffect(() => {
    const s = socket;
    s.on("room-state", (r: Room) => { setGameStarted(r.started); tick(); });
    s.on("game-started", () => setGameStarted(true));
    s.on("game-state", (snapshot: any) => {
      setGameState(snapshot);
      setGameOver(!!snapshot?.finished);
      setWinnerIds(snapshot?.winnerIds ?? []);
    });
    s.on("emoticon", (e: any) => {
      tick();
    });
    s.on("game-over", () => {
      setGameOver(true);
    });
    return () => {
      s.off("room-state");
      s.off("game-started");
      s.off("game-state");
      s.off("emoticon");
      s.off("game-over");
    };
  }, [socket, tick]);

  const emit = useCallback((ev: string, data?: unknown) => socket.emit(ev, data), [socket]);

  const startGame = () => emit("start-game");
  const readyToggle = () => emit("ready-toggle");
  const sendEmoticon = (emoji: string) => {
    emit("send-emoticon", emoji);
    setShowPicker(false);
  };

  const currentSeat = gameState?.currentPlayerSeat ?? null;
  const dice = gameState?.dice ?? null;
  const pieces = new Map<string, Position>();
  if (gameState?.pieces) {
    for (const [k, v] of Object.entries(gameState.pieces)) pieces.set(k, v as Position);
  }

  const myPieceIds = myColor ? [0, 1, 2, 3].map((i) => `${myColor}-${i}`) : [];
  const canRoll = currentSeat === mySeat && dice === null && gameStarted && !gameOver;
  const movesAvailable = myPieceIds.some((id) => {
    const pos = pieces.get(id);
    if (!pos || pos.kind === "finished") return false;
    if (pos.kind === "home") return dice === 6;
    if (pos.kind === "track") {
      const raw = (pos.index ?? 0) + (dice ?? 0);
      if (raw >= TRACK_LENGTH) {
        const steps = raw - TRACK_LENGTH;
        return steps < HOME_COLUMN_LENGTH;
      }
      return true;
    }
    if (pos.kind === "homeColumn") return (HOME_COLUMN_LENGTH - (pos.index ?? 0)) === dice;
    return false;
  });

function canMoveTrack(pos: Position, diceVal: number | null): boolean {
  if (diceVal === null) return false;
  const idx = pos.index ?? 0;
  const raw = idx + diceVal;
  if (raw >= TRACK_LENGTH) {
    const steps = raw - TRACK_LENGTH;
    return steps < HOME_COLUMN_LENGTH;
  }
  return true;
}

function canMoveHomeColumn(pos: Position, diceVal: number | null): boolean {
  if (diceVal === null) return false;
  const idx = pos.index ?? 0;
  return (HOME_COLUMN_LENGTH - idx) === diceVal;
}

  return (
    <div className="room-wrap">
      <RoomHeader room={room} />
      <SeatStrip seats={room.seats} />
      <div className="row">            <button className="primary" onClick={startGame} disabled={Boolean(gameStarted || room.seats.filter((s: Player | null) => s !== null).length === 0)}>
          {gameStarted ? "Game in progress" : room.seats.some((s) => s !== null) ? "Start game" : "Add players to start"}
        </button>
        <button className="ghost small" onClick={() => socket.emit("leave-room")}>Leave</button>
      </div>

      {gameStarted && (
        <div className="board-panel">
          <div className="turn-row">
            <TurnPill seat={currentSeat} mySeat={mySeat} color={myColor ?? null} />
            <button className="dice-btn" onClick={() => { if (canRoll) { emit("roll-dice"); audio.host?.playDice(); if ("vibrate" in navigator) navigator.vibrate(12); } }} disabled={!canRoll}>
              {dice !== null ? <span>🎲 {dice}</span> : <span>🎲 Roll</span>}
            </button>
          </div>

          {dice !== null && currentSeat === mySeat && movesAvailable && (
            <div className="move-row">
              {myPieceIds.map((id) => {
                const pos = pieces.get(id);
                const idx = pos?.index;
                const movable = pos && pos.kind !== "finished" && (
                  (pos.kind === "home" && dice === 6) ||
                  (pos.kind === "track" && canMoveTrack(pos, dice)) ||
                  (pos.kind === "homeColumn" && canMoveHomeColumn(pos, dice))
                );
                return (
                  <button key={id} className={`piece-btn ${movable ? "movable" : ""}`} disabled={!movable} onClick={() => { if (movable) { const encoded = Buffer.from(id, "utf8").toString("base64url"); emit("make-move", encoded); audio.host?.playMove(); if ("vibrate" in navigator) navigator.vibrate(8); } }}>
                    {id.split("-")[1]}
                  </button>
                );
              })}
            </div>
          )}

          <GameBoard pieces={pieces} size={520} />

          {gameOver && (
            <div className="game-over">
              {winnerIds.length > 0 ? `Winners: ${winnerIds.join(", ")}` : "Game over"}
              <button className="ghost small" onClick={() => socket.emit("leave-room")} style={{ marginLeft: 10 }}>Leave room</button>
            </div>
          )}
        </div>
      )}

      {!gameStarted && (
        <div className="row">
          <button className="ghost small" onClick={() => socket.emit("leave-room")}>Cancel</button>
        </div>
      )}

      <div className="emoticon-row">
        <button className="ghost small" onClick={() => setShowPicker((v) => !v)}>😊 Emoticons</button>
        <button className="ghost small" onClick={() => readyToggle()}>{room.seats[mySeat!]?.ready ? "Ready ✓" : "Ready"}</button>
      </div>

      {showPicker && (
        <div className="picker">
          {EMOTICONS.map((e) => <button key={e} className="emoji" onClick={() => sendEmoticon(e)}>{e}</button>)}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [view, setView] = useState<"home" | "room" | "spectator">("home");
  const [name, setName] = useState("");
  const [serverUrl, setServerUrl] = useState(BASE_URL);
  const [code, setCode] = useState("");

  return (
    <AudioCtx.Provider value={{
      host: null,
      muted: false,
      setMuted: () => {},
    }}>
      <div className="app">
        <HomeScreen name={name} setName={setName} serverUrl={serverUrl} setServerUrl={setServerUrl} code={code} setCode={setCode} onCreate={() => createRoom(serverUrl, name, setView)} onJoin={() => joinRoom(serverUrl, code, name, setView)} />
      </div>
    </AudioCtx.Provider>
  );
}

function HomeScreen({ name, setName, serverUrl, setServerUrl, code, setCode, onCreate, onJoin }: {
  name: string; setName: (n: string) => void; serverUrl: string; setServerUrl: (u: string) => void; code: string; setCode: (c: string) => void; onCreate: () => void; onJoin: () => void;
}) {
  return (
    <div className="home">
      <h1 className="title">Ludo</h1>
      <p className="sub">Create a room or join one with a code.</p>
      <div className="field">
        <input className="input" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <input className="input" placeholder="Server URL" value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} />
      </div>
      <div className="actions">
        <button className="primary" onClick={onCreate}>Create room</button>
      </div>
      <div className="divider" />
      <div className="field">
        <input className="input" placeholder="Room code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
      </div>
      <div className="actions">
        <button className="primary" onClick={onJoin}>Join room</button>
      </div>
    </div>
  );
}

function createRoom(serverUrl: string, name: string, setView: (v: "room" | "spectator") => void) {
  const s = io(serverUrl, { transports: ["websocket", "polling"], reconnection: false });
  s.emit("create-room", name.trim() || "Player");
  s.on("room-created", (payload: any) => {
    setView("room");
  });
  s.on("error", (err: any) => alert(err?.message));
}

function joinRoom(serverUrl: string, code: string, name: string, setView: (v: "room" | "spectator") => void) {
  const s = io(serverUrl, { transports: ["websocket", "polling"], reconnection: false });
  s.emit("join-room", code, name.trim() || "Player");
  s.on("room-joined", () => setView("room"));
  s.on("joined-spectator", () => setView("spectator"));
  s.on("error", (err: any) => alert(err?.message));
}
