import { emptyGame, renderGame } from './engine.js';

const STORAGE_KEYS = {
  draft: 'acnab:draft',
  saves: 'acnab:saves',
  theme: 'acnab:theme',
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

const state = {
  game: emptyGame(),
  draft: localStorage.getItem(STORAGE_KEYS.draft) ?? '',
  theme: resolveTheme(localStorage.getItem(STORAGE_KEYS.theme)),
  requestTimer: null,
};

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
  renderForm: document.querySelector('#render-form'),
  newGame: document.querySelector('#new-game'),
  copyPgn: document.querySelector('#copy-pgn'),
  saveGame: document.querySelector('#save-game'),
  loadDemo: document.querySelector('#load-demo'),
};

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

function applyTheme(theme) {
  const nextTheme = resolveTheme(theme);
  state.theme = nextTheme;
  document.documentElement.dataset.theme = nextTheme;
  document.body.dataset.theme = nextTheme;
  document.body.dataset.scheme = THEMES[nextTheme].scheme;
  document.documentElement.style.colorScheme = THEMES[nextTheme].scheme;
  elements.themeSelect.value = nextTheme;
  localStorage.setItem(STORAGE_KEYS.theme, nextTheme);
}

function setFeedback(message, isError = false) {
  elements.feedback.textContent = message;
  elements.feedback.classList.toggle('is-error', isError);
}

function renderBoard(game) {
  const squares = [];
  const files = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  squares.push('<div class="legend board-cell"></div>');
  files.forEach((file) => squares.push(`<div class="legend board-cell">${file}</div>`));

  game.board.forEach((row, index) => {
    squares.push(`<div class="legend board-cell">${8 - index}</div>`);
    row.forEach((square) => {
      const piece = square.piece;
      const symbol = piece ? piece.unicode : '';
      const label = piece
        ? `${piece.color} ${piece.name} on ${square.square}`
        : `empty ${square.square}`;
      const pieceClass = piece ? ` has-piece ${piece.color}` : '';
      squares.push(`
        <div class="board-square board-cell ${square.isLight ? 'light' : 'dark'}${pieceClass}" aria-label="${escapeHtml(label)}">
          <span class="piece" aria-hidden="true">${symbol}</span>
          <span class="coordinate">${escapeHtml(square.square)}</span>
        </div>
      `);
    });
  });

  elements.board.innerHTML = squares.join('');
  elements.board.classList.remove('is-updating');
  // Retrigger board entrance animation
  void elements.board.offsetWidth;
  elements.board.classList.add('is-ready');
}

function renderMoves(game) {
  const entries = game.appliedMoves.length
    ? game.appliedMoves.map((move, index) => `<li>${index + 1}. ${escapeHtml(move)}</li>`)
    : ['<li>Start position</li>'];
  elements.movesList.innerHTML = entries.join('');
}

function renderStatus(game) {
  elements.status.textContent = game.status;
  elements.fen.textContent = game.fen;
  elements.moveCount.textContent = String(game.moveCount);
}

function paintGame(game) {
  state.game = game;
  renderBoard(game);
  renderMoves(game);
  renderStatus(game);
}

function updateBoard(moves, announce = true) {
  state.draft = moves;
  localStorage.setItem(STORAGE_KEYS.draft, moves);

  try {
    const game = renderGame(moves);
    paintGame(game);
    if (announce) {
      setFeedback('Board updated.');
    } else {
      elements.feedback.textContent = '';
      elements.feedback.classList.remove('is-error');
    }
  } catch (error) {
    setFeedback(error.message, true);
  }
}

function queueLiveRender() {
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
  elements.moves.value = '';
  elements.saveName.value = '';
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
  elements.newGame.addEventListener('click', resetBoard);
  elements.copyPgn.addEventListener('click', copyNotation);
  elements.loadDemo?.addEventListener('click', loadDemo);

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
  applyTheme(state.theme);
  elements.moves.value = state.draft;
  paintGame(state.game);
  drawSavedGames();
  bindEvents();

  if (state.draft) {
    updateBoard(state.draft, false);
  }

  document.body.classList.add('is-booted');
}

bootstrap();
