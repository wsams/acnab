import { castlingRookMove, emptyGame, formatMovetext, moveNumberSignature, renderGame, sanFromUci } from './engine.js';
import {
  CLOCK_MODES,
  CLOCK_PRESETS,
  ChessClock,
} from './clock.js';
import {
  CPU_LEVELS,
  DEFAULT_CPU_LEVEL,
  StockfishCpu,
  resolveCpuLevel,
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
  replaySpeed: 'acnab:replay-speed',
};

const DEMO_MOVES = '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 b5 5. Bxb5+ Bd7 6. Nc3 f5 7. exf5 g6 8. Qf3 gxf5 9. Qh5#';

const SLIDE_DURATION_MS = 620;
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
  requestTimer: null,
  typingResumeTimer: null,
  shareTimer: null,
  animToken: 0,
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
    humanSide: null,
    cpuSide: null,
    tossing: false,
    thinking: false,
    requestId: 0,
    lastThoughtFen: null,
  },
};

const stockfish = new StockfishCpu();

const elements = {
  board: document.querySelector('#board'),
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
  newGame: document.querySelector('#new-game'),
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
  cpuNewMatch: document.querySelector('#cpu-new-match'),
  cpuMatch: document.querySelector('#cpu-match'),
  coinStage: document.querySelector('#coin-stage'),
  coin: document.querySelector('#coin'),
  coinCaption: document.querySelector('#coin-caption'),
  cpuStatus: document.querySelector('#cpu-status'),
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

function paintCpuUi() {
  const { enabled, tossing, thinking, humanSide, levelId } = state.cpu;
  elements.cpuPanel?.setAttribute('data-enabled', enabled ? 'true' : 'false');
  elements.cpuPanel?.classList.toggle('is-thinking', thinking);
  elements.cpuPanel?.classList.toggle('is-tossing', tossing);

  if (elements.cpuToggle) {
    elements.cpuToggle.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    elements.cpuToggle.textContent = enabled ? 'CPU on' : 'CPU off';
  }
  if (elements.cpuControls) {
    elements.cpuControls.hidden = !enabled;
  }
  if (elements.cpuMatch) {
    elements.cpuMatch.hidden = !enabled;
  }
  if (elements.cpuLevel) {
    elements.cpuLevel.value = levelId;
    elements.cpuLevel.disabled = tossing || thinking;
  }
  if (elements.cpuNewMatch) {
    elements.cpuNewMatch.disabled = tossing || thinking;
  }
  if (elements.cpuToggle) {
    elements.cpuToggle.disabled = tossing;
  }

  if (!enabled) {
    if (elements.cpuStatus) {
      elements.cpuStatus.textContent = '';
    }
    if (elements.coinCaption) {
      elements.coinCaption.textContent = 'Coin toss decides who plays White.';
    }
    elements.coinStage?.classList.remove('is-spinning', 'is-resolved');
    return;
  }

  if (tossing) {
    if (elements.cpuStatus) {
      elements.cpuStatus.textContent = 'Tossing for White…';
    }
    if (elements.coinCaption) {
      elements.coinCaption.textContent = 'Heads: you play White. Tails: CPU plays White.';
    }
    return;
  }

  if (!humanSide) {
    if (elements.cpuStatus) {
      elements.cpuStatus.textContent = 'Start a match to toss for sides.';
    }
    return;
  }

  const level = CPU_LEVELS[levelId];
  if (thinking) {
    elements.cpuStatus.textContent = `Stockfish (${level.label}) is thinking…`;
    return;
  }

  if (state.game?.isGameOver) {
    elements.cpuStatus.textContent = `Match over · you are ${sideLabel(humanSide)}. ${state.game.status}`;
    return;
  }

  if (state.game?.turn === humanSide) {
    elements.cpuStatus.textContent = `Your turn as ${sideLabel(humanSide)} · enter a move in notation.`;
  } else {
    elements.cpuStatus.textContent = `CPU to move as ${sideLabel(state.cpu.cpuSide)}.`;
  }
}

function cancelCpuSearch() {
  state.cpu.requestId += 1;
  state.cpu.thinking = false;
  state.cpu.lastThoughtFen = null;
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

  if (!enabled) {
    cancelCpuSearch();
    state.cpu.enabled = false;
    state.cpu.humanSide = null;
    state.cpu.cpuSide = null;
    state.cpu.tossing = false;
    paintCpuUi();
    setFeedback('CPU player turned off. Notation-only mode.');
    return;
  }

  state.cpu.enabled = true;
  paintCpuUi();
  setFeedback('Loading Stockfish…');
  try {
    await stockfish.applyLevel(state.cpu.levelId);
  } catch (error) {
    state.cpu.enabled = false;
    paintCpuUi();
    setFeedback(error.message || 'Could not start Stockfish in this browser.', true);
    return;
  }

  await startCpuMatch({ announceEngine: false });
}

async function applyCpuLevel(levelId) {
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

async function startCpuMatch({ announceEngine = true } = {}) {
  if (!state.cpu.enabled) {
    return;
  }

  cancelCpuSearch();
  state.cpu.tossing = true;
  state.cpu.humanSide = null;
  state.cpu.cpuSide = null;
  paintCpuUi();

  elements.moves.value = '';
  elements.saveName.value = '';
  state.clockMoveSig = '';
  clock.reset();
  updateBoard('', false, { skipCpu: true });

  elements.coinStage?.classList.remove('is-resolved');
  elements.coinStage?.classList.add('is-spinning');
  if (elements.coin) {
    elements.coin.dataset.face = 'heads';
  }
  if (elements.coinCaption) {
    elements.coinCaption.textContent = 'Heads: you play White. Tails: CPU plays White.';
  }

  const result = await tossCoinForSides({ delayMs: 1500 });
  if (!state.cpu.enabled) {
    return;
  }

  state.cpu.humanSide = result.humanSide;
  state.cpu.cpuSide = result.cpuSide;
  state.cpu.tossing = false;

  if (elements.coin) {
    elements.coin.dataset.face = result.face;
  }
  elements.coinStage?.classList.remove('is-spinning');
  elements.coinStage?.classList.add('is-resolved');

  // Human sits at the near side of the board.
  setBoardFlipped(result.humanSide === 'black');

  const humanName = sideLabel(result.humanSide);
  const faceLabel = result.face === 'heads' ? 'Heads' : 'Tails';
  if (elements.coinCaption) {
    elements.coinCaption.textContent = `${faceLabel}! You play ${humanName}.`;
  }

  paintCpuUi();
  if (announceEngine) {
    setFeedback(`${faceLabel} — you are ${humanName}. Enter moves in notation; Stockfish replies.`);
  } else {
    setFeedback(`${faceLabel} — you are ${humanName}. Stockfish is ready.`);
  }

  maybeRequestCpuMove(state.game);
}

async function maybeRequestCpuMove(game) {
  if (!state.cpu.enabled || state.cpu.tossing || !state.cpu.cpuSide) {
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
  paintCpuUi();

  try {
    const uciMove = await stockfish.chooseMove(game.fen, { levelId: state.cpu.levelId });
    if (requestId !== state.cpu.requestId || !state.cpu.enabled) {
      return;
    }
    if (state.game.fen !== game.fen) {
      return;
    }

    const san = sanFromUci(game.fen, uciMove);
    const nextMoves = formatMovetext([...game.appliedMoves, san]);
    elements.moves.value = nextMoves;
    state.cpu.thinking = false;
    state.cpu.lastThoughtFen = null;
    updateBoard(nextMoves, false, { skipCpu: true });
    setFeedback(`CPU played ${san}.`);
    paintCpuUi();
  } catch (error) {
    if (requestId !== state.cpu.requestId) {
      return;
    }
    state.cpu.thinking = false;
    state.cpu.lastThoughtFen = null;
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
  face.classList.toggle('is-active', snapshot.active === side && snapshot.running);
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
  document.getElementById('clock-panel')?.classList.toggle('is-typing-paused', snapshot.typingPaused);
}

function applyClockPreset(presetId) {
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
    renderBoard(state.game);
  }
}

function applyPieceSet(setId) {
  const nextSet = resolvePieceSet(setId);
  state.pieceSet = nextSet;
  document.documentElement.dataset.pieceSet = nextSet;
  document.body.dataset.pieceSet = nextSet;
  elements.pieceSetSelect.value = nextSet;
  localStorage.setItem(STORAGE_KEYS.pieceSet, nextSet);
  renderBoard(state.game);
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
  renderBoard(state.game);
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
  renderBoard(state.game);
  renderCaptures(state.game);
}

function setFeedback(message, isError = false) {
  elements.feedback.textContent = message;
  elements.feedback.classList.toggle('is-error', isError);
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
  document.querySelectorAll('.piece-flyer').forEach((node) => node.remove());
}

function squareNode(square) {
  return elements.board.querySelector(`[data-square="${square}"]`);
}

function pieceSlotRect(squareEl) {
  const rect = squareEl.getBoundingClientRect();
  const size = Math.min(rect.width, rect.height) * 0.84;
  return {
    left: rect.left + ((rect.width - size) / 2),
    top: rect.top + ((rect.height - size) / 2),
    width: size,
    height: size,
  };
}

function createPieceFlyer(pieceEl, fromRect) {
  const flyer = pieceEl.cloneNode(true);
  flyer.classList.add('piece-flyer');
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
  const animation = flyer.animate(
    [
      { transform: 'translate(0px, 0px)' },
      { transform: `translate(${dx}px, ${dy}px)` },
    ],
    {
      duration: durationMs,
      easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
      fill: 'forwards',
    },
  );
  return animation.finished.catch(() => {});
}

function playLandingSplash(square) {
  if (!square || prefersReducedMotion()) {
    return;
  }
  const target = squareNode(square);
  if (!target) {
    return;
  }
  target.classList.remove('is-splash');
  void target.offsetWidth;
  target.classList.add('is-splash');
  window.setTimeout(() => {
    target.classList.remove('is-splash');
  }, 480);
}

function renderBoard(game, { hidePieces = null, animating = false } = {}) {
  const hidden = hidePieces instanceof Set ? hidePieces : new Set(hidePieces ?? []);
  const squares = [];
  const files = state.flipped
    ? ['H', 'G', 'F', 'E', 'D', 'C', 'B', 'A']
    : ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const rows = state.flipped
    ? game.board.map((row) => [...row].reverse()).reverse()
    : game.board;

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
      const label = piece
        ? `${piece.color} ${piece.name} on ${square.square}`
        : `empty ${square.square}`;
      const pieceClass = piece ? ` has-piece ${piece.color}` : '';
      squares.push(`
        <div
          class="board-square board-cell ${square.isLight ? 'light' : 'dark'}${pieceClass}"
          data-square="${escapeHtml(square.square)}"
          aria-label="${escapeHtml(label)}"
        >
          ${pieceMarkup}
          <span class="coordinate">${escapeHtml(square.square)}</span>
        </div>
      `);
    });
  });

  elements.board.classList.toggle('is-animating', animating);
  elements.board.innerHTML = squares.join('');
  elements.board.classList.remove('is-updating');
  if (!animating) {
    void elements.board.offsetWidth;
    elements.board.classList.add('is-ready');
  } else {
    elements.board.classList.add('is-ready');
  }
}

async function animateBoardMove(move, nextGame) {
  if (!move || prefersReducedMotion()) {
    renderBoard(nextGame);
    playLandingSplash(move?.to);
    return;
  }

  const fromSquare = squareNode(move.from);
  const toSquare = squareNode(move.to);
  const movingPiece = fromSquare?.querySelector('.piece');
  if (!fromSquare || !toSquare || !movingPiece) {
    renderBoard(nextGame);
    playLandingSplash(move?.to);
    return;
  }

  const token = state.animToken + 1;
  state.animToken = token;
  clearPieceFlyers();

  const fromRect = pieceSlotRect(fromSquare);
  const toRect = pieceSlotRect(toSquare);
  const flyer = createPieceFlyer(movingPiece, fromRect);
  movingPiece.classList.add('is-hidden-for-anim');

  const rookMove = castlingRookMove(move);
  let rookFlyer = null;
  let rookFromRect = null;
  let rookToRect = null;
  if (rookMove) {
    const rookFrom = squareNode(rookMove.from);
    const rookTo = squareNode(rookMove.to);
    const rookPiece = rookFrom?.querySelector('.piece');
    if (rookFrom && rookTo && rookPiece) {
      rookFromRect = pieceSlotRect(rookFrom);
      rookToRect = pieceSlotRect(rookTo);
      rookFlyer = createPieceFlyer(rookPiece, rookFromRect);
      rookPiece.classList.add('is-hidden-for-anim');
    }
  }

  const hidePieces = new Set([move.to]);
  if (rookMove) {
    hidePieces.add(rookMove.to);
  }
  renderBoard(nextGame, { hidePieces, animating: true });

  // Re-measure destination after layout in case the board shifted.
  const nextTo = squareNode(move.to);
  const finalToRect = nextTo ? pieceSlotRect(nextTo) : toRect;
  const animations = [animateFlyerTo(flyer, fromRect, finalToRect, SLIDE_DURATION_MS)];
  if (rookFlyer && rookFromRect && rookMove) {
    const nextRookTo = squareNode(rookMove.to);
    const finalRookRect = nextRookTo ? pieceSlotRect(nextRookTo) : rookToRect;
    animations.push(animateFlyerTo(rookFlyer, rookFromRect, finalRookRect, SLIDE_DURATION_MS));
  }

  await Promise.all(animations);
  flyer.remove();
  rookFlyer?.remove();

  if (token !== state.animToken) {
    return;
  }

  renderBoard(nextGame, { animating: false });
  playLandingSplash(move.to);
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
  elements.status.textContent = game.status;
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
  state.game = game;

  if (animateMove) {
    await animateBoardMove(animateMove, game);
  } else {
    state.animToken += 1;
    clearPieceFlyers();
    renderBoard(game);
  }

  renderCaptures(game);
  renderMoves(game, state.fullGame);
  renderStatus(game);
  paintReplayUi();

  if (syncClock && isViewingLive()) {
    syncClockFromNotation(elements.moves.value, state.fullGame, { previousMoveCount: priorCount });
  }

  if (!skipCpu && isViewingLive()) {
    maybeRequestCpuMove(state.fullGame);
  } else {
    paintCpuUi();
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

    if (announce) {
      setFeedback('Board updated.');
    } else if (!state.cpu.enabled && !fromReplay) {
      elements.feedback.textContent = '';
      elements.feedback.classList.remove('is-error');
    }
  } catch (error) {
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

function resetBoard() {
  if (state.cpu.enabled) {
    startCpuMatch();
    return;
  }
  elements.moves.value = '';
  elements.saveName.value = '';
  state.clockMoveSig = '';
  clock.reset();
  updateBoard('', true);
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

function bindEvents() {
  elements.renderForm.addEventListener('submit', (event) => {
    event.preventDefault();
    updateBoard(elements.moves.value, true);
  });

  elements.moves.addEventListener('input', queueLiveRender);
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
  elements.newGame.addEventListener('click', resetBoard);
  elements.flipBoard?.addEventListener('click', () => setBoardFlipped(!state.flipped));
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
  elements.cpuNewMatch?.addEventListener('click', () => startCpuMatch());

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
  elements.moves.value = initialMoves;
  if (sharedMoves != null) {
    state.draft = sharedMoves;
  }

  syncFlipButton();
  paintClock();
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
