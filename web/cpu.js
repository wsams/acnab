/**
 * Browser CPU opponent powered by Stockfish.js 18 (WASM).
 * Strength uses Stockfish Skill Level and UCI_Elo for a wide rating band.
 */

const STOCKFISH_WORKER_URL = new URL(
  './vendor/stockfish/stockfish-18-lite-single.js',
  import.meta.url,
);

/**
 * Named strength presets mapped to Stockfish UCI options.
 * Elo labels are approximate; calibrated around casual/CCRL-style play.
 */
export const CPU_LEVELS = {
  beginner: {
    id: 'beginner',
    label: 'Beginner (~800)',
    description: 'Makes frequent mistakes — great for learning.',
    skillLevel: 0,
    limitStrength: false,
    elo: null,
    depth: 5,
    movetime: 250,
  },
  casual: {
    id: 'casual',
    label: 'Casual (~1000)',
    description: 'Solid basics with occasional blunders.',
    skillLevel: 3,
    limitStrength: false,
    elo: null,
    depth: 7,
    movetime: 350,
  },
  intermediate: {
    id: 'intermediate',
    label: 'Intermediate (~1200)',
    description: 'Club-adjacent play with tactical gaps.',
    skillLevel: 6,
    limitStrength: false,
    elo: null,
    depth: 9,
    movetime: 450,
  },
  club: {
    id: 'club',
    label: 'Club (~1400)',
    description: 'Stockfish strength-limited near club level.',
    skillLevel: 20,
    limitStrength: true,
    elo: 1400,
    depth: 11,
    movetime: 600,
  },
  advanced: {
    id: 'advanced',
    label: 'Advanced (~1600)',
    description: 'Strong positional sense; fewer free pieces.',
    skillLevel: 20,
    limitStrength: true,
    elo: 1600,
    depth: 12,
    movetime: 750,
  },
  expert: {
    id: 'expert',
    label: 'Expert (~1800)',
    description: 'Punishes inaccurate openings and endgames.',
    skillLevel: 20,
    limitStrength: true,
    elo: 1800,
    depth: 14,
    movetime: 900,
  },
  master: {
    id: 'master',
    label: 'Master (~2100)',
    description: 'Very strong; expects precise defense.',
    skillLevel: 20,
    limitStrength: true,
    elo: 2100,
    depth: 16,
    movetime: 1200,
  },
  grandmaster: {
    id: 'grandmaster',
    label: 'Grandmaster (~2500)',
    description: 'Near elite limited-strength Stockfish.',
    skillLevel: 20,
    limitStrength: true,
    elo: 2500,
    depth: 18,
    movetime: 1500,
  },
  maximum: {
    id: 'maximum',
    label: 'Maximum (full engine)',
    description: 'Unrestricted Stockfish lite — ruthless.',
    skillLevel: 20,
    limitStrength: false,
    elo: null,
    depth: 22,
    movetime: 2000,
  },
};

export const DEFAULT_CPU_LEVEL = 'intermediate';

export function resolveCpuLevel(id) {
  return CPU_LEVELS[id] ? id : DEFAULT_CPU_LEVEL;
}

/**
 * Fair coin toss. Returns a promise that resolves after the animation budget
 * with { face: 'heads'|'tails', humanSide: 'white'|'black' }.
 * Heads → human plays White (goes first). Tails → CPU plays White.
 */
export function tossCoinForSides({ delayMs = 1400 } = {}) {
  const face = Math.random() < 0.5 ? 'heads' : 'tails';
  const humanSide = face === 'heads' ? 'white' : 'black';
  return new Promise((resolve) => {
    window.setTimeout(() => {
      resolve({ face, humanSide, cpuSide: humanSide === 'white' ? 'black' : 'white' });
    }, delayMs);
  });
}

function parseBestMove(line) {
  // bestmove e2e4 [ponder e7e5]  |  bestmove (none)
  const text = String(line || '').trim();
  if (!text.startsWith('bestmove')) {
    return null;
  }
  const match = /^bestmove\s+([a-h][1-8][a-h][1-8][qrbn]?)/i.exec(text);
  if (!match) {
    return { none: true };
  }
  const token = match[1].toLowerCase();
  return {
    from: token.slice(0, 2),
    to: token.slice(2, 4),
    promotion: token.length > 4 ? token[4] : undefined,
  };
}

export class StockfishCpu {
  constructor() {
    this.worker = null;
    this.ready = null;
    this.pending = null;
    this.levelId = DEFAULT_CPU_LEVEL;
    this._messageHandler = null;
    this._searching = false;
  }

  async ensureReady() {
    if (this.ready) {
      return this.ready;
    }
    this.ready = this._boot();
    try {
      await this.ready;
    } catch (error) {
      this.ready = null;
      throw error;
    }
    return this.ready;
  }

  async _boot() {
    if (typeof Worker === 'undefined') {
      throw new Error('Web Workers are not available in this browser.');
    }

    const worker = new Worker(STOCKFISH_WORKER_URL);
    this.worker = worker;

    await new Promise((resolve, reject) => {
      let settled = false;
      const timeout = window.setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error('Stockfish timed out while starting.'));
        }
      }, 30_000);

      const onMessage = (event) => {
        const line = String(event.data ?? '');
        if (line === 'uciok') {
          worker.postMessage('isready');
          return;
        }
        if (line === 'readyok' && !settled) {
          settled = true;
          window.clearTimeout(timeout);
          worker.removeEventListener('message', onMessage);
          resolve();
        }
      };

      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', (event) => {
        if (!settled) {
          settled = true;
          window.clearTimeout(timeout);
          reject(event.error || new Error('Stockfish worker failed to load.'));
        }
      });
      worker.postMessage('uci');
    });

    this._messageHandler = (event) => this._onWorkerMessage(event);
    worker.addEventListener('message', this._messageHandler);
    await this._sendLevelOptions(this.levelId);
  }

  async _sendLevelOptions(levelId) {
    const id = resolveCpuLevel(levelId);
    this.levelId = id;
    const level = CPU_LEVELS[id];
    const commands = [
      `setoption name Skill Level value ${level.skillLevel}`,
      `setoption name UCI_LimitStrength value ${level.limitStrength ? 'true' : 'false'}`,
    ];
    if (level.limitStrength && level.elo != null) {
      commands.push(`setoption name UCI_Elo value ${level.elo}`);
    }
    commands.push('setoption name Hash value 64');
    commands.forEach((command) => this.worker.postMessage(command));
    await this._waitReady();
  }

  _onWorkerMessage(event) {
    const line = String(event.data ?? '');
    const best = parseBestMove(line);
    if (!best) {
      return;
    }

    this._searching = false;
    if (!this.pending) {
      return;
    }

    const { resolve, reject } = this.pending;
    this.pending = null;
    if (best.none) {
      reject(new Error('Engine returned no legal move.'));
      return;
    }
    resolve(best);
  }

  async applyLevel(levelId) {
    await this.ensureReady();
    await this._stopSearch();
    await this._sendLevelOptions(levelId);
  }

  _waitReady() {
    return new Promise((resolve, reject) => {
      const worker = this.worker;
      if (!worker) {
        reject(new Error('Stockfish is not running.'));
        return;
      }
      const onMessage = (event) => {
        if (String(event.data ?? '') === 'readyok') {
          worker.removeEventListener('message', onMessage);
          resolve();
        }
      };
      worker.addEventListener('message', onMessage);
      worker.postMessage('isready');
    });
  }

  /**
   * Stop any in-flight search and wait for bestmove (or a short timeout)
   * so a stale reply cannot satisfy the next chooseMove().
   */
  _stopSearch() {
    if (!this.worker) {
      return Promise.resolve();
    }
    if (!this.pending && !this._searching) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) {
          return;
        }
        done = true;
        this.worker.removeEventListener('message', onMessage);
        window.clearTimeout(timer);
        this._searching = false;
        if (this.pending) {
          const { reject } = this.pending;
          this.pending = null;
          reject(new Error('Search cancelled.'));
        }
        resolve();
      };
      const onMessage = (event) => {
        if (String(event.data ?? '').startsWith('bestmove')) {
          finish();
        }
      };
      const timer = window.setTimeout(finish, 200);
      this.worker.addEventListener('message', onMessage);
      this.worker.postMessage('stop');
    });
  }

  stop() {
    // Fire-and-forget cancel used by the UI; await chooseMove/_stopSearch for safety.
    if (this.worker && (this.pending || this._searching)) {
      this.worker.postMessage('stop');
    }
    this._searching = false;
    if (this.pending) {
      const { reject } = this.pending;
      this.pending = null;
      reject(new Error('Search cancelled.'));
    }
  }

  /**
   * Ask Stockfish for a move from the given FEN.
   * @returns {Promise<{from:string,to:string,promotion?:string}>}
   */
  async chooseMove(fen, { levelId } = {}) {
    if (levelId && levelId !== this.levelId) {
      await this.applyLevel(levelId);
    } else {
      await this.ensureReady();
    }

    await this._stopSearch();

    const level = CPU_LEVELS[this.levelId];
    this._searching = true;

    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
      this.worker.postMessage('ucinewgame');
      this.worker.postMessage(`position fen ${fen}`);
      this.worker.postMessage(`go depth ${level.depth} movetime ${level.movetime}`);
    });
  }

  dispose() {
    this.stop();
    if (this.worker) {
      try {
        this.worker.postMessage('quit');
      } catch {
        // ignore
      }
      try {
        this.worker.terminate();
      } catch {
        // ignore
      }
    }
    this.worker = null;
    this.ready = null;
    this.pending = null;
    this._searching = false;
  }
}
