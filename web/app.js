import {
  appendSanToMovetext,
  castlingRookMove,
  emptyGame,
  enPassantCaptureSquare,
  legalMovesFromSquare,
  moveNumberSignature,
  renderGame,
  renderLine,
  selectCpuMove,
} from './engine.js';
import {
  CLOCK_MODES,
  CLOCK_PRESETS,
  ChessClock,
} from './clock.js';
import {
  CPU_LEVELS,
  DEFAULT_CPU_LEVEL,
  StockfishCpu,
  averageHumanThinkMs,
  cpuPaceTargetMs,
  formatPaceDuration,
  normalizeHumanThinkSample,
  resolveCpuHandicap,
  resolveCpuLevel,
  resolveCpuSearch,
  sleep,
  tossCoinForSides,
} from './cpu.js';
import {
  PIECE_PALETTES,
  PIECE_SETS,
  applyPiecePalette as applyPiecePaletteVars,
  getPaletteSide,
  getPaletteSideNames,
  renderPieceSvg,
  resolvePiecePalette,
  resolvePieceSet,
} from './pieces.js';
import {
  buildShareUrl,
  decodeMovetext,
  parseShareLocation,
  writeShareHash,
} from './share.js';
import { mountLessonPortal } from './lessons.js';

const STORAGE_KEYS = {
  draft: 'acnab:draft',
  saves: 'acnab:saves',
  theme: 'acnab:theme',
  pieceSet: 'acnab:piece-set',
  piecePalette: 'acnab:piece-palette',
  flipped: 'acnab:board-flipped',
  clockPreset: 'acnab:clock-preset',
  clockMode: 'acnab:clock-mode',
  cpuLevel: 'acnab:cpu-level',
  cpuHandicap: 'acnab:cpu-handicap',
  replaySpeed: 'acnab:replay-speed',
  clickMoves: 'acnab:click-moves',
};

const DEMO_MOVES = '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 b5 5. Bxb5+ Bd7 6. Nc3 f5 7. exf5 g6 8. Qf3 gxf5 9. Qh5#';

const SLIDE_DURATION_MS = 420;
const REPLAY_SPEEDS = new Set(['1400', '950', '600']);

function resolveReplaySpeed(value) {
  const next = String(value ?? '');
  return REPLAY_SPEEDS.has(next) ? Number(next) : 950;
}

const THEMES = {
  walnut: { label: 'Walnut', scheme: 'dark' },
  ink: { label: 'Ink', scheme: 'dark' },
  midnight: { label: 'Midnight', scheme: 'dark' },
  ember: { label: 'Ember', scheme: 'dark' },
  slate: { label: 'Slate', scheme: 'dark' },
  ocean: { label: 'Ocean', scheme: 'dark' },
  meadow: { label: 'Meadow', scheme: 'light' },
  parchment: { label: 'Parchment', scheme: 'light' },
  frost: { label: 'Frost', scheme: 'light' },
};

const DEFAULT_THEME = 'walnut';

function resolveTheme(theme) {
  return THEMES[theme] ? theme : DEFAULT_THEME;
}

function readFlipped() {
  return localStorage.getItem(STORAGE_KEYS.flipped) === '1';
}

function readClickMoves() {
  const saved = localStorage.getItem(STORAGE_KEYS.clickMoves);
  if (saved == null || saved === '') {
    return true;
  }
  return saved === '1' || saved === 'true' || saved === 'on';
}

function resolveClockPreset(id) {
  return CLOCK_PRESETS[id] ? id : '10|0';
}

function resolveClockMode(mode) {
  return CLOCK_MODES[mode] ? mode : 'notation';
}

const state = {
  game: emptyGame(),
  fullGame: emptyGame(),
  draft: localStorage.getItem(STORAGE_KEYS.draft) ?? '',
  theme: resolveTheme(localStorage.getItem(STORAGE_KEYS.theme)),
  pieceSet: resolvePieceSet(localStorage.getItem(STORAGE_KEYS.pieceSet)),
  piecePalette: resolvePiecePalette(localStorage.getItem(STORAGE_KEYS.piecePalette)),
  flipped: readFlipped(),
  clockPreset: resolveClockPreset(localStorage.getItem(STORAGE_KEYS.clockPreset)),
  clockMode: resolveClockMode(localStorage.getItem(STORAGE_KEYS.clockMode)),
  clockMoveSig: '',
  session: 'setup',
  requestTimer: null,
  typingResumeTimer: null,
  moveNumberPrimeTimer: null,
  shareTimer: null,
  animToken: 0,
  animating: false,
  clickMoves: readClickMoves(),
  boardInput: {
    from: null,
    moves: [],
    promotion: null,
    fen: null,
  },
  replay: {
    ply: null,
    playing: false,
    timer: null,
    generation: 0,
    announceFinish: false,
    speedMs: resolveReplaySpeed(localStorage.getItem(STORAGE_KEYS.replaySpeed)),
  },
  cpu: {
    enabled: false,
    levelId: resolveCpuLevel(localStorage.getItem(STORAGE_KEYS.cpuLevel)),
    handicap: resolveCpuHandicap(localStorage.getItem(STORAGE_KEYS.cpuHandicap)),
    humanSide: null,
    cpuSide: null,
    tossing: false,
    tossId: 0,
    coinFace: null,
    pausedThinkMs: null,
    matchStarted: false,
    thinking: false,
    requestId: 0,
    lastThoughtFen: null,
    humanTurnStartedAt: null,
    humanTurnStartMoveCount: null,
    humanTurnDurations: [],
    paceTargetMs: null,
  },
  lessonPreview: null,
  offerCoaching: true,
};

const stockfish = new StockfishCpu();
let lessons = null;

const elements = {
  board: document.querySelector('#board'),
  boardFrame: document.querySelector('#board-frame'),
  boardSeal: document.querySelector('#board-seal'),
  moves: document.querySelector('#moves'),
  movesList: document.querySelector('#moves-list'),
  status: document.querySelector('#status'),
  fen: document.querySelector('#fen'),
  moveCount: document.querySelector('#move-count'),
  feedback: document.querySelector('#feedback'),
  saveName: document.querySelector('#save-name'),
  savedGames: document.querySelector('#saved-games'),
  themeSelect: document.querySelector('#theme-select'),
  pieceSetSelect: document.querySelector('#piece-set-select'),
  piecePaletteSelect: document.querySelector('#piece-palette-select'),
  piecePaletteSwatches: document.querySelector('#piece-palette-swatches'),
  capturesWhite: document.querySelector('#captures-white'),
  capturesBlack: document.querySelector('#captures-black'),
  scoreboard: document.querySelector('#scoreboard'),
  clockWhite: document.querySelector('#clock-white'),
  clockBlack: document.querySelector('#clock-black'),
  clockWhiteTime: document.querySelector('#clock-white-time'),
  clockBlackTime: document.querySelector('#clock-black-time'),
  clockWhiteLabel: document.querySelector('#clock-white .clock-label'),
  clockBlackLabel: document.querySelector('#clock-black .clock-label'),
  clockPreset: document.querySelector('#clock-preset'),
  clockMode: document.querySelector('#clock-mode'),
  clockReset: document.querySelector('#clock-reset'),
  clockHint: document.querySelector('#clock-hint'),
  renderForm: document.querySelector('#render-form'),
  newBoard: document.querySelector('#new-board'),
  newGame: document.querySelector('#new-game'),
  startGame: document.querySelector('#start-game'),
  pauseGame: document.querySelector('#pause-game'),
  pauseVeil: document.querySelector('#pause-veil'),
  resumeGame: document.querySelector('#resume-game'),
  pauseNewBoard: document.querySelector('#pause-new-board'),
  flipBoard: document.querySelector('#flip-board'),
  copyPgn: document.querySelector('#copy-pgn'),
  shareLink: document.querySelector('#share-link'),
  saveGame: document.querySelector('#save-game'),
  loadDemo: document.querySelector('#load-demo'),
  replayFirst: document.querySelector('#replay-first'),
  replayPrev: document.querySelector('#replay-prev'),
  replayPlay: document.querySelector('#replay-play'),
  replayNext: document.querySelector('#replay-next'),
  replayLast: document.querySelector('#replay-last'),
  replaySpeed: document.querySelector('#replay-speed'),
  replayPosition: document.querySelector('#replay-position'),
  cpuPanel: document.querySelector('#cpu-panel'),
  cpuToggle: document.querySelector('#cpu-toggle'),
  cpuControls: document.querySelector('#cpu-controls'),
  cpuLevel: document.querySelector('#cpu-level'),
  cpuLevelHint: document.querySelector('#cpu-level-hint'),
  cpuHandicap: document.querySelector('#cpu-handicap'),
  cpuHandicapHint: document.querySelector('#cpu-handicap-hint'),
  cpuNewMatch: document.querySelector('#cpu-new-match'),
  cpuMatch: document.querySelector('#cpu-match'),
  coinStage: document.querySelector('#coin-stage'),
  coin: document.querySelector('#coin'),
  coinCaption: document.querySelector('#coin-caption'),
  cpuStatus: document.querySelector('#cpu-status'),
  clickMoves: document.querySelector('#click-moves'),
  promotionPicker: document.querySelector('#promotion-picker'),
  lessonBanner: document.querySelector('#lesson-banner'),
};

const clock = new ChessClock({
  baseMs: CLOCK_PRESETS[state.clockPreset].baseMs,
  incrementMs: CLOCK_PRESETS[state.clockPreset].incrementMs,
  mode: state.clockMode,
  onUpdate: paintClock,
  onFlag: (side) => {
    const names = getPaletteSideNames(state.piecePalette);
    setFeedback(`${side === 'white' ? names.white : names.black} flagged — clock ran out.`, true);
  },
});

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => (
    {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[character]
  ));
}

function loadSavedGames() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.saves) ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistSavedGames(games) {
  localStorage.setItem(STORAGE_KEYS.saves, JSON.stringify(games));
}

function formatTimestamp(timestamp) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp));
}

function populatePieceControls() {
  elements.pieceSetSelect.innerHTML = Object.entries(PIECE_SETS)
    .map(([id, set]) => `<option value="${id}">${escapeHtml(set.label)}</option>`)
    .join('');
  elements.piecePaletteSelect.innerHTML = Object.entries(PIECE_PALETTES)
    .map(([id, palette]) => `<option value="${id}">${escapeHtml(palette.label)}</option>`)
    .join('');
  drawPaletteSwatches();
}

function swatchStyle(color) {
  if (String(color).startsWith('var(')) {
    return color;
  }
  return color;
}

function drawPaletteSwatches() {
  if (!elements.piecePaletteSwatches) {
    return;
  }

  elements.piecePaletteSwatches.innerHTML = Object.entries(PIECE_PALETTES)
    .map(([id, palette]) => {
      const selected = id === state.piecePalette ? ' is-selected' : '';
      return `
        <button
          type="button"
          class="palette-swatch${selected}"
          data-palette="${escapeHtml(id)}"
          aria-pressed="${id === state.piecePalette ? 'true' : 'false'}"
          title="${escapeHtml(palette.label)}"
          aria-label="${escapeHtml(palette.label)}"
        >
          <span class="palette-swatch-chip" style="background:${swatchStyle(palette.white.fill)}; border-color:${swatchStyle(palette.white.stroke)}"></span>
          <span class="palette-swatch-chip" style="background:${swatchStyle(palette.black.fill)}; border-color:${swatchStyle(palette.black.stroke)}"></span>
        </button>
      `;
    })
    .join('');
}

function syncFlipButton() {
  if (!elements.flipBoard) {
    return;
  }
  elements.flipBoard.setAttribute('aria-pressed', state.flipped ? 'true' : 'false');
  elements.flipBoard.textContent = state.flipped
    ? `${getPaletteSideNames(state.piecePalette).white}'s side`
    : 'Flip board';
  elements.board.classList.toggle('is-flipped', state.flipped);
}

function populateClockControls() {
  elements.clockPreset.innerHTML = Object.entries(CLOCK_PRESETS)
    .map(([id, preset]) => `<option value="${id}">${escapeHtml(preset.label)}</option>`)
    .join('');
  elements.clockPreset.value = state.clockPreset;
  elements.clockMode.value = state.clockMode;
  updateClockHint();
}

function populateCpuControls() {
  if (!elements.cpuLevel) {
    return;
  }
  elements.cpuLevel.innerHTML = Object.values(CPU_LEVELS)
    .map((level) => `<option value="${escapeHtml(level.id)}">${escapeHtml(level.label)}</option>`)
    .join('');
  elements.cpuLevel.value = state.cpu.levelId;
  updateCpuLevelHint();
  paintCpuUi();
}

function updateCpuLevelHint() {
  if (!elements.cpuLevelHint) {
    return;
  }
  const level = CPU_LEVELS[state.cpu.levelId];
  elements.cpuLevelHint.textContent = level?.description ?? '';
}

function sideLabel(side) {
  const names = getPaletteSideNames(state.piecePalette);
  return side === 'white' ? names.white : names.black;
}

function paintCoin() {
  const { tossing, humanSide, coinFace } = state.cpu;
  if (elements.coin && coinFace) {
    elements.coin.dataset.face = coinFace;
  }
  elements.coinStage?.classList.toggle('is-spinning', tossing);
  elements.coinStage?.classList.toggle('is-resolved', Boolean(coinFace) && !tossing);
  if (!elements.coinCaption) {
    return;
  }
  if (tossing) {
    elements.coinCaption.textContent = 'Heads: you play White. Tails: CPU plays White.';
    return;
  }
  if (humanSide && coinFace) {
    const faceLabel = coinFace === 'heads' ? 'Heads' : 'Tails';
    elements.coinCaption.textContent = `${faceLabel}! You play ${sideLabel(humanSide)}. Press Start game when you are ready.`;
    return;
  }
  elements.coinCaption.textContent = 'New game tosses a coin. Start game begins the match.';
}

function paintCpuUi() {
  const { enabled, tossing, thinking, humanSide, levelId, handicap } = state.cpu;
  const setup = state.session === 'setup';
  elements.cpuPanel?.setAttribute('data-enabled', enabled ? 'true' : 'false');
  elements.cpuPanel?.classList.toggle('is-thinking', thinking && state.session === 'live');
  elements.cpuPanel?.classList.toggle('is-tossing', tossing);
  elements.cpuPanel?.classList.toggle('is-pace-on', Boolean(handicap));

  if (elements.cpuToggle) {
    elements.cpuToggle.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    elements.cpuToggle.textContent = enabled ? 'CPU on' : 'CPU off';
    elements.cpuToggle.disabled = tossing || !setup;
  }
  if (elements.cpuControls) {
    elements.cpuControls.hidden = !enabled;
  }
  if (elements.cpuMatch) {
    elements.cpuMatch.hidden = !enabled;
  }
  if (elements.cpuLevel) {
    elements.cpuLevel.value = levelId;
    elements.cpuLevel.disabled = tossing || !setup;
  }
  if (elements.cpuNewMatch) {
    elements.cpuNewMatch.disabled = tossing;
  }
  if (elements.cpuHandicap) {
    elements.cpuHandicap.setAttribute('aria-pressed', handicap ? 'true' : 'false');
    elements.cpuHandicap.textContent = handicap ? 'Pace on' : 'Pace off';
    elements.cpuHandicap.disabled = tossing || !setup;
  }
  updateCpuHandicapHint();
  paintCoin();

  if (!enabled) {
    if (elements.cpuStatus) {
      elements.cpuStatus.textContent = '';
    }
    notifyLessons();
    return;
  }

  if (tossing) {
    if (elements.cpuStatus) {
      elements.cpuStatus.textContent = 'Tossing for White…';
    }
    notifyLessons();
    return;
  }

  if (!state.cpu.matchStarted) {
    if (elements.cpuStatus) {
      if (!setup) {
        elements.cpuStatus.textContent = 'Press New game to toss for a match. Start game begins it.';
      } else if (humanSide) {
        elements.cpuStatus.textContent = `You have ${sideLabel(humanSide)}. Set lessons and the clock, then press Start game.`;
      } else {
        elements.cpuStatus.textContent = 'Press New game to toss for sides. The match starts only when you press Start game.';
      }
    }
    notifyLessons();
    return;
  }

  if (state.session === 'paused') {
    if (elements.cpuStatus) {
      elements.cpuStatus.textContent = 'Paused. The board stays covered until you resume.';
    }
    notifyLessons();
    return;
  }

  const level = CPU_LEVELS[levelId];
  const avgLabel = formatPaceDuration(averageHumanThinkMs(state.cpu.humanTurnDurations));
  if (thinking) {
    const targetLabel = formatPaceDuration(state.cpu.paceTargetMs);
    if (handicap && targetLabel && avgLabel) {
      elements.cpuStatus.textContent = `Stockfish (${level.label}) pacing to your ~${avgLabel} average…`;
    } else {
      elements.cpuStatus.textContent = `Stockfish (${level.label}) is thinking…`;
    }
    notifyLessons();
    return;
  }

  if (state.game?.isGameOver) {
    elements.cpuStatus.textContent = `Match over · you are ${sideLabel(humanSide)}. ${state.game.status}`;
    notifyLessons();
    return;
  }

  if (state.game?.turn === humanSide) {
    const paceNote = handicap && avgLabel ? ` · pace ~${avgLabel}` : '';
    elements.cpuStatus.textContent = `Your turn as ${sideLabel(humanSide)} · enter a move in notation${paceNote}.`;
  } else {
    elements.cpuStatus.textContent = `CPU to move as ${sideLabel(state.cpu.cpuSide)}.`;
  }
  notifyLessons();
}

function updateCpuHandicapHint() {
  if (!elements.cpuHandicapHint) {
    return;
  }
  if (!state.cpu.handicap) {
    elements.cpuHandicapHint.textContent = 'Pace off — CPU replies as soon as Stockfish finishes at this strength.';
    return;
  }
  const avgLabel = formatPaceDuration(averageHumanThinkMs(state.cpu.humanTurnDurations));
  if (avgLabel) {
    elements.cpuHandicapHint.textContent = `Pace on — CPU aims for your ~${avgLabel} average think time so the clocks stay even.`;
  } else {
    elements.cpuHandicapHint.textContent = 'Pace on — after a few of your moves, the CPU will match your average think time.';
  }
}

function resetCpuPaceTracking() {
  state.cpu.humanTurnStartedAt = null;
  state.cpu.humanTurnStartMoveCount = null;
  state.cpu.humanTurnDurations = [];
  state.cpu.paceTargetMs = null;
}

function recordHumanThinkTime(elapsedMs) {
  const sample = normalizeHumanThinkSample(elapsedMs);
  if (sample == null) {
    return;
  }
  state.cpu.humanTurnDurations.push(sample);
  if (state.cpu.humanTurnDurations.length > 12) {
    state.cpu.humanTurnDurations.shift();
  }
}

/**
 * Track how long the human spends on each turn so the CPU can match that pace.
 */
function syncHumanTurnTiming(game, previousMoveCount, previousTurn) {
  if (!state.cpu.enabled || !state.cpu.humanSide || state.cpu.tossing || state.session !== 'live') {
    return;
  }

  const humanSide = state.cpu.humanSide;
  const previousWasHuman = previousTurn === humanSide;
  const humanMoved = previousWasHuman
    && game.moveCount > previousMoveCount
    && state.cpu.humanTurnStartedAt != null;

  if (humanMoved) {
    recordHumanThinkTime(performance.now() - state.cpu.humanTurnStartedAt);
    state.cpu.humanTurnStartedAt = null;
    state.cpu.humanTurnStartMoveCount = null;
  }

  if (game.isGameOver || game.turn !== humanSide) {
    return;
  }

  // Start (or restart) the human think clock when their turn begins.
  if (
    state.cpu.humanTurnStartedAt == null
    || state.cpu.humanTurnStartMoveCount !== game.moveCount
  ) {
    state.cpu.humanTurnStartedAt = performance.now();
    state.cpu.humanTurnStartMoveCount = game.moveCount;
  }
}

function setCpuHandicap(enabled) {
  if (state.session !== 'setup') {
    setFeedback('Pace is chosen before the game starts.', true);
    paintCpuUi();
    return;
  }
  state.cpu.handicap = Boolean(enabled);
  localStorage.setItem(STORAGE_KEYS.cpuHandicap, state.cpu.handicap ? '1' : '0');
  paintCpuUi();
  setFeedback(
    state.cpu.handicap
      ? 'Pace handicap on — CPU will match your average think time.'
      : 'Pace handicap off — CPU replies at engine speed.',
  );
}

function cancelCpuSearch() {
  state.cpu.requestId += 1;
  state.cpu.thinking = false;
  state.cpu.lastThoughtFen = null;
  state.cpu.paceTargetMs = null;
  try {
    stockfish.stop();
  } catch {
    // ignore
  }
  paintCpuUi();
}

async function setCpuEnabled(enabled) {
  if (enabled === state.cpu.enabled) {
    return;
  }
  if (state.session !== 'setup') {
    setFeedback('The opponent is fixed once the game starts. Press New game to change it.', true);
    paintSession();
    return;
  }

  if (!enabled) {
    state.cpu.tossId += 1;
    cancelCpuSearch();
    state.cpu.enabled = false;
    state.cpu.humanSide = null;
    state.cpu.cpuSide = null;
    state.cpu.coinFace = null;
    state.cpu.tossing = false;
    state.cpu.matchStarted = false;
    resetCpuPaceTracking();
    paintSession();
    setFeedback('CPU player turned off.');
    return;
  }

  state.cpu.enabled = true;
  paintSession();
  setFeedback('Loading Stockfish…');
  try {
    await stockfish.applyLevel(state.cpu.levelId);
  } catch (error) {
    state.cpu.enabled = false;
    paintSession();
    setFeedback(error.message || 'Could not start Stockfish in this browser.', true);
    return;
  }

  paintSession();
  setFeedback('CPU is on. Press New game to toss for sides. Stockfish waits until you press Start game.');
}

async function applyCpuLevel(levelId) {
  if (state.session !== 'setup') {
    paintCpuUi();
    setFeedback('Strength is chosen before the game starts.', true);
    return;
  }
  const next = resolveCpuLevel(levelId);
  state.cpu.levelId = next;
  localStorage.setItem(STORAGE_KEYS.cpuLevel, next);
  updateCpuLevelHint();
  paintCpuUi();
  if (!state.cpu.enabled) {
    return;
  }
  try {
    await stockfish.applyLevel(next);
    setFeedback(`CPU strength set to ${CPU_LEVELS[next].label}.`);
    maybeRequestCpuMove(state.game);
  } catch (error) {
    setFeedback(error.message || 'Could not update CPU strength.', true);
  }
}

function clockSettings() {
  const preset = CLOCK_PRESETS[state.clockPreset];
  return {
    baseMs: preset.baseMs,
    incrementMs: preset.incrementMs,
    mode: state.clockMode,
  };
}

function clearToSetup() {
  state.cpu.tossId += 1;
  state.session = 'setup';
  state.offerCoaching = true;
  state.cpu.tossing = false;
  state.cpu.humanSide = null;
  state.cpu.cpuSide = null;
  state.cpu.coinFace = null;
  state.cpu.pausedThinkMs = null;
  state.cpu.matchStarted = false;
  cancelCpuSearch();
  resetCpuPaceTracking();
  state.clockMoveSig = '';
  elements.moves.value = '';
  elements.saveName.value = '';
  lessons?.exitPreview();
  clearLift();
  hidePromotionPicker();
  stopReplayPlayback();
  clock.configure(clockSettings());
  updateBoard('', false, { skipCpu: true });
  paintSession();
}

async function tossForSides() {
  if (!state.cpu.enabled || state.session !== 'setup') {
    return;
  }
  const tossId = state.cpu.tossId;
  state.cpu.tossing = true;
  state.cpu.humanSide = null;
  state.cpu.cpuSide = null;
  state.cpu.coinFace = null;
  paintSession();

  const result = await tossCoinForSides({ delayMs: 1500 });
  if (tossId !== state.cpu.tossId || !state.cpu.enabled || state.session !== 'setup') {
    if (state.cpu.tossing && tossId === state.cpu.tossId) {
      state.cpu.tossing = false;
      paintSession();
    }
    return;
  }

  state.cpu.humanSide = result.humanSide;
  state.cpu.cpuSide = result.cpuSide;
  state.cpu.coinFace = result.face;
  state.cpu.tossing = false;
  setBoardFlipped(result.humanSide === 'black');
  paintSession();
  const humanName = sideLabel(result.humanSide);
  const faceLabel = result.face === 'heads' ? 'Heads' : 'Tails';
  setFeedback(`${faceLabel} — you are ${humanName}. Set lessons and the clock, then press Start game.`);
}

async function newGame() {
  clearToSetup();
  if (state.cpu.enabled) {
    await tossForSides();
    return;
  }
  setFeedback('New game. Set the clock and lessons, then press Start game.');
}

function newBoard() {
  const cpuOn = state.cpu.enabled;
  clearToSetup();
  setFeedback(cpuOn
    ? 'New board. Press New game when you want a coin toss. Start game begins the match.'
    : 'New board. Set the clock and lessons, then press Start game.');
}

async function beginGame() {
  if (state.session !== 'setup' || state.cpu.tossing) {
    return;
  }
  if (state.cpu.enabled && !state.cpu.humanSide) {
    setFeedback('Press New game to toss for sides. Start game comes after the coin.', true);
    paintSession();
    return;
  }

  state.session = 'live';
  state.cpu.matchStarted = Boolean(state.cpu.enabled && state.cpu.humanSide);
  if (state.clockMode !== 'off') {
    const side = state.game?.turn === 'black' ? 'black' : 'white';
    clock.press(side);
    state.clockMoveSig = moveNumberSignature(elements.moves.value);
  }
  paintSession();

  if (!state.cpu.enabled) {
    setFeedback('Game started.');
    return;
  }

  if (state.cpu.humanSide === 'white') {
    state.cpu.humanTurnStartedAt = performance.now();
    state.cpu.humanTurnStartMoveCount = state.game?.moveCount ?? 0;
  }

  try {
    await stockfish.newGame();
  } catch (error) {
    if (state.session !== 'live' || !state.cpu.enabled) {
      return;
    }
    setFeedback(error.message || 'CPU failed to start.', true);
    return;
  }
  if (state.session !== 'live' || !state.cpu.enabled) {
    return;
  }

  const humanName = sideLabel(state.cpu.humanSide);
  setFeedback(`Game started. You play ${humanName}.`);
  maybeRequestCpuMove(state.game);
}

function pauseGame() {
  if (state.session !== 'live' || state.game?.isGameOver) {
    return;
  }
  state.session = 'paused';
  if (state.cpu.humanTurnStartedAt != null) {
    state.cpu.pausedThinkMs = performance.now() - state.cpu.humanTurnStartedAt;
    state.cpu.humanTurnStartedAt = null;
  }
  clock.pause();
  cancelCpuSearch();
  stopReplayPlayback();
  clearLift();
  hidePromotionPicker();
  lessons?.exitPreview();
  paintSession();
  elements.resumeGame?.focus();
  setFeedback('Paused. The board stays covered until you resume.');
}

function resumeGame() {
  if (state.session !== 'paused') {
    return;
  }
  state.session = 'live';
  clock.setTypingPaused(false);
  if (state.clockMode !== 'off' && !clock.flagged) {
    const side = state.game?.turn === 'black' ? 'black' : 'white';
    if (!clock.active) {
      clock.setActive(side, { start: true });
    } else {
      clock.ensureRunning();
    }
  }
  if (state.cpu.enabled && state.cpu.humanSide && state.game?.turn === state.cpu.humanSide) {
    const held = state.cpu.pausedThinkMs || 0;
    state.cpu.humanTurnStartedAt = performance.now() - held;
    state.cpu.humanTurnStartMoveCount = state.game.moveCount;
  }
  state.cpu.pausedThinkMs = null;
  paintSession();
  maybeRequestCpuMove(state.game);
  setFeedback('Game resumed.');
}

function paintSession() {
  const setup = state.session === 'setup';
  const paused = state.session === 'paused';
  const live = state.session === 'live';
  document.body.classList.toggle('is-game-setup', setup);
  document.body.classList.toggle('is-game-paused', paused);
  document.body.classList.toggle('is-game-live', live);
  if (elements.pauseVeil) {
    elements.pauseVeil.hidden = !paused;
  }
  if (elements.startGame) {
    const needsToss = Boolean(state.cpu.enabled && !state.cpu.humanSide);
    elements.startGame.hidden = !setup;
    elements.startGame.disabled = state.cpu.tossing || needsToss;
    elements.startGame.title = needsToss
      ? 'Press New game to toss for sides, then start.'
      : 'Start the game. The clock and lessons lock in.';
  }
  if (elements.pauseGame) {
    const over = Boolean(state.game?.isGameOver);
    elements.pauseGame.hidden = setup || over;
    elements.pauseGame.textContent = paused ? 'Resume' : 'Pause';
    elements.pauseGame.setAttribute('aria-pressed', paused ? 'true' : 'false');
  }
  if (elements.newGame) {
    elements.newGame.disabled = state.cpu.tossing;
  }
  if (elements.newBoard) {
    elements.newBoard.disabled = state.cpu.tossing;
  }
  const clockLocked = !setup;
  if (elements.clockPreset) {
    elements.clockPreset.disabled = clockLocked;
  }
  if (elements.clockMode) {
    elements.clockMode.disabled = clockLocked;
  }
  if (elements.clockReset) {
    elements.clockReset.disabled = clockLocked;
  }
  paintCpuUi();
  if (state.game?.board) {
    paintBoardBanner(state.game);
  }
}

function canPlayMoves() {
  if (state.session === 'paused') {
    setFeedback('Resume to move. The board stays covered while the game is paused.', true);
    return false;
  }
  if (state.session !== 'live') {
    setFeedback('Press Start game after the clock and lessons are set.', true);
    return false;
  }
  return true;
}

function notationChangeAllowed() {
  if (state.session === 'live') {
    return true;
  }
  const next = elements.moves.value;
  let count = null;
  try {
    count = renderGame(next).moveCount;
  } catch {
    count = null;
  }
  if (state.session === 'paused') {
    elements.moves.value = state.draft ?? '';
    setFeedback('Resume to change the moves. The board stays covered while paused.', true);
    return false;
  }
  if (count != null && count > 1) {
    state.session = 'live';
    state.offerCoaching = false;
    state.cpu.matchStarted = false;
    return true;
  }
  if (count === 1) {
    elements.moves.value = '';
    setFeedback('Press Start game before the first move.', true);
    return false;
  }
  return true;
}

async function maybeRequestCpuMove(game) {
  if (state.session !== 'live' || !state.cpu.enabled || !state.cpu.matchStarted || state.cpu.tossing || !state.cpu.cpuSide) {
    return;
  }
  if (!game || game.isGameOver) {
    if (state.cpu.thinking) {
      cancelCpuSearch();
    } else {
      paintCpuUi();
    }
    return;
  }
  if (game.turn !== state.cpu.cpuSide) {
    if (state.cpu.thinking) {
      cancelCpuSearch();
    } else {
      paintCpuUi();
    }
    return;
  }
  if (state.cpu.thinking && state.cpu.lastThoughtFen === game.fen) {
    return;
  }

  const requestId = state.cpu.requestId + 1;
  state.cpu.requestId = requestId;
  state.cpu.thinking = true;
  state.cpu.lastThoughtFen = game.fen;

  const search = resolveCpuSearch(state.cpu.levelId);
  const targetMs = cpuPaceTargetMs({
    handicap: state.cpu.handicap,
    samples: state.cpu.humanTurnDurations,
    fallbackMs: search.movetime,
  });
  state.cpu.paceTargetMs = targetMs;
  paintCpuUi();

  const searchStartedAt = performance.now();

  try {
    const uciMove = await stockfish.chooseMove(game.fen, { levelId: state.cpu.levelId });
    if (requestId !== state.cpu.requestId || !state.cpu.enabled) {
      return;
    }
    if (state.game.fen !== game.fen) {
      return;
    }

    // Keep skill search limits; pad wall-clock time so the CPU burns ~human average.
    if (state.cpu.handicap) {
      const remaining = targetMs - (performance.now() - searchStartedAt);
      if (remaining > 50) {
        await sleep(remaining);
      }
      if (requestId !== state.cpu.requestId || !state.cpu.enabled) {
        return;
      }
      if (state.game.fen !== game.fen) {
        return;
      }
    }

    const chosen = selectCpuMove(game.fen, uciMove, { blunderRate: search.blunderRate });
    const san = chosen.san;
    // After White, leave a trailing space so Black can type SAN.
    // After Black, leave clean movetext — next `N. ` priming adds the spaced prefix.
    const nextMoves = appendSanToMovetext(game.appliedMoves, san);
    elements.moves.value = nextMoves;
    state.cpu.thinking = false;
    state.cpu.lastThoughtFen = null;
    state.cpu.paceTargetMs = null;
    updateBoard(nextMoves, false, { skipCpu: true });
    const caret = nextMoves.length;
    elements.moves.setSelectionRange(caret, caret);
    setFeedback(`CPU played ${san}.`);
    paintCpuUi();
  } catch (error) {
    if (requestId !== state.cpu.requestId) {
      return;
    }
    state.cpu.thinking = false;
    state.cpu.lastThoughtFen = null;
    state.cpu.paceTargetMs = null;
    paintCpuUi();
    if (error?.message === 'Search cancelled.') {
      return;
    }
    setFeedback(error.message || 'CPU move failed.', true);
  }
}

function updateClockHint() {
  if (!elements.clockHint) {
    return;
  }
  elements.clockHint.textContent = CLOCK_MODES[state.clockMode].description;
}

function paintClockFace(face, timeEl, labelEl, side, snapshot, names) {
  const palette = getPaletteSide(state.piecePalette, side);
  const isLightSide = side === 'white';
  timeEl.textContent = snapshot.display[side];
  if (labelEl) {
    labelEl.textContent = names[side];
  }
  face.style.setProperty('--clock-fill', palette.fill);
  face.style.setProperty('--clock-stroke', palette.stroke);
  face.classList.toggle('is-light-side', isLightSide);
  face.classList.toggle('is-dark-side', !isLightSide);
  const toMove = state.game?.isGameOver ? null : state.game?.turn;
  face.classList.toggle('is-active', snapshot.active === side && snapshot.running);
  face.classList.toggle('is-to-move', toMove === side);
  face.classList.toggle('is-flagged', snapshot.flagged === side);
  face.classList.toggle('is-low', snapshot.times[side] <= 30_000);
}

function paintClock(snapshot = clock.snapshot()) {
  const names = getPaletteSideNames(state.piecePalette);
  paintClockFace(
    elements.clockWhite,
    elements.clockWhiteTime,
    elements.clockWhiteLabel,
    'white',
    snapshot,
    names,
  );
  paintClockFace(
    elements.clockBlack,
    elements.clockBlackTime,
    elements.clockBlackLabel,
    'black',
    snapshot,
    names,
  );
  const panel = document.getElementById('clock-panel');
  panel?.classList.toggle('is-typing-paused', snapshot.typingPaused);
  panel?.classList.toggle('is-off', snapshot.mode === 'off');
  panel?.classList.toggle('is-paused', state.session === 'paused');
}

function applyClockPreset(presetId) {
  if (state.session !== 'setup') {
    elements.clockPreset.value = state.clockPreset;
    return;
  }
  const id = resolveClockPreset(presetId);
  state.clockPreset = id;
  localStorage.setItem(STORAGE_KEYS.clockPreset, id);
  elements.clockPreset.value = id;
  const preset = CLOCK_PRESETS[id];
  clock.configure({
    baseMs: preset.baseMs,
    incrementMs: preset.incrementMs,
    mode: state.clockMode,
  });
  state.clockMoveSig = '';
  syncClockFromNotation(elements.moves.value, state.game, { force: true });
}

function applyClockMode(modeId) {
  if (state.session !== 'setup') {
    elements.clockMode.value = state.clockMode;
    return;
  }
  const mode = resolveClockMode(modeId);
  state.clockMode = mode;
  localStorage.setItem(STORAGE_KEYS.clockMode, mode);
  elements.clockMode.value = mode;
  clock.configure({
    baseMs: CLOCK_PRESETS[state.clockPreset].baseMs,
    incrementMs: CLOCK_PRESETS[state.clockPreset].incrementMs,
    mode,
  });
  state.clockMoveSig = '';
  updateClockHint();
  syncClockFromNotation(elements.moves.value, state.game, { force: true });
}

function resetClock() {
  if (state.session !== 'setup') {
    return;
  }
  clock.configure({
    baseMs: CLOCK_PRESETS[state.clockPreset].baseMs,
    incrementMs: CLOCK_PRESETS[state.clockPreset].incrementMs,
    mode: state.clockMode,
  });
  state.clockMoveSig = moveNumberSignature(elements.moves.value);
  syncClockFromNotation(elements.moves.value, state.game, { force: true });
  setFeedback('Clock reset.');
}

/**
 * Notation pause: move numbers press the clock.
 * Live: each completed half-move hands the clock to the side to move.
 */
function syncClockFromNotation(text, game, { force = false, previousMoveCount = null } = {}) {
  if (state.session !== 'live' || state.clockMode === 'off') {
    return;
  }
  const signature = moveNumberSignature(text);
  const signatureChanged = signature !== state.clockMoveSig;

  if (state.clockMode === 'notation') {
    if (signatureChanged) {
      const markers = signature ? signature.split('|') : [];
      const last = markers[markers.length - 1];
      if (last) {
        // Move numbers press the clock; the side to move owns the time
        // (not the move-number color — e.g. `1. f3 2.` is still Black's turn).
        const side = game?.turn
          || (last.endsWith(':black') ? 'black' : 'white');
        clock.press(side);
      } else if (force) {
        clock.reset();
      }
      state.clockMoveSig = signature;
    } else if (force && game.moveCount === 0) {
      clock.reset();
      state.clockMoveSig = '';
    } else if (!clock.active && signature && game?.turn) {
      clock.setActive(game.turn, { start: true });
    } else if (game?.turn && clock.active && game.turn !== clock.active && !signatureChanged) {
      // Soft handoff after a completed reply (e.g. Black to move) without a new number yet.
      clock.setActive(game.turn, { start: true });
    } else if (force && game?.turn && signature) {
      clock.setActive(game.turn, { start: true });
    }
    return;
  }

  // Live mode
  state.clockMoveSig = signature;
  if (!game) {
    return;
  }
  if (game.moveCount === 0) {
    if (force) {
      clock.reset();
    }
    return;
  }
  if (force || previousMoveCount == null || game.moveCount !== previousMoveCount) {
    clock.afterMove(game.turn);
  }
}

function pauseClockForTyping() {
  if (state.clockMode !== 'notation') {
    return;
  }
  clock.setTypingPaused(true);
  clearTimeout(state.typingResumeTimer);
  state.typingResumeTimer = window.setTimeout(() => {
    clock.setTypingPaused(false);
  }, 550);
}

function formatAdvantage(advantage) {
  const names = getPaletteSideNames(state.piecePalette);
  if (advantage === 0) {
    return 'Material even';
  }
  if (advantage > 0) {
    return `${names.white} +${advantage}`;
  }
  return `${names.black} +${Math.abs(advantage)}`;
}

function renderCaptures(game) {
  const captures = game.captures ?? { white: [], black: [], whiteScore: 0, blackScore: 0, advantage: 0 };
  const names = getPaletteSideNames(state.piecePalette);

  const renderSide = (types, ownerColor) => {
    if (!types.length) {
      return '<span class="captures-empty">—</span>';
    }
    return types.map((type) => `
      <span class="captured-piece" title="${ownerColor === 'white' ? names.black : names.white} ${type}">
        ${renderPieceSvg(type, ownerColor === 'white' ? 'black' : 'white', state.pieceSet, state.piecePalette)}
      </span>
    `).join('');
  };

  // captures.white = pieces White took (show as black piece icons)
  const whiteBlock = `
    <div class="captures-heading">${escapeHtml(names.white)} took <strong>${captures.whiteScore}</strong></div>
    <div class="captures-row">${renderSide(captures.white, 'white')}</div>
  `;
  const blackBlock = `
    <div class="captures-heading">${escapeHtml(names.black)} took <strong>${captures.blackScore}</strong></div>
    <div class="captures-row">${renderSide(captures.black, 'black')}</div>
  `;

  // Keep captured pieces on the corresponding player's near side when flipped.
  if (state.flipped) {
    elements.capturesWhite.innerHTML = blackBlock;
    elements.capturesBlack.innerHTML = whiteBlock;
  } else {
    elements.capturesBlack.innerHTML = blackBlock;
    elements.capturesWhite.innerHTML = whiteBlock;
  }
  elements.scoreboard.innerHTML = `
    <span class="score-pill">${escapeHtml(formatAdvantage(captures.advantage))}</span>
    <span class="score-detail">${escapeHtml(names.white)} ${captures.whiteScore} · ${escapeHtml(names.black)} ${captures.blackScore}</span>
  `;
}

function applyTheme(theme) {
  const nextTheme = resolveTheme(theme);
  state.theme = nextTheme;
  document.documentElement.dataset.theme = nextTheme;
  document.body.dataset.theme = nextTheme;
  document.body.dataset.scheme = THEMES[nextTheme].scheme;
  document.documentElement.style.colorScheme = THEMES[nextTheme].scheme;
  elements.themeSelect.value = nextTheme;
  localStorage.setItem(STORAGE_KEYS.theme, nextTheme);
    if (state.piecePalette === 'theme') {
      applyPiecePaletteVars('theme');
      if (state.lessonPreview) {
        lessons?.reapplyPreview();
      } else {
        renderBoard(state.game, { settle: true });
      }
    }
}

function applyPieceSet(setId) {
  const nextSet = resolvePieceSet(setId);
  state.pieceSet = nextSet;
  document.documentElement.dataset.pieceSet = nextSet;
  document.body.dataset.pieceSet = nextSet;
  elements.pieceSetSelect.value = nextSet;
  localStorage.setItem(STORAGE_KEYS.pieceSet, nextSet);
  if (state.lessonPreview) {
    lessons?.reapplyPreview();
  } else {
    renderBoard(state.game, { settle: true });
  }
  renderCaptures(state.game);
}

function applyPiecePalette(paletteId) {
  const nextPalette = resolvePiecePalette(paletteId);
  state.piecePalette = nextPalette;
  document.documentElement.dataset.piecePalette = nextPalette;
  document.body.dataset.piecePalette = nextPalette;
  elements.piecePaletteSelect.value = nextPalette;
  localStorage.setItem(STORAGE_KEYS.piecePalette, nextPalette);
  applyPiecePaletteVars(nextPalette);
  drawPaletteSwatches();
  if (state.lessonPreview) {
    lessons?.reapplyPreview();
  } else {
    renderBoard(state.game, { settle: true });
  }
  renderCaptures(state.game);
  paintClock();
  paintCpuUi();
}

function setBoardFlipped(flipped) {
  state.flipped = Boolean(flipped);
  localStorage.setItem(STORAGE_KEYS.flipped, state.flipped ? '1' : '0');
  state.animToken += 1;
  clearPieceFlyers();
  syncFlipButton();
  if (state.lessonPreview) {
    lessons?.reapplyPreview();
  } else {
    renderBoard(state.game, { settle: false });
  }
  renderCaptures(state.game);
}

function setFeedback(message, isError = false) {
  elements.feedback.textContent = message;
  elements.feedback.classList.toggle('is-error', isError);
  scheduleKeyboardFit();
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function currentViewPly(fullGame = state.fullGame) {
  if (state.replay.ply == null) {
    return fullGame?.moveCount ?? 0;
  }
  return Math.max(0, Math.min(state.replay.ply, fullGame?.moveCount ?? 0));
}

function isViewingLive(fullGame = state.fullGame) {
  return state.replay.ply == null || currentViewPly(fullGame) >= (fullGame?.moveCount ?? 0);
}

function clearPieceFlyers() {
  document.querySelectorAll('.piece-flyer, .piece-victim').forEach((node) => node.remove());
}

function clearBoardEffects() {
  elements.board?.querySelectorAll('.is-splash, .is-capture-burst, .is-check, .is-checkmate').forEach((node) => {
    node.classList.remove('is-splash', 'is-capture-burst', 'is-check', 'is-checkmate');
  });
  elements.board?.classList.remove('is-mate-flash');
}

function squareNode(square) {
  return elements.board.querySelector(`[data-square="${square}"]`);
}

function findKingSquare(game, color) {
  for (const row of game?.board ?? []) {
    for (const square of row) {
      if (square.piece?.type === 'k' && square.piece.color === color) {
        return square.square;
      }
    }
  }
  return null;
}

function pieceSlotRect(squareEl) {
  const rect = squareEl.getBoundingClientRect();
  const raw = getComputedStyle(elements.board).getPropertyValue('--piece-slot');
  const parsed = Number.parseFloat(raw);
  const slot = Number.isFinite(parsed) && parsed > 0 ? parsed : 0.84;
  const size = Math.min(rect.width, rect.height) * slot;
  return {
    left: rect.left + ((rect.width - size) / 2),
    top: rect.top + ((rect.height - size) / 2),
    width: size,
    height: size,
  };
}

function createPieceFlyer(pieceEl, fromRect, className = 'piece-flyer') {
  const flyer = pieceEl.cloneNode(true);
  flyer.classList.add(className);
  flyer.classList.remove('is-hidden-for-anim');
  flyer.removeAttribute('aria-hidden');
  flyer.style.left = `${fromRect.left}px`;
  flyer.style.top = `${fromRect.top}px`;
  flyer.style.width = `${fromRect.width}px`;
  flyer.style.height = `${fromRect.height}px`;
  document.body.appendChild(flyer);
  return flyer;
}

function animateFlyerTo(flyer, fromRect, toRect, durationMs) {
  const dx = toRect.left - fromRect.left;
  const dy = toRect.top - fromRect.top;
  const distance = Math.hypot(dx, dy);
  const lift = Math.max(8, Math.min(22, distance * 0.12));
  const animation = flyer.animate(
    [
      { transform: 'translate3d(0px, 0px, 0) scale(1)', offset: 0 },
      {
        transform: `translate3d(${(dx * 0.46).toFixed(2)}px, ${(dy * 0.46 - lift).toFixed(2)}px, 0) scale(1.06)`,
        offset: 0.46,
      },
      { transform: `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0) scale(1)`, offset: 1 },
    ],
    {
      duration: durationMs,
      easing: 'cubic-bezier(0.16, 0.84, 0.28, 1)',
      fill: 'forwards',
    },
  );
  return animation.finished.catch(() => {});
}

function animateCaptureVictim(victimEl, durationMs) {
  const animation = victimEl.animate(
    [
      { transform: 'translate(0, 0) scale(1) rotate(0deg)', opacity: 1, offset: 0 },
      { transform: 'translate(0, -8%) scale(1.12) rotate(-8deg)', opacity: 1, offset: 0.18 },
      {
        transform: 'translate(18%, -42%) scale(0.15) rotate(42deg)',
        opacity: 0,
        offset: 1,
      },
    ],
    {
      duration: Math.max(280, Math.floor(durationMs * 0.72)),
      easing: 'cubic-bezier(0.2, 0.75, 0.25, 1)',
      fill: 'forwards',
    },
  );
  return animation.finished.catch(() => {}).finally(() => victimEl.remove());
}

function pulseSquareClass(square, className, durationMs) {
  if (!square || prefersReducedMotion()) {
    return;
  }
  const target = squareNode(square);
  if (!target) {
    return;
  }
  target.classList.remove(className);
  void target.offsetWidth;
  target.classList.add(className);
  window.setTimeout(() => {
    target.classList.remove(className);
  }, durationMs);
}

function playLandingSplash(square) {
  pulseSquareClass(square, 'is-splash', 520);
}

function playCaptureBurst(square) {
  pulseSquareClass(square, 'is-capture-burst', 620);
}

function playCheckEffects(game, move) {
  if (!game?.isCheck && !game?.isCheckmate) {
    return;
  }
  const checkedSide = game.turn;
  const kingSquare = findKingSquare(game, checkedSide);
  if (!kingSquare) {
    return;
  }

  if (game.isCheckmate) {
    pulseSquareClass(kingSquare, 'is-checkmate', 1400);
    if (!prefersReducedMotion()) {
      elements.board.classList.remove('is-mate-flash');
      void elements.board.offsetWidth;
      elements.board.classList.add('is-mate-flash');
      window.setTimeout(() => {
        elements.board.classList.remove('is-mate-flash');
      }, 1200);
    }
    return;
  }

  pulseSquareClass(kingSquare, 'is-check', 900);
}

function describeSituation(game) {
  const toMoveSide = game?.turn === 'black' ? 'black' : 'white';
  const toMove = sideLabel(toMoveSide);
  const winnerSide = toMoveSide === 'white' ? 'black' : 'white';
  const winner = sideLabel(winnerSide);
  const whiteAtBottom = !state.flipped;
  const matedEdge = (toMoveSide === 'white') === whiteAtBottom ? 'bottom' : 'top';
  const edge = game?.isGameOver && !game?.isCheckmate ? 'none' : matedEdge;

  if (game?.isCheckmate) {
    return {
      tone: 'checkmate',
      side: winnerSide,
      edge,
      banner: `Checkmate · ${winner} wins`,
      sealKicker: 'Checkmate',
      sealResult: `${winner} wins`,
    };
  }
  if (game?.isGameOver) {
    const raw = String(game.status || 'Draw').replace(/\.$/, '');
    const stalemate = /^stalemate/i.test(raw);
    return {
      tone: 'draw',
      side: toMoveSide,
      edge,
      banner: raw,
      sealKicker: stalemate ? 'Stalemate' : 'Draw',
      sealResult: stalemate ? 'Draw' : raw.replace(/^Draw by /i, ''),
    };
  }
  if (game?.isCheck) {
    return {
      tone: 'check',
      side: toMoveSide,
      edge,
      banner: `Check · ${toMove} to move`,
      sealKicker: '',
      sealResult: '',
    };
  }
  return {
    tone: 'turn',
    side: toMoveSide,
    edge,
    banner: `${toMove} to move`,
    sealKicker: '',
    sealResult: '',
  };
}

function paintBoardBanner(game) {
  const banner = elements.status;
  const frame = elements.boardFrame;
  const seal = elements.boardSeal;
  if (!banner || !frame || !game) {
    return;
  }

  const situation = describeSituation(game);
  const palette = getPaletteSide(state.piecePalette, situation.side);
  frame.dataset.situation = situation.tone;
  frame.dataset.turn = situation.side;
  frame.dataset.turnEdge = situation.edge;
  frame.style.setProperty('--turn-fill', palette.fill);
  frame.style.setProperty('--turn-stroke', palette.stroke);
  paintClock();

  let bannerText = situation.banner;
  if (state.session === 'setup') {
    if (state.cpu.enabled && state.cpu.tossing) {
      bannerText = 'Tossing for colors…';
    } else if (state.cpu.enabled && !state.cpu.humanSide) {
      bannerText = 'Press New game to toss a coin, then Start game.';
    } else if (state.cpu.enabled && state.cpu.humanSide) {
      bannerText = 'Colors are set. Press Start game when you are ready.';
    } else {
      bannerText = 'Set the clock and lessons, then press Start game.';
    }
  } else if (state.session === 'paused') {
    bannerText = 'Paused';
  }
  const signature = `${state.session}|${situation.tone}|${bannerText}|${situation.side}|${state.piecePalette}`;
  if (banner.dataset.signature === signature) {
    return;
  }
  banner.dataset.signature = signature;
  banner.dataset.tone = state.session === 'setup' ? 'setup' : situation.tone;

  const pip = document.createElement('span');
  pip.className = 'board-banner-pip';
  pip.setAttribute('aria-hidden', 'true');
  const text = document.createElement('span');
  text.className = 'board-banner-text';
  text.textContent = bannerText;
  banner.replaceChildren(pip, text);

  const announce = situation.tone === 'check' || situation.tone === 'checkmate' || situation.tone === 'draw';
  banner.classList.remove('is-announcing');
  seal?.classList.remove('is-announcing');
  if (announce && !prefersReducedMotion()) {
    void banner.offsetWidth;
    banner.classList.add('is-announcing');
  }

  if (!seal) {
    return;
  }
  const showSeal = situation.tone === 'checkmate' || situation.tone === 'draw';
  seal.hidden = !showSeal;
  seal.dataset.tone = situation.tone;
  seal.dataset.signature = signature;
  seal.replaceChildren();
  if (!showSeal) {
    return;
  }
  const kicker = document.createElement('span');
  kicker.className = 'board-seal-kicker';
  kicker.textContent = situation.sealKicker;
  seal.append(kicker);
  if (situation.sealResult) {
    const result = document.createElement('span');
    result.className = 'board-seal-result';
    result.textContent = situation.sealResult;
    seal.append(result);
  }
  if (announce && !prefersReducedMotion()) {
    void seal.offsetWidth;
    seal.classList.add('is-announcing');
  }
}

function renderBoard(game, { hidePieces = null, animating = false, settle = false } = {}) {
  const hidden = hidePieces instanceof Set ? hidePieces : new Set(hidePieces ?? []);
  const squares = [];
  const lastMove = game.history?.[game.history.length - 1] ?? null;
  const checkedKing = (game?.isCheck || game?.isCheckmate) ? findKingSquare(game, game.turn) : null;
  const files = state.flipped
    ? ['H', 'G', 'F', 'E', 'D', 'C', 'B', 'A']
    : ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const rows = state.flipped
    ? game.board.map((row) => [...row].reverse()).reverse()
    : game.board;

  clearBoardEffects();
  squares.push('<div class="legend board-cell"></div>');
  files.forEach((file) => squares.push(`<div class="legend board-cell">${file}</div>`));

  rows.forEach((row, index) => {
    const rankLabel = state.flipped ? index + 1 : 8 - index;
    squares.push(`<div class="legend board-cell">${rankLabel}</div>`);
    row.forEach((square) => {
      const piece = square.piece;
      const hidePiece = Boolean(piece) && hidden.has(square.square);
      const pieceMarkup = piece
        ? `<span class="piece ${piece.color}${hidePiece ? ' is-hidden-for-anim' : ''}" aria-hidden="true">${renderPieceSvg(piece.type, piece.color, state.pieceSet, state.piecePalette)}</span>`
        : '';
      let label = piece
        ? `${piece.color} ${piece.name} on ${square.square}`
        : `empty ${square.square}`;
      const isCheckedKing = checkedKing === square.square;
      if (isCheckedKing) {
        label += game.isCheckmate ? ', checkmated' : ', in check';
      }
      const pieceClass = piece ? ` has-piece ${piece.color}` : '';
      const lastClass = lastMove && (square.square === lastMove.from || square.square === lastMove.to)
        ? ' is-last-move'
        : '';
      const alertClass = isCheckedKing
        ? (game.isCheckmate ? ' is-in-checkmate' : ' is-in-check')
        : '';
      const alertBadge = isCheckedKing
        ? `<span class="king-alert" aria-hidden="true">${game.isCheckmate ? '#' : '+'}</span>`
        : '';
      squares.push(`
        <div
          class="board-square board-cell ${square.isLight ? 'light' : 'dark'}${pieceClass}${lastClass}${alertClass}"
          data-square="${escapeHtml(square.square)}"
          aria-label="${escapeHtml(label)}"
        >
          ${pieceMarkup}
          ${alertBadge}
          <span class="coordinate">${escapeHtml(square.square)}</span>
        </div>
      `);
    });
  });

  elements.board.classList.toggle('is-animating', animating);
  elements.board.classList.remove('is-settling');
  elements.board.innerHTML = squares.join('');
  elements.board.classList.remove('is-updating');
  elements.board.classList.add('is-ready');
  if (settle && !animating && !prefersReducedMotion()) {
    void elements.board.offsetWidth;
    elements.board.classList.add('is-settling');
  }
  syncLiftAfterRender(game);
  paintBoardBanner(game);
}

function flyerStartRect(pieceEl, squareEl) {
  const slot = pieceSlotRect(squareEl);
  const visual = pieceEl.getBoundingClientRect();
  if (visual.width <= 0 || visual.height <= 0) {
    return slot;
  }
  return {
    left: visual.left + ((visual.width - slot.width) / 2),
    top: visual.top + ((visual.height - slot.height) / 2),
    width: slot.width,
    height: slot.height,
  };
}

async function animateBoardMove(move, nextGame) {
  if (!move || prefersReducedMotion()) {
    renderBoard(nextGame, { settle: false });
    playLandingSplash(move?.to);
    if (move?.isCapture || move?.isEnPassant) {
      playCaptureBurst(move.to);
    }
    playCheckEffects(nextGame, move);
    return;
  }

  const fromSquare = squareNode(move.from);
  const toSquare = squareNode(move.to);
  const movingPiece = fromSquare?.querySelector('.piece');
  if (!fromSquare || !toSquare || !movingPiece) {
    renderBoard(nextGame, { settle: false });
    playLandingSplash(move?.to);
    playCheckEffects(nextGame, move);
    return;
  }

  const token = state.animToken + 1;
  state.animToken = token;
  state.animating = true;
  clearPieceFlyers();
  clearBoardEffects();

  const fromRect = flyerStartRect(movingPiece, fromSquare);
  const toRect = pieceSlotRect(toSquare);
  const flyer = createPieceFlyer(movingPiece, fromRect);
  movingPiece.classList.add('is-hidden-for-anim');

  const captureSquare = move.isEnPassant ? enPassantCaptureSquare(move) : (move.isCapture ? move.to : null);
  let victimPromise = Promise.resolve();
  if (captureSquare) {
    const captureEl = squareNode(captureSquare);
    const capturedPiece = captureEl?.querySelector('.piece');
    if (capturedPiece) {
      const victimRect = pieceSlotRect(captureEl);
      const victim = createPieceFlyer(capturedPiece, victimRect, 'piece-victim');
      capturedPiece.classList.add('is-hidden-for-anim');
      victimPromise = animateCaptureVictim(victim, SLIDE_DURATION_MS);
    }
  }

  const rookMove = castlingRookMove(move);
  let rookFlyer = null;
  let rookFromRect = null;
  let rookToRect = null;
  if (rookMove) {
    const rookFrom = squareNode(rookMove.from);
    const rookTo = squareNode(rookMove.to);
    const rookPiece = rookFrom?.querySelector('.piece');
    if (rookFrom && rookTo && rookPiece) {
      rookFromRect = flyerStartRect(rookPiece, rookFrom);
      rookToRect = pieceSlotRect(rookTo);
      rookFlyer = createPieceFlyer(rookPiece, rookFromRect);
      rookPiece.classList.add('is-hidden-for-anim');
    }
  }

  if (move.isCapture || move.isEnPassant) {
    playCaptureBurst(move.to);
    if (captureSquare && captureSquare !== move.to) {
      playCaptureBurst(captureSquare);
    }
  }

  elements.board.classList.add('is-animating');
  let promotionTimer = null;
  if (move.promotion) {
    const color = move.color === 'black' ? 'black' : 'white';
    promotionTimer = window.setTimeout(() => {
      if (!flyer.isConnected) {
        return;
      }
      flyer.innerHTML = renderPieceSvg(move.promotion, color, state.pieceSet, state.piecePalette);
    }, Math.round(SLIDE_DURATION_MS * 0.55));
  }

  const animations = [
    animateFlyerTo(flyer, fromRect, toRect, SLIDE_DURATION_MS),
    victimPromise,
  ];
  if (rookFlyer && rookFromRect && rookToRect) {
    animations.push(animateFlyerTo(rookFlyer, rookFromRect, rookToRect, SLIDE_DURATION_MS));
  }

  try {
    await Promise.all(animations);
  } finally {
    window.clearTimeout(promotionTimer);
    if (token === state.animToken) {
      state.animating = false;
      // Rebuild and drop the flyer in one turn so the landing piece does not flash.
      renderBoard(nextGame, { settle: false });
      flyer.remove();
      rookFlyer?.remove();
      playLandingSplash(move.to);
      playCheckEffects(nextGame, move);
    } else {
      flyer.remove();
      rookFlyer?.remove();
    }
  }
}

function stopReplayPlayback({ finished = false } = {}) {
  const shouldAnnounce = finished && state.replay.announceFinish;
  state.replay.playing = false;
  state.replay.announceFinish = false;
  state.replay.generation += 1;
  if (state.replay.timer != null) {
    window.clearTimeout(state.replay.timer);
    state.replay.timer = null;
  }
  paintReplayUi();
  if (shouldAnnounce) {
    setFeedback('Playback finished.');
  }
}

function paintReplayUi() {
  const full = state.fullGame;
  const ply = currentViewPly(full);
  const total = full?.moveCount ?? 0;
  if (elements.replayPosition) {
    elements.replayPosition.textContent = `${ply} / ${total}`;
  }
  if (elements.replayPlay) {
    elements.replayPlay.textContent = state.replay.playing ? 'Pause' : 'Play';
    elements.replayPlay.setAttribute('aria-pressed', state.replay.playing ? 'true' : 'false');
  }
  const atStart = ply <= 0;
  const atEnd = ply >= total;
  if (elements.replayFirst) elements.replayFirst.disabled = atStart;
  if (elements.replayPrev) elements.replayPrev.disabled = atStart;
  if (elements.replayNext) elements.replayNext.disabled = atEnd;
  if (elements.replayLast) elements.replayLast.disabled = atEnd;
  if (elements.replayPlay) elements.replayPlay.disabled = total === 0 && !state.replay.playing;
  if (elements.replaySpeed) elements.replaySpeed.value = String(state.replay.speedMs);
  elements.board?.classList.toggle('is-reviewing', !isViewingLive(full));
}

function queueShareHash(moves) {
  clearTimeout(state.shareTimer);
  state.shareTimer = window.setTimeout(() => {
    try {
      writeShareHash(moves);
    } catch {
      // Ignore history API failures in locked-down contexts.
    }
  }, 200);
}

function renderMoves(game, fullGame = state.fullGame) {
  const moves = fullGame?.appliedMoves?.length ? fullGame.appliedMoves : game.appliedMoves;
  const viewPly = currentViewPly(fullGame);

  if (!moves.length) {
    elements.movesList.innerHTML = '<li>Start position</li>';
    return;
  }

  const entries = [];
  for (let index = 0; index < moves.length; index += 2) {
    const turn = Math.floor(index / 2) + 1;
    const white = moves[index];
    const black = moves[index + 1];
    const whiteActive = viewPly === index + 1 ? ' is-active-ply' : '';
    const blackActive = viewPly === index + 2 ? ' is-active-ply' : '';
    const whiteBtn = `<button type="button" class="ply-jump${whiteActive}" data-ply="${index + 1}">${escapeHtml(white)}</button>`;
    const blackBtn = black
      ? ` <button type="button" class="ply-jump${blackActive}" data-ply="${index + 2}">${escapeHtml(black)}</button>`
      : '';
    entries.push(`<li><span class="ply-turn">${turn}.</span> ${whiteBtn}${blackBtn}</li>`);
  }
  elements.movesList.innerHTML = entries.join('');
}

function renderStatus(game) {
  paintBoardBanner(game);
  elements.fen.textContent = game.fen;
  elements.moveCount.textContent = String(state.fullGame?.moveCount ?? game.moveCount);
}

async function paintGame(game, {
  skipCpu = false,
  animateMove = null,
  syncClock = true,
  previousMoveCount = null,
} = {}) {
  const priorCount = previousMoveCount ?? state.game?.moveCount ?? 0;
  const previousTurn = state.game?.turn ?? null;
  state.game = game;

  if (animateMove) {
    await animateBoardMove(animateMove, game);
  } else {
    state.animToken += 1;
    clearPieceFlyers();
    renderBoard(game, { settle: false });
  }

  renderCaptures(game);
  renderMoves(game, state.fullGame);
  renderStatus(game);
  paintReplayUi();

  if (syncClock && isViewingLive()) {
    syncClockFromNotation(elements.moves.value, state.fullGame, { previousMoveCount: priorCount });
  }

  if (isViewingLive()) {
    syncHumanTurnTiming(state.fullGame ?? game, priorCount, previousTurn);
    queueNextMoveNumberPrime(state.fullGame ?? game, priorCount);
  }

  if (!skipCpu && isViewingLive()) {
    maybeRequestCpuMove(state.fullGame);
  }
  paintSession();
}

/** True when movetext already ends with `N. ` (space after the period) for White. */
function hasTrailingMoveNumber(text, moveNumber) {
  return new RegExp(`(?:^|\\s)${moveNumber}\\.\\s+$`).test(String(text ?? ''));
}

/** Build `… N. ` with a guaranteed space after the period. */
function withNextMoveNumberPrefix(text, nextNumber) {
  let base = String(text ?? '').replace(/\s+$/, '');
  base = base.replace(new RegExp(`(?:^|\\s)${nextNumber}\\.$`), '').replace(/\s+$/, '');
  return base ? `${base} ${nextNumber}. ` : `${nextNumber}. `;
}

/**
 * After Black completes a move, wait briefly then type the next `N. `
 * so White can enter SAN without the number, period, and space.
 * Also upgrades a bare trailing `N.` to `N. ` if the space is missing.
 */
function queueNextMoveNumberPrime(game, previousMoveCount) {
  clearTimeout(state.moveNumberPrimeTimer);
  state.moveNumberPrimeTimer = null;

  if (state.session !== 'live' || !game || game.isGameOver || game.moveCount === 0) {
    return;
  }
  // Black just finished a full turn (even half-move count, White to move).
  if (game.moveCount % 2 !== 0 || game.turn !== 'white') {
    return;
  }

  const nextNumber = game.moveCount / 2 + 1;
  if (hasTrailingMoveNumber(elements.moves.value, nextNumber)) {
    return;
  }

  const blackJustMoved = previousMoveCount < game.moveCount;
  const trimmed = elements.moves.value.replace(/\s+$/, '');
  const endsWithBareNumber = new RegExp(`(?:^|\\s)${nextNumber}\\.$`).test(trimmed);
  if (!blackJustMoved && !endsWithBareNumber) {
    return;
  }

  const snapshotCount = game.moveCount;
  const snapshotFen = game.fen;
  state.moveNumberPrimeTimer = window.setTimeout(() => {
    state.moveNumberPrimeTimer = null;
    primeNextMoveNumber({ moveCount: snapshotCount, fen: snapshotFen });
  }, 280);
}

function primeNextMoveNumber({ moveCount, fen }) {
  if (!state.fullGame || state.fullGame.isGameOver || !isViewingLive()) {
    return;
  }
  // Bail if the player edited away from that completed Black reply.
  if (state.fullGame.moveCount !== moveCount || state.fullGame.fen !== fen) {
    return;
  }
  if (moveCount % 2 !== 0 || state.fullGame.turn !== 'white') {
    return;
  }

  const nextNumber = moveCount / 2 + 1;
  const current = elements.moves.value;
  if (hasTrailingMoveNumber(current, nextNumber)) {
    return;
  }

  const next = withNextMoveNumberPrefix(current, nextNumber);
  const selectionStart = elements.moves.selectionStart;
  const selectionEnd = elements.moves.selectionEnd;
  const atEnd = selectionStart === current.length && selectionEnd === current.length;

  elements.moves.value = next;
  // Sync board/clock (move number presses the clock) without clearing CPU messages.
  updateBoard(next, false, { skipCpu: true });

  if (atEnd || document.activeElement === elements.moves) {
    const caret = next.length;
    elements.moves.setSelectionRange(caret, caret);
  }
}

function gameForPly(movesText, ply) {
  if (ply == null) {
    return renderGame(movesText);
  }
  return renderGame(movesText, { ply });
}

async function updateBoard(moves, announce = true, {
  skipCpu = false,
  fromReplay = false,
  animateMove = null,
  replayGeneration = null,
  statusNote = '',
} = {}) {
  state.draft = moves;
  localStorage.setItem(STORAGE_KEYS.draft, moves);

  try {
    const fullGame = renderGame(moves);
    if (fromReplay && replayGeneration != null && replayGeneration !== state.replay.generation) {
      return;
    }
    const previousFullCount = state.fullGame?.moveCount ?? 0;
    const previousViewPly = currentViewPly(state.fullGame);
    state.fullGame = fullGame;

    if (!fromReplay) {
      state.replay.ply = null;
      stopReplayPlayback();
    } else if (state.replay.ply != null) {
      state.replay.ply = Math.min(state.replay.ply, fullGame.moveCount);
      if (state.replay.ply >= fullGame.moveCount) {
        state.replay.ply = null;
      }
    }

    const viewPly = currentViewPly(fullGame);
    const displayGame = gameForPly(moves, state.replay.ply == null ? null : viewPly);

    let moveToAnimate = animateMove;

    // Detect a single forward ply for live notation / CPU replies.
    if (!moveToAnimate && !fromReplay) {
      const prevSans = state.game?.appliedMoves ?? [];
      if (
        isViewingLive(fullGame)
        && fullGame.moveCount === prevSans.length + 1
        && fullGame.appliedMoves.slice(0, -1).every((san, index) => san === prevSans[index])
      ) {
        moveToAnimate = fullGame.history[fullGame.history.length - 1] ?? null;
      }
    }

    if (!moveToAnimate && fromReplay && viewPly === previousViewPly + 1) {
      moveToAnimate = fullGame.history[previousViewPly] ?? null;
    }

    if (fromReplay && replayGeneration != null && replayGeneration !== state.replay.generation) {
      return;
    }

    await paintGame(displayGame, {
      skipCpu,
      animateMove: moveToAnimate,
      syncClock: !fromReplay || isViewingLive(fullGame),
      previousMoveCount: previousFullCount,
    });
    queueShareHash(fullGame.normalizedInput || moves);

    if (statusNote) {
      setFeedback(statusNote);
    } else if (announce) {
      setFeedback('Board updated.');
    } else if (!state.cpu.enabled && !fromReplay) {
      elements.feedback.textContent = '';
      elements.feedback.classList.remove('is-error');
    }
  } catch (error) {
    // Keep last good position; still handle notation clock presses from raw text.
    clearTimeout(state.moveNumberPrimeTimer);
    state.moveNumberPrimeTimer = null;
    if (state.cpu.enabled) {
      cancelCpuSearch();
    }
    syncClockFromNotation(moves, state.fullGame);
    setFeedback(error.message, true);
  }
}

async function seekReplay(ply, { animate = true } = {}) {
  stopReplayPlayback();
  let fullGame;
  try {
    fullGame = renderGame(elements.moves.value);
  } catch (error) {
    setFeedback(error.message, true);
    return;
  }

  state.fullGame = fullGame;
  const target = Math.max(0, Math.min(ply, fullGame.moveCount));
  const previousPly = currentViewPly(fullGame);
  state.replay.ply = target >= fullGame.moveCount ? null : target;

  const moveToAnimate = animate && target === previousPly + 1
    ? fullGame.history[previousPly] ?? null
    : null;

  await updateBoard(elements.moves.value, false, {
    skipCpu: true,
    fromReplay: true,
    animateMove: moveToAnimate,
  });
}

async function stepReplay(delta) {
  const fullCount = state.fullGame?.moveCount ?? 0;
  const next = currentViewPly(state.fullGame) + delta;
  await seekReplay(next, { animate: delta === 1 });
  if (next >= fullCount) {
    stopReplayPlayback();
  }
}

function scheduleReplayTick() {
  if (!state.replay.playing) {
    return;
  }
  const generation = state.replay.generation;
  state.replay.timer = window.setTimeout(async () => {
    if (!state.replay.playing || generation !== state.replay.generation) {
      return;
    }
    const ply = currentViewPly(state.fullGame);
    const total = state.fullGame?.moveCount ?? 0;
    if (ply >= total) {
      stopReplayPlayback({ finished: true });
      return;
    }
    state.replay.ply = ply + 1 >= total ? null : ply + 1;
    const move = state.fullGame.history[ply] ?? null;
    await updateBoard(elements.moves.value, false, {
      skipCpu: true,
      fromReplay: true,
      animateMove: move,
      replayGeneration: generation,
    });
    if (!state.replay.playing || generation !== state.replay.generation) {
      return;
    }
    if (currentViewPly(state.fullGame) >= (state.fullGame?.moveCount ?? 0)) {
      stopReplayPlayback({ finished: true });
      return;
    }
    scheduleReplayTick();
  }, Math.max(state.replay.speedMs, SLIDE_DURATION_MS + 80));
}

async function startReplayPlayback({ fromStart = false } = {}) {
  let fullGame;
  try {
    fullGame = renderGame(elements.moves.value);
  } catch (error) {
    setFeedback(error.message, true);
    return false;
  }
  state.fullGame = fullGame;

  if (!fullGame.moveCount) {
    setFeedback('Add moves before playing the game.', true);
    return false;
  }

  stopReplayPlayback();

  if (fromStart || isViewingLive(fullGame)) {
    state.replay.ply = 0;
    await updateBoard(elements.moves.value, false, {
      skipCpu: true,
      fromReplay: true,
      animateMove: null,
    });
  }

  state.replay.playing = true;
  paintReplayUi();
  scheduleReplayTick();
  return true;
}

async function toggleReplayPlayback() {
  if (state.replay.playing) {
    stopReplayPlayback();
    return;
  }
  const started = await startReplayPlayback({ fromStart: isViewingLive() });
  if (started) {
    setFeedback('Playing game…');
  }
}

function setReplaySpeed(value) {
  state.replay.speedMs = resolveReplaySpeed(value);
  localStorage.setItem(STORAGE_KEYS.replaySpeed, String(state.replay.speedMs));
  paintReplayUi();
}

async function copyShareLink() {
  const url = buildShareUrl(elements.moves.value);
  try {
    writeShareHash(elements.moves.value);
    await navigator.clipboard.writeText(url);
    setFeedback('Share link copied to the clipboard.');
  } catch {
    setFeedback('Could not copy the share link in this browser.', true);
  }
}

function loadMovesFromShareLocation() {
  const encoded = parseShareLocation();
  if (encoded == null) {
    return null;
  }
  try {
    return decodeMovetext(encoded);
  } catch {
    setFeedback('Could not decode the shared game from the URL.', true);
    return null;
  }
}

/**
 * Load movetext from a share link: reset to the start position and autoplay.
 */
async function openSharedGame(moves, {
  autoplay = true,
  feedback = 'Playing shared game…',
} = {}) {
  const text = String(moves ?? '');
  state.cpu.tossId += 1;
  state.cpu.tossing = false;
  state.cpu.matchStarted = false;
  state.session = text.trim() ? 'live' : 'setup';
  state.offerCoaching = !text.trim();
  elements.moves.value = text;
  state.draft = text;
  localStorage.setItem(STORAGE_KEYS.draft, text);

  if (state.cpu.enabled) {
    cancelCpuSearch();
  }

  stopReplayPlayback();
  state.replay.ply = 0;
  writeShareHash(text);

  try {
    renderGame(text);
  } catch (error) {
    setFeedback(error.message, true);
    await updateBoard(text, false, { skipCpu: true });
    return false;
  }

  await updateBoard(text, false, {
    skipCpu: true,
    fromReplay: true,
    animateMove: null,
  });

  if (!autoplay) {
    setFeedback(feedback || 'Loaded shared board from the link.');
    return true;
  }

  if (!state.fullGame?.moveCount) {
    setFeedback('Shared link loaded an empty board.');
    return true;
  }

  const started = await startReplayPlayback({ fromStart: true });
  if (started) {
    state.replay.announceFinish = true;
    setFeedback(feedback);
  }
  return started;
}

function queueLiveRender() {
  pauseClockForTyping();
  clearTimeout(state.requestTimer);
  state.requestTimer = window.setTimeout(() => {
    updateBoard(elements.moves.value, false);
  }, 180);
}

function upsertSavedGame(name, moves, game) {
  const savedGames = loadSavedGames();
  const nextGame = {
    name,
    moves,
    fen: game.fen,
    moveCount: game.moveCount,
    updatedAt: new Date().toISOString(),
  };
  const existingIndex = savedGames.findIndex((item) => item.name === name);
  if (existingIndex >= 0) {
    savedGames[existingIndex] = nextGame;
  } else {
    savedGames.unshift(nextGame);
  }
  persistSavedGames(savedGames);
  drawSavedGames();
}

function removeSavedGame(name) {
  const savedGames = loadSavedGames().filter((game) => game.name !== name);
  persistSavedGames(savedGames);
  drawSavedGames();
}

function drawSavedGames() {
  const savedGames = loadSavedGames();
  if (!savedGames.length) {
    elements.savedGames.innerHTML = '<p class="saved-game empty-save"><span>No local saves yet.</span></p>';
    return;
  }

  elements.savedGames.innerHTML = savedGames
    .map(
      (game) => `
        <article class="saved-game">
          <header>
            <strong>${escapeHtml(game.name)}</strong>
            <small>${formatTimestamp(game.updatedAt)}</small>
          </header>
          <small>${escapeHtml(game.moveCount)} moves · ${escapeHtml(game.fen)}</small>
          <div class="saved-game-actions">
            <button type="button" class="button ghost" data-load="${escapeHtml(game.name)}">Load</button>
            <button type="button" class="button ghost" data-delete="${escapeHtml(game.name)}">Delete</button>
          </div>
        </article>
      `,
    )
    .join('');
}

async function copyNotation() {
  try {
    await navigator.clipboard.writeText(elements.moves.value);
    setFeedback('Notation copied to the clipboard.');
  } catch {
    setFeedback('Clipboard access is not available in this browser.', true);
  }
}

function loadDemo() {
  openSharedGame(DEMO_MOVES, {
    autoplay: true,
    feedback: 'Playing demo…',
  });
  elements.moves.focus();
}

function syncBoardExtrasDisclosure() {
  const extras = document.querySelector('.board-extras');
  if (!(extras instanceof HTMLDetailsElement)) {
    return;
  }
  // Desktop: keep FEN/move list expanded. Mobile: collapse so board + input share the viewport.
  extras.open = !window.matchMedia('(max-width: 800px)').matches;
}

const stackedLayoutQuery = window.matchMedia('(max-width: 800px)');
let editingScrollY = 0;
let keyboardFitFrame = 0;

function lockEditingScroll() {
  if (document.body.dataset.scrollLocked === '1') {
    return;
  }
  editingScrollY = window.scrollY || 0;
  document.body.dataset.scrollLocked = '1';
  document.body.style.position = 'fixed';
  document.body.style.top = `-${editingScrollY}px`;
  document.body.style.left = '0';
  document.body.style.right = '0';
  document.body.style.width = '100%';
}

function unlockEditingScroll() {
  if (document.body.dataset.scrollLocked !== '1') {
    return;
  }
  document.body.dataset.scrollLocked = '';
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  document.body.style.width = '';
  window.scrollTo(0, editingScrollY);
}

/**
 * While the moves field is focused on a phone, pin the board and the field to the
 * visible viewport (the area above the keyboard) and make the board the largest
 * square that still leaves the field on screen.
 */
function fitEditingBoard() {
  const root = document.documentElement;
  const editing = document.body.classList.contains('is-editing-moves');
  if (!editing || !stackedLayoutQuery.matches) {
    root.style.removeProperty('--vv-height');
    root.style.removeProperty('--vv-offset');
    root.style.removeProperty('--editing-board');
    return;
  }

  const viewport = window.visualViewport;
  const visible = Math.round(viewport?.height ?? window.innerHeight);
  const offset = Math.round(viewport?.offsetTop ?? 0);
  root.style.setProperty('--vv-height', `${visible}px`);
  root.style.setProperty('--vv-offset', `${offset}px`);

  const stage = document.getElementById('board-stage');
  const notation = document.getElementById('notation-dock');
  const board = elements.board;
  const play = stage?.parentElement;
  if (!stage || !notation || !board || !play) {
    return;
  }

  const playStyle = getComputedStyle(play);
  const stageStyle = getComputedStyle(stage);
  const stageGap = Number.parseFloat(stageStyle.rowGap || stageStyle.gap) || 0;
  let used = Number.parseFloat(playStyle.paddingTop) + Number.parseFloat(playStyle.paddingBottom);
  used += Number.parseFloat(stageStyle.paddingTop) + Number.parseFloat(stageStyle.paddingBottom);
  used += notation.offsetHeight;

  let visibleStageChildren = 0;
  for (const child of stage.children) {
    if (getComputedStyle(child).display === 'none') {
      continue;
    }
    visibleStageChildren += 1;
    if (child.contains(board)) {
      const layoutStyle = getComputedStyle(child);
      const layoutGap = Number.parseFloat(layoutStyle.rowGap || layoutStyle.gap) || 0;
      let sideParts = 0;
      for (const part of child.children) {
        if (part === board || part.contains(board) || getComputedStyle(part).display === 'none') {
          continue;
        }
        used += part.offsetHeight;
        sideParts += 1;
      }
      if (sideParts) {
        used += layoutGap * sideParts;
      }
    } else {
      used += child.offsetHeight;
    }
  }
  if (visibleStageChildren > 1) {
    used += stageGap * (visibleStageChildren - 1);
  }

  const column = stage.clientWidth
    - (Number.parseFloat(stageStyle.paddingLeft) || 0)
    - (Number.parseFloat(stageStyle.paddingRight) || 0);
  const available = visible - used - 12;
  const size = Math.max(140, Math.min(Math.floor(column), Math.floor(available)));
  root.style.setProperty('--editing-board', `${size}px`);
}

function scheduleKeyboardFit() {
  if (keyboardFitFrame) {
    return;
  }
  keyboardFitFrame = window.requestAnimationFrame(() => {
    keyboardFitFrame = 0;
    fitEditingBoard();
  });
}

function beginEditingMoves() {
  document.body.classList.add('is-editing-moves');
  if (stackedLayoutQuery.matches) {
    lockEditingScroll();
  }
  scheduleKeyboardFit();
}

function endEditingMoves() {
  document.body.classList.remove('is-editing-moves');
  unlockEditingScroll();
  scheduleKeyboardFit();
}

function pieceOnSquare(game, square) {
  for (const row of game?.board ?? []) {
    for (const cell of row) {
      if (cell.square === square) {
        return cell.piece;
      }
    }
  }
  return null;
}

function clearLift() {
  state.boardInput.from = null;
  state.boardInput.moves = [];
  state.boardInput.promotion = null;
  state.boardInput.fen = null;
  elements.board?.querySelectorAll('.is-lifted, .is-move-target, .is-capture-target').forEach((node) => {
    node.classList.remove('is-lifted', 'is-move-target', 'is-capture-target');
  });
  hidePromotionPicker();
}

function hidePromotionPicker() {
  if (!elements.promotionPicker) {
    return;
  }
  elements.promotionPicker.hidden = true;
  elements.promotionPicker.innerHTML = '';
}

function paintClickMode() {
  elements.board?.classList.toggle('is-click-mode', state.clickMoves);
  if (!elements.clickMoves) {
    return;
  }
  elements.clickMoves.setAttribute('aria-pressed', state.clickMoves ? 'true' : 'false');
  elements.clickMoves.title = state.clickMoves
    ? 'On: click a piece to lift it, then click a square to place it. Notation fills in as you move.'
    : 'Off: type notation only. Turn on to lift and place pieces.';
}

function paintBoardSelection() {
  elements.board?.classList.toggle('is-click-mode', state.clickMoves);
  elements.board?.querySelectorAll('.is-lifted, .is-move-target, .is-capture-target').forEach((node) => {
    node.classList.remove('is-lifted', 'is-move-target', 'is-capture-target');
  });
  const from = state.boardInput.from;
  if (!from) {
    hidePromotionPicker();
    return;
  }
  squareNode(from)?.classList.add('is-lifted');
  const seen = new Set();
  state.boardInput.moves.forEach((move) => {
    if (seen.has(move.to)) {
      return;
    }
    seen.add(move.to);
    squareNode(move.to)?.classList.add(move.captured ? 'is-capture-target' : 'is-move-target');
  });
  paintPromotionPicker();
}

function syncLiftAfterRender(game) {
  elements.board?.classList.toggle('is-click-mode', state.clickMoves);
  if (!state.boardInput.from) {
    hidePromotionPicker();
    return;
  }
  if (!state.clickMoves || state.boardInput.fen !== game?.fen) {
    clearLift();
    return;
  }
  paintBoardSelection();
}

function paintPromotionPicker() {
  const picker = elements.promotionPicker;
  const pending = state.boardInput.promotion;
  if (!picker || !pending) {
    hidePromotionPicker();
    return;
  }
  const color = state.game?.turn === 'black' ? 'black' : 'white';
  const labels = { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' };
  const types = [];
  pending.options.forEach((option) => {
    if (option.promotion && !types.includes(option.promotion)) {
      types.push(option.promotion);
    }
  });
  const order = ['q', 'r', 'b', 'n'];
  types.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  picker.hidden = false;
  picker.innerHTML = types.map((type) => `
    <button type="button" class="promotion-choice" data-promotion="${type}" aria-label="Promote to ${labels[type] || type}">
      ${renderPieceSvg(type, color, state.pieceSet, state.piecePalette)}
    </button>
  `).join('');
}

function setClickMoves(enabled) {
  state.clickMoves = Boolean(enabled);
  localStorage.setItem(STORAGE_KEYS.clickMoves, state.clickMoves ? '1' : '0');
  if (!state.clickMoves) {
    clearLift();
  }
  paintClickMode();
}

async function commitBoardMove(game, move) {
  // Leave the lifted piece in place so the glide starts from the raised position.
  // The new position's render drops the selection because the FEN changed.
  hidePromotionPicker();
  state.boardInput.promotion = null;
  const nextMoves = appendSanToMovetext(game.appliedMoves, move.san);
  elements.moves.value = nextMoves;
  const caret = nextMoves.length;
  elements.moves.setSelectionRange(caret, caret);
  await updateBoard(nextMoves, false, { statusNote: move.san });
}

async function choosePromotion(type) {
  const pending = state.boardInput.promotion;
  if (!pending) {
    return;
  }
  const move = pending.options.find((option) => option.promotion === type) || pending.options[0];
  let game;
  try {
    game = renderGame(elements.moves.value);
  } catch (error) {
    clearLift();
    setFeedback(error.message, true);
    return;
  }
  await commitBoardMove(game, move);
}

async function placeOrLift(square) {
  if (!canPlayMoves()) {
    return;
  }
  if (state.lessonPreview) {
    setFeedback('This is a lesson preview. Go back to the game, or press Play, before moving a piece.', true);
    return;
  }
  if (!state.clickMoves || state.animating || state.cpu.thinking || state.cpu.tossing) {
    return;
  }
  if (!isViewingLive()) {
    setFeedback('Return to the latest move before playing on the board.', true);
    return;
  }

  clearTimeout(state.requestTimer);
  let game;
  try {
    game = renderGame(elements.moves.value);
  } catch {
    setFeedback('Fix the notation before moving on the board.', true);
    return;
  }
  if (game.fen !== state.game?.fen) {
    await updateBoard(elements.moves.value, false, { skipCpu: true, statusNote: 'Board matched the notation. Click a piece to move.' });
    return;
  }
  if (game.isGameOver) {
    setFeedback(game.status, true);
    return;
  }
  if (state.cpu.enabled && state.cpu.humanSide && game.turn !== state.cpu.humanSide) {
    setFeedback('The CPU is to move.', true);
    return;
  }

  const lifted = state.boardInput.from;
  if (lifted && state.boardInput.fen === game.fen) {
    const options = state.boardInput.moves.filter((move) => move.to === square);
    if (options.length > 1) {
      state.boardInput.promotion = { to: square, options };
      paintPromotionPicker();
      return;
    }
    if (options.length === 1) {
      await commitBoardMove(game, options[0]);
      return;
    }
    if (square === lifted) {
      clearLift();
      return;
    }
  }

  const piece = pieceOnSquare(game, square);
  if (!piece || piece.color !== game.turn) {
    if (lifted) {
      clearLift();
    }
    return;
  }
  const moves = legalMovesFromSquare(game.fen, square);
  if (!moves.length) {
    clearLift();
    setFeedback('That piece has no legal move.', true);
    return;
  }
  state.boardInput.from = square;
  state.boardInput.moves = moves;
  state.boardInput.promotion = null;
  state.boardInput.fen = game.fen;
  paintBoardSelection();
}

function lessonContext() {
  const liveGame = state.fullGame?.fen ? state.fullGame : state.game;
  const history = liveGame?.history ?? [];
  const lastMove = history.length ? history[history.length - 1] : null;
  return {
    fen: liveGame?.fen,
    status: liveGame?.status,
    isGameOver: Boolean(liveGame?.isGameOver),
    isCheckmate: Boolean(liveGame?.isCheckmate),
    turn: liveGame?.turn,
    sans: liveGame?.appliedMoves ?? [],
    sideNames: getPaletteSideNames(state.piecePalette),
    lastMove,
    live: isViewingLive(),
    offerCoaching: state.offerCoaching,
    gameStarted: state.session === 'live' || state.session === 'paused',
    paused: state.session === 'paused',
    cpu: {
      enabled: state.cpu.enabled,
      thinking: state.cpu.thinking,
      tossing: state.cpu.tossing,
      humanSide: state.cpu.humanSide,
      cpuSide: state.cpu.cpuSide,
    },
  };
}

function notifyLessons() {
  lessons?.sync(lessonContext());
}

function showLessonPreview(payload) {
  if (!payload?.game) {
    return;
  }
  state.lessonPreview = payload;
  stopReplayPlayback();
  clearLift();
  renderBoard(payload.game, { settle: false });
  elements.board?.classList.add('is-lesson-preview');
  if (payload.from) {
    squareNode(payload.from)?.classList.add('is-coach-source');
  }
  if (payload.to) {
    squareNode(payload.to)?.classList.add('is-coach-target');
  }
  if (elements.lessonBanner) {
    elements.lessonBanner.hidden = false;
    elements.lessonBanner.textContent = payload.banner || 'Lesson line — nothing here is played until you choose it.';
  }
}

function hideLessonPreview({ restore = true } = {}) {
  state.lessonPreview = null;
  elements.board?.classList.remove('is-lesson-preview');
  if (elements.lessonBanner) {
    elements.lessonBanner.hidden = true;
  }
  if (restore && state.game?.board) {
    renderBoard(state.game, { settle: false });
  }
}

async function playLessonMove(san) {
  if (!canPlayMoves()) {
    return;
  }
  clearTimeout(state.requestTimer);
  let game;
  try {
    game = renderGame(elements.moves.value);
  } catch (error) {
    setFeedback(error.message, true);
    return;
  }
  if (!isViewingLive()) {
    setFeedback('Return to the latest move before playing.', true);
    return;
  }
  if (game.isGameOver) {
    setFeedback(game.status, true);
    return;
  }
  if (state.cpu.enabled && state.cpu.humanSide && game.turn !== state.cpu.humanSide) {
    setFeedback('The CPU is to move.', true);
    return;
  }
  try {
    renderLine(game.fen, [san]);
  } catch {
    setFeedback(`${san} is not legal in this position.`, true);
    return;
  }
  const nextMoves = appendSanToMovetext(game.appliedMoves, san);
  elements.moves.value = nextMoves;
  const caret = nextMoves.length;
  elements.moves.setSelectionRange(caret, caret);
  await updateBoard(nextMoves, false, { statusNote: san });
}

function bindEvents() {
  elements.renderForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!notationChangeAllowed() || state.session !== 'live') {
      if (state.session !== 'live') {
        setFeedback('Press Start game before rendering moves.', true);
      }
      return;
    }
    updateBoard(elements.moves.value, true);
  });

  elements.moves.addEventListener('input', () => {
    if (!notationChangeAllowed()) {
      return;
    }
    queueLiveRender();
    scheduleKeyboardFit();
  });
  elements.moves.addEventListener('focus', beginEditingMoves);
  elements.moves.addEventListener('blur', endEditingMoves);
  window.visualViewport?.addEventListener('resize', scheduleKeyboardFit);
  window.visualViewport?.addEventListener('scroll', scheduleKeyboardFit);
  window.addEventListener('resize', scheduleKeyboardFit);
  elements.themeSelect.addEventListener('change', (event) => applyTheme(event.target.value));
  elements.pieceSetSelect.addEventListener('change', (event) => applyPieceSet(event.target.value));
  elements.piecePaletteSelect.addEventListener('change', (event) => applyPiecePalette(event.target.value));
  elements.piecePaletteSwatches?.addEventListener('click', (event) => {
    const target = event.target.closest('[data-palette]');
    if (!(target instanceof HTMLElement) || !target.dataset.palette) {
      return;
    }
    applyPiecePalette(target.dataset.palette);
  });
  elements.clockPreset.addEventListener('change', (event) => applyClockPreset(event.target.value));
  elements.clockMode.addEventListener('change', (event) => applyClockMode(event.target.value));
  elements.clockReset.addEventListener('click', resetClock);
  elements.newBoard?.addEventListener('click', newBoard);
  elements.newGame.addEventListener('click', () => {
    newGame();
  });
  elements.startGame?.addEventListener('click', () => {
    beginGame();
  });
  elements.pauseGame?.addEventListener('click', () => {
    if (state.session === 'paused') {
      resumeGame();
      return;
    }
    pauseGame();
  });
  elements.resumeGame?.addEventListener('click', resumeGame);
  elements.pauseNewBoard?.addEventListener('click', newBoard);
  elements.flipBoard?.addEventListener('click', () => setBoardFlipped(!state.flipped));
  elements.clickMoves?.addEventListener('click', () => setClickMoves(!state.clickMoves));
  elements.board?.addEventListener('click', (event) => {
    const squareEl = event.target.closest('[data-square]');
    if (!(squareEl instanceof HTMLElement) || !squareEl.dataset.square) {
      return;
    }
    placeOrLift(squareEl.dataset.square);
  });
  elements.board?.addEventListener('contextmenu', (event) => {
    if (!state.clickMoves || !state.boardInput.from) {
      return;
    }
    event.preventDefault();
    clearLift();
  });
  elements.promotionPicker?.addEventListener('click', (event) => {
    const choice = event.target.closest('[data-promotion]');
    if (!(choice instanceof HTMLElement) || !choice.dataset.promotion) {
      return;
    }
    choosePromotion(choice.dataset.promotion);
  });
  window.addEventListener('keydown', (event) => {
    const typing = event.target === elements.moves
      || event.target instanceof HTMLInputElement
      || event.target instanceof HTMLTextAreaElement
      || event.target instanceof HTMLSelectElement;
    if (event.key === 'Escape' && state.session === 'paused' && !typing) {
      resumeGame();
      return;
    }
    if (event.key === 'Escape' && state.lessonPreview && !typing) {
      lessons?.exitPreview();
      return;
    }
    if (!typing && state.lessonPreview && event.key === 'ArrowRight') {
      lessons?.step(1);
      event.preventDefault();
      return;
    }
    if (!typing && state.lessonPreview && event.key === 'ArrowLeft') {
      lessons?.step(-1);
      event.preventDefault();
      return;
    }
    if (event.key === 'Escape' && state.boardInput.from) {
      clearLift();
    }
  });
  elements.copyPgn.addEventListener('click', copyNotation);
  elements.shareLink?.addEventListener('click', copyShareLink);
  elements.loadDemo?.addEventListener('click', loadDemo);

  elements.replayFirst?.addEventListener('click', () => seekReplay(0, { animate: false }));
  elements.replayPrev?.addEventListener('click', () => stepReplay(-1));
  elements.replayNext?.addEventListener('click', () => stepReplay(1));
  elements.replayLast?.addEventListener('click', () => {
    const total = state.fullGame?.moveCount ?? 0;
    seekReplay(total, { animate: false });
  });
  elements.replayPlay?.addEventListener('click', () => toggleReplayPlayback());
  elements.replaySpeed?.addEventListener('change', (event) => setReplaySpeed(event.target.value));

  elements.movesList?.addEventListener('click', (event) => {
    const target = event.target.closest('[data-ply]');
    if (!(target instanceof HTMLElement) || !target.dataset.ply) {
      return;
    }
    const ply = Number(target.dataset.ply);
    if (!Number.isFinite(ply)) {
      return;
    }
    seekReplay(ply, { animate: false });
  });

  window.addEventListener('hashchange', () => {
    const shared = loadMovesFromShareLocation();
    if (shared == null) {
      return;
    }
    openSharedGame(shared, {
      autoplay: true,
      feedback: 'Playing shared game…',
    });
  });

  elements.cpuToggle?.addEventListener('click', () => {
    setCpuEnabled(!state.cpu.enabled);
  });
  elements.cpuLevel?.addEventListener('change', (event) => applyCpuLevel(event.target.value));
  elements.cpuHandicap?.addEventListener('click', () => {
    setCpuHandicap(!state.cpu.handicap);
  });
  elements.cpuNewMatch?.addEventListener('click', () => {
    newGame();
  });

  window.matchMedia('(max-width: 800px)').addEventListener('change', syncBoardExtrasDisclosure);

  document.querySelectorAll('[data-focus-moves]').forEach((node) => {
    node.addEventListener('click', (event) => {
      event.preventDefault();
      elements.moves.focus();
      elements.moves.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });

  elements.saveGame.addEventListener('click', () => {
    const name = elements.saveName.value.trim();
    if (!name) {
      setFeedback('Choose a save name before storing a local game.', true);
      return;
    }
    upsertSavedGame(name, elements.moves.value, state.fullGame);
    setFeedback(`Saved "${name}" to this browser.`);
  });

  elements.savedGames.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    if (target.dataset.load) {
      const game = loadSavedGames().find((item) => item.name === target.dataset.load);
      if (!game) {
        return;
      }
      elements.saveName.value = game.name;
      state.cpu.tossId += 1;
      state.cpu.tossing = false;
      state.cpu.matchStarted = false;
      cancelCpuSearch();
      state.offerCoaching = !String(game.moves || '').trim();
      state.session = String(game.moves || '').trim() ? 'live' : 'setup';
      elements.moves.value = game.moves;
      updateBoard(game.moves, true);
      return;
    }

    if (target.dataset.delete) {
      removeSavedGame(target.dataset.delete);
      setFeedback(`Deleted "${target.dataset.delete}" from this browser.`);
    }
  });
}

function bootstrap() {
  populatePieceControls();
  populateClockControls();
  populateCpuControls();
  applyTheme(state.theme);
  applyPiecePaletteVars(state.piecePalette);
  document.documentElement.dataset.pieceSet = state.pieceSet;
  document.documentElement.dataset.piecePalette = state.piecePalette;
  document.body.dataset.pieceSet = state.pieceSet;
  document.body.dataset.piecePalette = state.piecePalette;
  elements.pieceSetSelect.value = state.pieceSet;
  elements.piecePaletteSelect.value = state.piecePalette;
  if (elements.replaySpeed) {
    elements.replaySpeed.value = String(state.replay.speedMs);
  }

  const sharedMoves = loadMovesFromShareLocation();
  const initialMoves = sharedMoves != null ? sharedMoves : state.draft;
  const opening = String(initialMoves || '');
  state.offerCoaching = !opening.trim();
  state.session = opening.trim() ? 'live' : 'setup';
  elements.moves.value = opening;
  try {
    const loaded = renderGame(opening);
    state.game = loaded;
    state.fullGame = loaded;
  } catch {
    // updateBoard reports the notation error after boot.
  }
  if (sharedMoves != null) {
    state.draft = sharedMoves;
  }

  syncFlipButton();
  paintClickMode();
  syncBoardExtrasDisclosure();
  paintClock();
  lessons = mountLessonPortal({
    getContext: lessonContext,
    onPreview: showLessonPreview,
    onClearPreview: hideLessonPreview,
    onPlayMove: playLessonMove,
  });
  paintGame(state.game, { skipCpu: true });
  paintReplayUi();
  drawSavedGames();
  bindEvents();

  if (sharedMoves != null) {
    openSharedGame(sharedMoves, {
      autoplay: true,
      feedback: 'Playing shared game…',
    });
  } else if (initialMoves) {
    state.clockMoveSig = moveNumberSignature(initialMoves);
    updateBoard(initialMoves, false, { skipCpu: true });
  } else {
    queueShareHash('');
  }

  document.body.classList.add('is-booted');
}

bootstrap();
