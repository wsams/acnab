import { emptyGame, formatMovetext, moveNumberSignature, renderGame, sanFromUci } from './engine.js';
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
};

const DEMO_MOVES = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7';

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
  moveNumberPrimeTimer: null,
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
  saveGame: document.querySelector('#save-game'),
  loadDemo: document.querySelector('#load-demo'),
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
  clearTimeout(state.moveNumberPrimeTimer);
  state.moveNumberPrimeTimer = null;
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
  syncFlipButton();
  renderBoard(state.game);
  renderCaptures(state.game);
}

function setFeedback(message, isError = false) {
  elements.feedback.textContent = message;
  elements.feedback.classList.toggle('is-error', isError);
}

function renderBoard(game) {
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
      const pieceMarkup = piece
        ? `<span class="piece ${piece.color}" aria-hidden="true">${renderPieceSvg(piece.type, piece.color, state.pieceSet, state.piecePalette)}</span>`
        : '';
      const label = piece
        ? `${piece.color} ${piece.name} on ${square.square}`
        : `empty ${square.square}`;
      const pieceClass = piece ? ` has-piece ${piece.color}` : '';
      squares.push(`
        <div class="board-square board-cell ${square.isLight ? 'light' : 'dark'}${pieceClass}" aria-label="${escapeHtml(label)}">
          ${pieceMarkup}
          <span class="coordinate">${escapeHtml(square.square)}</span>
        </div>
      `);
    });
  });

  elements.board.innerHTML = squares.join('');
  elements.board.classList.remove('is-updating');
  void elements.board.offsetWidth;
  elements.board.classList.add('is-ready');
}

function renderMoves(game) {
  if (!game.appliedMoves.length) {
    elements.movesList.innerHTML = '<li>Start position</li>';
    return;
  }

  const entries = [];
  for (let index = 0; index < game.appliedMoves.length; index += 2) {
    const turn = Math.floor(index / 2) + 1;
    const white = game.appliedMoves[index];
    const black = game.appliedMoves[index + 1];
    entries.push(
      black
        ? `<li>${turn}. ${escapeHtml(white)} ${escapeHtml(black)}</li>`
        : `<li>${turn}. ${escapeHtml(white)}</li>`,
    );
  }
  elements.movesList.innerHTML = entries.join('');
}

function renderStatus(game) {
  elements.status.textContent = game.status;
  elements.fen.textContent = game.fen;
  elements.moveCount.textContent = String(game.moveCount);
}

function paintGame(game, { skipCpu = false } = {}) {
  const previousMoveCount = state.game?.moveCount ?? 0;
  state.game = game;
  renderBoard(game);
  renderCaptures(game);
  renderMoves(game);
  renderStatus(game);
  syncClockFromNotation(elements.moves.value, game, { previousMoveCount });
  queueNextMoveNumberPrime(game, previousMoveCount);
  if (!skipCpu) {
    maybeRequestCpuMove(game);
  } else {
    paintCpuUi();
  }
}

/** True when movetext already ends with `N.` / `N. ` for White's next turn. */
function hasTrailingMoveNumber(text, moveNumber) {
  return new RegExp(`(?:^|\\s)${moveNumber}\\.\\s*$`).test(String(text ?? ''));
}

/**
 * After Black completes a move, wait briefly then type the next `N. `
 * so White can enter SAN without the number, period, and space.
 */
function queueNextMoveNumberPrime(game, previousMoveCount) {
  clearTimeout(state.moveNumberPrimeTimer);
  state.moveNumberPrimeTimer = null;

  if (!game || game.isGameOver || game.moveCount === 0) {
    return;
  }
  // Black just finished a full turn (even half-move count, White to move).
  if (game.moveCount % 2 !== 0 || game.turn !== 'white') {
    return;
  }
  if (!(previousMoveCount < game.moveCount)) {
    return;
  }
  const nextNumber = game.moveCount / 2 + 1;
  if (hasTrailingMoveNumber(elements.moves.value, nextNumber)) {
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
  if (!state.game || state.game.isGameOver) {
    return;
  }
  // Bail if the player edited away from that completed Black reply.
  if (state.game.moveCount !== moveCount || state.game.fen !== fen) {
    return;
  }
  if (moveCount % 2 !== 0 || state.game.turn !== 'white') {
    return;
  }

  const nextNumber = moveCount / 2 + 1;
  const current = elements.moves.value;
  if (hasTrailingMoveNumber(current, nextNumber)) {
    return;
  }

  const base = current.replace(/\s+$/, '');
  const next = base ? `${base} ${nextNumber}. ` : `${nextNumber}. `;
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

function updateBoard(moves, announce = true, { skipCpu = false } = {}) {
  state.draft = moves;
  localStorage.setItem(STORAGE_KEYS.draft, moves);

  try {
    const game = renderGame(moves);
    paintGame(game, { skipCpu });
    if (announce) {
      setFeedback('Board updated.');
    } else if (!state.cpu.enabled) {
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
    syncClockFromNotation(moves, state.game);
    setFeedback(error.message, true);
  }
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
  clearTimeout(state.moveNumberPrimeTimer);
  state.moveNumberPrimeTimer = null;
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
  elements.moves.value = DEMO_MOVES;
  updateBoard(DEMO_MOVES, true);
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
  elements.loadDemo?.addEventListener('click', loadDemo);

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
    upsertSavedGame(name, elements.moves.value, state.game);
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
  elements.moves.value = state.draft;
  syncFlipButton();
  paintClock();
  paintGame(state.game, { skipCpu: true });
  drawSavedGames();
  bindEvents();

  if (state.draft) {
    state.clockMoveSig = moveNumberSignature(state.draft);
    updateBoard(state.draft, false, { skipCpu: true });
  }

  document.body.classList.add('is-booted');
}

bootstrap();
