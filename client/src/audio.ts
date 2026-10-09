export interface AudioHost {
  playDice: () => void;
  playMove: () => void;
  playCapture: () => void;
  playWin: () => void;
  dispose: () => void;
}

export function createHost(): AudioHost {
  let ctx: AudioContext | null = null;
  let muted = false;
  const getCtx = (): AudioContext | null => {
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      } catch {
        return null;
      }
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  };

  const play = (type: "dice" | "move" | "capture" | "win") => {
    if (muted) return;
    const c = getCtx();
    if (!c) return;
    const now = c.currentTime;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.connect(gain);
    gain.connect(c.destination);
    switch (type) {
      case "dice":
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(400, now + 0.08);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
        break;
      case "move":
        osc.type = "triangle";
        osc.frequency.setValueAtTime(500, now);
        osc.frequency.exponentialRampToValueAtTime(350, now + 0.05);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        osc.start(now);
        osc.stop(now + 0.06);
        break;
      case "capture":
        osc.type = "square";
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.15);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.start(now);
        osc.stop(now + 0.18);
        break;
      case "win":
        osc.type = "sine";
        osc.frequency.setValueAtTime(523, now);
        osc.frequency.setValueAtTime(659, now + 0.1);
        osc.frequency.setValueAtTime(784, now + 0.2);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
        break;
    }
  };

  return {
    playDice: () => play("dice"),
    playMove: () => play("move"),
    playCapture: () => play("capture"),
    playWin: () => play("win"),
    dispose: () => {
      ctx?.close().catch(() => {});
      ctx = null;
    },
  };
}
