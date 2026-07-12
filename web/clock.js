/**
 * Dual chess clock driven by notation / side-to-move — no manual clock button.
 */

export const CLOCK_MODES = {
  live: {
    label: 'Live',
    description: 'Clock follows each completed move. Keeps running while you type.',
  },
  notation: {
    label: 'Notation pause',
    description: 'Pauses while typing. Move numbers (1. 2. 3.) press the clock; you can edit until the next number.',
  },
};

export const CLOCK_PRESETS = {
  '1|0': { label: '1+0 Bullet', baseMs: 60_000, incrementMs: 0 },
  '3|0': { label: '3+0 Blitz', baseMs: 180_000, incrementMs: 0 },
  '3|2': { label: '3+2 Blitz', baseMs: 180_000, incrementMs: 2_000 },
  '5|0': { label: '5+0 Blitz', baseMs: 300_000, incrementMs: 0 },
  '5|3': { label: '5+3 Blitz', baseMs: 300_000, incrementMs: 3_000 },
  '10|0': { label: '10+0 Rapid', baseMs: 600_000, incrementMs: 0 },
  '10|5': { label: '10+5 Rapid', baseMs: 600_000, incrementMs: 5_000 },
  '15|10': { label: '15+10 Rapid', baseMs: 900_000, incrementMs: 10_000 },
  '30|0': { label: '30+0 Classical', baseMs: 1_800_000, incrementMs: 0 },
};

function pad(value) {
  return String(value).padStart(2, '0');
}

export function formatClockMs(ms) {
  const clamped = Math.max(0, Math.ceil(ms));
  const totalSeconds = Math.floor(clamped / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const tenths = Math.floor((clamped % 1000) / 100);

  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  if (totalSeconds < 10) {
    return `${minutes}:${pad(seconds)}.${tenths}`;
  }
  return `${minutes}:${pad(seconds)}`;
}

export class ChessClock {
  constructor({
    baseMs = 600_000,
    incrementMs = 0,
    mode = 'live',
    onUpdate = () => {},
    onFlag = () => {},
  } = {}) {
    this.baseMs = baseMs;
    this.incrementMs = incrementMs;
    this.mode = CLOCK_MODES[mode] ? mode : 'live';
    this.onUpdate = onUpdate;
    this.onFlag = onFlag;
    this.times = { white: baseMs, black: baseMs };
    this.active = null;
    this.running = false;
    this.typingPaused = false;
    this.flagged = null;
    this.lastFrame = null;
    this.rafId = null;
  }

  snapshot() {
    return {
      mode: this.mode,
      baseMs: this.baseMs,
      incrementMs: this.incrementMs,
      times: { ...this.times },
      active: this.active,
      running: this.running && !this.typingPaused && !this.flagged,
      typingPaused: this.typingPaused,
      flagged: this.flagged,
      display: {
        white: formatClockMs(this.times.white),
        black: formatClockMs(this.times.black),
      },
    };
  }

  emit() {
    this.onUpdate(this.snapshot());
  }

  configure({ baseMs, incrementMs, mode } = {}) {
    if (baseMs != null) {
      this.baseMs = Math.max(1_000, Number(baseMs) || this.baseMs);
    }
    if (incrementMs != null) {
      this.incrementMs = Math.max(0, Number(incrementMs) || 0);
    }
    if (mode && CLOCK_MODES[mode]) {
      this.mode = mode;
    }
    this.reset();
  }

  reset() {
    this.stopLoop();
    this.times = { white: this.baseMs, black: this.baseMs };
    this.active = null;
    this.running = false;
    this.typingPaused = false;
    this.flagged = null;
    this.lastFrame = null;
    this.emit();
  }

  stopLoop() {
    if (this.rafId != null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.lastFrame = null;
  }

  startLoop() {
    if (this.rafId != null) {
      return;
    }
    if (typeof requestAnimationFrame !== 'function') {
      return;
    }
    this.lastFrame = performance.now();
    const frame = (now) => {
      this.rafId = requestAnimationFrame(frame);
      this.tick(now);
    };
    this.rafId = requestAnimationFrame(frame);
  }

  isTicking() {
    return Boolean(
      this.running
      && this.active
      && !this.typingPaused
      && !this.flagged,
    );
  }

  tick(now = performance.now()) {
    if (!this.isTicking()) {
      this.lastFrame = now;
      return;
    }

    const elapsed = now - (this.lastFrame ?? now);
    this.lastFrame = now;
    if (elapsed <= 0) {
      return;
    }

    this.times[this.active] -= elapsed;
    if (this.times[this.active] <= 0) {
      this.times[this.active] = 0;
      this.flagged = this.active;
      this.running = false;
      this.stopLoop();
      this.emit();
      this.onFlag(this.flagged);
      return;
    }

    this.emit();
  }

  ensureRunning() {
    if (this.flagged || !this.active) {
      return;
    }
    this.running = true;
    this.startLoop();
    this.emit();
  }

  pause() {
    this.running = false;
    this.stopLoop();
    this.emit();
  }

  setTypingPaused(paused) {
    if (this.mode !== 'notation') {
      this.typingPaused = false;
      return;
    }
    const next = Boolean(paused);
    if (next === this.typingPaused) {
      return;
    }
    this.typingPaused = next;
    if (next) {
      this.stopLoop();
    } else if (this.running && this.active && !this.flagged) {
      this.startLoop();
    }
    this.emit();
  }

  /**
   * Hard clock press from notation (move number). Awards increment to the
   * player who just finished, then starts `nextSide`.
   */
  press(nextSide) {
    if (this.flagged) {
      return;
    }
    const side = nextSide === 'black' ? 'black' : 'white';
    if (this.active && this.active !== side && this.incrementMs > 0) {
      this.times[this.active] += this.incrementMs;
    }
    this.active = side;
    this.running = true;
    this.typingPaused = this.mode === 'notation' ? this.typingPaused : false;
    if (!this.typingPaused) {
      this.startLoop();
    }
    this.emit();
  }

  /**
   * Soft handoff used when the board turn changes without a move-number press
   * (e.g. Black to move after White's SAN). No increment.
   */
  setActive(side, { start = true } = {}) {
    if (this.flagged) {
      return;
    }
    const next = side === 'black' ? 'black' : 'white';
    if (this.active === next && this.running === start) {
      this.emit();
      return;
    }
    this.active = next;
    this.running = Boolean(start);
    if (this.running && !this.typingPaused) {
      this.startLoop();
    } else {
      this.stopLoop();
    }
    this.emit();
  }

  /**
   * Live mode: after a completed half-move, charge the mover's increment and
   * hand the clock to `nextSide`.
   */
  afterMove(nextSide) {
    if (this.mode !== 'live' || this.flagged) {
      return;
    }
    this.press(nextSide);
  }
}
