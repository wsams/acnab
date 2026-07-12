import { Chess } from './vendor/chess.js';

const FILES = 'abcdefgh';
const PIECE_NAMES = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

const COMMENT_RE = /\{[^{}]*\}|;[^\n]*/g;
const NAG_RE = /\$\d+/g;
const VARIATION_RE = /\([^()]*\)/g;
const MOVE_NUMBER_RE = /^\d+\.(?:\.\.)?/;
const FULL_MOVE_RE = /^\d+\.(?:\.\.)?$/;
const RESULT_TOKENS = new Set(['1-0', '0-1', '1/2-1/2', '*']);
const LEGACY_MOVE_RE = /^([KQRBNP])?([a-h][1-8])(x?)([a-h][1-8])([+#]?)$/;

export function normalizeMovetext(movesText) {
  let normalized = String(movesText ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  normalized = normalized.replace(COMMENT_RE, ' ').replace(NAG_RE, ' ');
  let previous = null;
  while (previous !== normalized) {
    previous = normalized;
    normalized = normalized.replace(VARIATION_RE, ' ');
  }
  return normalized.trim();
}

export function tokenizeMovetext(movesText) {
  const tokens = [];
  for (const rawToken of normalizeMovetext(movesText).split(/\s+/).filter(Boolean)) {
    const token = rawToken.replace(MOVE_NUMBER_RE, '');
    if (FULL_MOVE_RE.test(rawToken) || !token || RESULT_TOKENS.has(token)) {
      continue;
    }
    tokens.push(token);
  }
  return tokens;
}

function parseLegacyMove(chess, token) {
  const match = LEGACY_MOVE_RE.exec(token);
  if (!match) {
    throw new Error(`Unsupported move: ${token}`);
  }

  const [, pieceLetter, fromSquare, captureMarker, toSquare] = match;
  const boardPiece = chess.get(fromSquare);
  if (!boardPiece) {
    throw new Error(`No piece on ${fromSquare} for move ${token}`);
  }

  if (pieceLetter && boardPiece.type.toUpperCase() !== pieceLetter) {
    throw new Error(`Piece mismatch for move ${token}`);
  }

  const promotion = boardPiece.type === 'p' && (toSquare[1] === '1' || toSquare[1] === '8')
    ? 'q'
    : undefined;

  const move = chess.move({
    from: fromSquare,
    to: toSquare,
    promotion,
  });

  if (!move) {
    throw new Error(`Illegal move: ${token}`);
  }

  if (captureMarker && !move.captured) {
    chess.undo();
    throw new Error(`Move ${token} is not a capture`);
  }

  return move;
}

const MATERIAL = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
};

const CAPTURE_ORDER = ['q', 'r', 'b', 'n', 'p'];

function applyMoves(movesText) {
  const chess = new Chess();
  const appliedSan = [];
  const captures = { white: [], black: [] };

  tokenizeMovetext(movesText).forEach((token, index) => {
    let move = null;
    let sanError = null;
    try {
      move = chess.move(token, { strict: false });
    } catch (error) {
      sanError = error;
      move = null;
    }

    if (!move) {
      if (!LEGACY_MOVE_RE.test(token)) {
        const detail = sanError?.message || `Unsupported move: ${token}`;
        throw new Error(`Move ${index + 1} (${token}) failed: ${detail}`);
      }
      try {
        move = parseLegacyMove(chess, token);
      } catch (error) {
        throw new Error(`Move ${index + 1} (${token}) failed: ${error.message}`);
      }
    }

    appliedSan.push(move.san);
    if (move.captured) {
      const taker = move.color === 'w' ? 'white' : 'black';
      captures[taker].push(move.captured);
    }
  });

  return { chess, appliedSan, captures };
}

function sortCaptures(types) {
  return [...types].sort((a, b) => CAPTURE_ORDER.indexOf(a) - CAPTURE_ORDER.indexOf(b));
}

function materialScore(types) {
  return types.reduce((total, type) => total + (MATERIAL[type] || 0), 0);
}

function capturesPayload(captures) {
  const white = sortCaptures(captures.white);
  const black = sortCaptures(captures.black);
  const whiteScore = materialScore(white);
  const blackScore = materialScore(black);
  return {
    white,
    black,
    whiteScore,
    blackScore,
    advantage: whiteScore - blackScore,
  };
}

function squarePayload(chess, squareName) {
  const piece = chess.get(squareName);
  const isLight = (FILES.indexOf(squareName[0]) + Number(squareName[1])) % 2 === 1;
  const payload = {
    square: squareName,
    isLight,
    piece: null,
  };

  if (!piece) {
    return payload;
  }

  payload.piece = {
    type: piece.type,
    symbol: piece.color === 'w' ? piece.type.toUpperCase() : piece.type,
    name: PIECE_NAMES[piece.type],
    color: piece.color === 'w' ? 'white' : 'black',
  };
  return payload;
}

function boardPayload(chess) {
  const rows = [];
  for (let rank = 8; rank >= 1; rank -= 1) {
    const row = [];
    for (const fileName of FILES) {
      row.push(squarePayload(chess, `${fileName}${rank}`));
    }
    rows.push(row);
  }
  return rows;
}

function gameStatus(chess) {
  if (chess.isCheckmate()) {
    const winner = chess.turn() === 'w' ? 'Black' : 'White';
    return `Checkmate. ${winner} wins.`;
  }
  if (chess.isStalemate()) {
    return 'Stalemate.';
  }
  if (chess.isInsufficientMaterial()) {
    return 'Draw by insufficient material.';
  }
  if (chess.isThreefoldRepetition()) {
    return 'Threefold repetition can be claimed.';
  }
  if (chess.isDrawByFiftyMoves()) {
    return 'Fifty-move draw can be claimed.';
  }
  if (chess.isCheck()) {
    const side = chess.turn() === 'w' ? 'White' : 'Black';
    return `${side} to move and currently in check.`;
  }
  const side = chess.turn() === 'w' ? 'White' : 'Black';
  return `${side} to move.`;
}

export function emptyGame() {
  return renderGame('');
}

/** Move-number markers in notation that act as clock presses. */
export function listMoveNumberMarkers(movesText) {
  const text = String(movesText ?? '');
  const markers = [];
  const re = /\b(\d+)\.(?:\.\.)?/g;
  let match = re.exec(text);
  while (match) {
    const raw = match[0];
    markers.push({
      number: Number(match[1]),
      side: raw.endsWith('...') ? 'black' : 'white',
      index: match.index,
      raw,
    });
    match = re.exec(text);
  }
  return markers;
}

export function moveNumberSignature(movesText) {
  return listMoveNumberMarkers(movesText)
    .map((marker) => `${marker.number}:${marker.side}`)
    .join('|');
}

export function renderGame(movesText) {
  const input = String(movesText ?? '');
  const { chess, appliedSan, captures } = applyMoves(input);
  const isGameOver = chess.isGameOver();
  let result = null;
  if (isGameOver) {
    if (chess.isCheckmate()) {
      result = chess.turn() === 'w' ? '0-1' : '1-0';
    } else {
      result = '1/2-1/2';
    }
  }

  return {
    input,
    normalizedInput: normalizeMovetext(input),
    appliedMoves: appliedSan,
    moveCount: appliedSan.length,
    fen: chess.fen(),
    turn: chess.turn() === 'w' ? 'white' : 'black',
    isCheck: chess.isCheck(),
    isGameOver,
    result,
    status: gameStatus(chess),
    board: boardPayload(chess),
    captures: capturesPayload(captures),
  };
}
