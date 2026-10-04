/**
 * Lessons coach: a second Stockfish that never plays a move.
 *
 * It reads the same position as the game (and as the CPU opponent, when one
 * is on), then explains a few candidate moves in ordinary chess language.
 * Previewing a line does not change the game. The student plays the real move.
 */

import { Chess } from './vendor/chess.js';

const STOCKFISH_WORKER_URL = new URL(
  './vendor/stockfish/stockfish-18-lite-single.js',
  import.meta.url,
);

export const LESSON_DEPTHS = {
  glance: {
    id: 'glance',
    label: 'Glance',
    description: 'A quick read. Enough to see the idea, not the last tactic.',
    depth: 10,
    movetime: 700,
    multipv: 3,
  },
  study: {
    id: 'study',
    label: 'Study',
    description: 'The default lesson. A few principal variations, with time to name the idea.',
    depth: 13,
    movetime: 1400,
    multipv: 4,
  },
  master: {
    id: 'master',
    label: 'Master class',
    description: 'Deeper search for sharp tactics and endgames. It takes a little longer.',
    depth: 16,
    movetime: 2600,
    multipv: 4,
  },
};

export const DEFAULT_LESSON_DEPTH = 'study';

const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
const PIECE_NAME = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const CENTER = ['d4', 'e4', 'd5', 'e5'];
const FILES = 'abcdefgh';

const ALL_SQUARES = [];
for (const file of FILES) {
  for (let rank = 1; rank <= 8; rank += 1) {
    ALL_SQUARES.push(`${file}${rank}`);
  }
}

const HOME = {
  w: { n: ['b1', 'g1'], b: ['c1', 'f1'] },
  b: { n: ['b8', 'g8'], b: ['c8', 'f8'] },
};

/**
 * Longest matching prefix wins. Names are only attached when the move list
 * actually reaches that line — no guessing from a similar structure.
 */
const OPENINGS = [
  { moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'], name: 'Sicilian Najdorf' },
  { moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'g6'], name: 'Sicilian Dragon' },
  { moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4'], name: 'Open Sicilian' },
  { moves: ['e4', 'c5', 'Nf3', 'd6', 'd4'], name: 'Open Sicilian' },
  { moves: ['e4', 'c5', 'Nf3'], name: 'Sicilian Defense' },
  { moves: ['e4', 'c5'], name: 'Sicilian Defense' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'], name: 'Ruy Lopez, Morphy Defense' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'], name: 'Ruy Lopez' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5'], name: 'Italian Game, Giuoco Piano' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6'], name: 'Two Knights Defense' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'], name: 'Italian Game' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'd4'], name: 'Scotch Game' },
  { moves: ['e4', 'e5', 'Nf3', 'Nf6'], name: "Petrov's Defense" },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6'], name: "King's Knight Opening" },
  { moves: ['e4', 'e5', 'f4'], name: "King's Gambit" },
  { moves: ['e4', 'e5', 'Nf3'], name: "King's Knight Opening" },
  { moves: ['e4', 'e5'], name: 'Open Game' },
  { moves: ['e4', 'e6', 'd4', 'd5'], name: 'French Defense' },
  { moves: ['e4', 'e6'], name: 'French Defense' },
  { moves: ['e4', 'c6', 'd4', 'd5'], name: 'Caro-Kann Defense' },
  { moves: ['e4', 'c6'], name: 'Caro-Kann Defense' },
  { moves: ['e4', 'd5'], name: 'Scandinavian Defense' },
  { moves: ['e4', 'Nf6'], name: "Alekhine's Defense" },
  { moves: ['e4', 'Nc6'], name: 'Nimzowitsch Defense' },
  { moves: ['e4', 'g6'], name: 'Modern Defense' },
  { moves: ['e4'], name: "King's Pawn Opening" },
  { moves: ['d4', 'd5', 'c4', 'e6'], name: "Queen's Gambit Declined" },
  { moves: ['d4', 'd5', 'c4', 'c6'], name: 'Slav Defense' },
  { moves: ['d4', 'd5', 'c4', 'dxc4'], name: "Queen's Gambit Accepted" },
  { moves: ['d4', 'd5', 'c4'], name: "Queen's Gambit" },
  { moves: ['d4', 'Nf6', 'c4', 'g6'], name: "King's Indian / Grünfeld" },
  { moves: ['d4', 'Nf6', 'c4', 'e6'], name: 'Indian Defense' },
  { moves: ['d4', 'Nf6', 'c4'], name: 'Indian Defense' },
  { moves: ['d4', 'Nf6'], name: 'Indian Defense' },
  { moves: ['d4', 'd5'], name: 'Closed Game' },
  { moves: ['d4', 'f5'], name: 'Dutch Defense' },
  { moves: ['d4'], name: "Queen's Pawn Opening" },
  { moves: ['c4', 'e5'], name: 'English Opening, Reversed Sicilian' },
  { moves: ['c4'], name: 'English Opening' },
  { moves: ['Nf3'], name: 'Réti Opening' },
  { moves: ['f4'], name: "Bird's Opening" },
];

const PROPHYLAXIS = [
  { san: 'h3', color: 'w', knight: 'f3', square: 'g4' },
  { san: 'a3', color: 'w', knight: 'c3', square: 'b4' },
  { san: 'h6', color: 'b', knight: 'f6', square: 'g5' },
  { san: 'a6', color: 'b', knight: 'c6', square: 'b5' },
];

export function resolveLessonDepth(id) {
  return LESSON_DEPTHS[id] ? id : DEFAULT_LESSON_DEPTH;
}

export function identifyOpening(sans) {
  const list = Array.isArray(sans) ? sans : [];
  let found = null;
  for (const entry of OPENINGS) {
    if (entry.moves.length > list.length) {
      continue;
    }
    const matches = entry.moves.every((san, index) => san === list[index]);
    if (!matches) {
      continue;
    }
    if (!found || entry.moves.length > found.moves.length) {
      found = entry;
    }
  }
  return found?.name ?? null;
}

function fileIdx(square) {
  return square.charCodeAt(0) - 97;
}

function rankIdx(square) {
  return Number(square[1]);
}

function squareAt(file, rank) {
  if (file < 0 || file > 7 || rank < 1 || rank > 8) {
    return null;
  }
  return `${FILES[file]}${rank}`;
}

function cap(word) {
  return word ? word.charAt(0).toUpperCase() + word.slice(1) : '';
}

function sideName(color) {
  return color === 'w' || color === 'white' ? 'White' : 'Black';
}

function findKing(chess, color) {
  for (const square of ALL_SQUARES) {
    const piece = chess.get(square);
    if (piece?.type === 'k' && piece.color === color) {
      return square;
    }
  }
  return null;
}

function rayDelta(from, to) {
  const df = fileIdx(to) - fileIdx(from);
  const dr = rankIdx(to) - rankIdx(from);
  if (df === 0 && dr === 0) {
    return null;
  }
  const diagonal = df !== 0 && dr !== 0;
  if (diagonal && Math.abs(df) !== Math.abs(dr)) {
    return null;
  }
  if (!diagonal && df !== 0 && dr !== 0) {
    return null;
  }
  return { stepF: Math.sign(df), stepR: Math.sign(dr), diagonal };
}

function sliderCanUseRay(type, delta) {
  if (!delta) {
    return false;
  }
  if (type === 'q') {
    return true;
  }
  if (type === 'b') {
    return delta.diagonal;
  }
  if (type === 'r') {
    return !delta.diagonal;
  }
  return false;
}

function between(from, to) {
  const delta = rayDelta(from, to);
  if (!delta) {
    return null;
  }
  const squares = [];
  let file = fileIdx(from) + delta.stepF;
  let rank = rankIdx(from) + delta.stepR;
  const endFile = fileIdx(to);
  const endRank = rankIdx(to);
  while (file !== endFile || rank !== endRank) {
    const square = squareAt(file, rank);
    if (!square) {
      return null;
    }
    squares.push(square);
    file += delta.stepF;
    rank += delta.stepR;
  }
  return squares;
}

function rayDirs(type) {
  const diagonal = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const straight = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  if (type === 'b') {
    return diagonal;
  }
  if (type === 'r') {
    return straight;
  }
  return diagonal.concat(straight);
}

/** Squares a piece attacks, including captures and empty squares along a ray. */
export function attacksOf(chess, square) {
  const piece = chess.get(square);
  if (!piece) {
    return [];
  }
  const file = fileIdx(square);
  const rank = rankIdx(square);
  const out = [];

  if (piece.type === 'n') {
    for (const [df, dr] of [[1, 2], [1, -2], [-1, 2], [-1, -2], [2, 1], [2, -1], [-2, 1], [-2, -1]]) {
      const target = squareAt(file + df, rank + dr);
      if (target) {
        out.push(target);
      }
    }
    return out;
  }

  if (piece.type === 'k') {
    for (let df = -1; df <= 1; df += 1) {
      for (let dr = -1; dr <= 1; dr += 1) {
        if (!df && !dr) {
          continue;
        }
        const target = squareAt(file + df, rank + dr);
        if (target) {
          out.push(target);
        }
      }
    }
    return out;
  }

  if (piece.type === 'p') {
    const dir = piece.color === 'w' ? 1 : -1;
    for (const df of [-1, 1]) {
      const target = squareAt(file + df, rank + dir);
      if (target) {
        out.push(target);
      }
    }
    return out;
  }

  for (const [df, dr] of rayDirs(piece.type)) {
    let nextFile = file + df;
    let nextRank = rank + dr;
    while (true) {
      const target = squareAt(nextFile, nextRank);
      if (!target) {
        break;
      }
      out.push(target);
      if (chess.get(target)) {
        break;
      }
      nextFile += df;
      nextRank += dr;
    }
  }
  return out;
}

function pawnFiles(chess, color) {
  const files = Array.from({ length: 8 }, () => []);
  for (const square of ALL_SQUARES) {
    const piece = chess.get(square);
    if (piece?.type === 'p' && piece.color === color) {
      files[fileIdx(square)].push(rankIdx(square));
    }
  }
  return files;
}

function isPassedPawn(chess, square) {
  const piece = chess.get(square);
  if (!piece || piece.type !== 'p') {
    return false;
  }
  const file = fileIdx(square);
  const rank = rankIdx(square);
  const enemy = piece.color === 'w' ? 'b' : 'w';
  for (let df = -1; df <= 1; df += 1) {
    const nextFile = file + df;
    if (nextFile < 0 || nextFile > 7) {
      continue;
    }
    for (let nextRank = 1; nextRank <= 8; nextRank += 1) {
      const ahead = piece.color === 'w' ? nextRank > rank : nextRank < rank;
      if (!ahead) {
        continue;
      }
      const occupant = chess.get(squareAt(nextFile, nextRank));
      if (occupant?.type === 'p' && occupant.color === enemy) {
        return false;
      }
    }
  }
  return true;
}

function isolatedSquares(chess, color) {
  const files = pawnFiles(chess, color);
  const squares = [];
  for (let file = 0; file < 8; file += 1) {
    if (!files[file].length) {
      continue;
    }
    const neighbor = (file > 0 && files[file - 1].length) || (file < 7 && files[file + 1].length);
    if (neighbor) {
      continue;
    }
    for (const rank of files[file]) {
      squares.push(squareAt(file, rank));
    }
  }
  return squares;
}

function isOutpost(chess, square) {
  const piece = chess.get(square);
  if (!piece || piece.type !== 'n') {
    return false;
  }
  const rank = rankIdx(square);
  if (piece.color === 'w' && rank < 4) {
    return false;
  }
  if (piece.color === 'b' && rank > 5) {
    return false;
  }
  const file = fileIdx(square);
  const supportRank = piece.color === 'w' ? rank - 1 : rank + 1;
  let supported = false;
  for (const df of [-1, 1]) {
    const support = squareAt(file + df, supportRank);
    const pawn = support && chess.get(support);
    if (pawn?.type === 'p' && pawn.color === piece.color) {
      supported = true;
    }
  }
  if (!supported) {
    return false;
  }
  const enemy = piece.color === 'w' ? 'b' : 'w';
  const attackRank = piece.color === 'w' ? rank + 1 : rank - 1;
  for (const df of [-1, 1]) {
    const originFile = file + df;
    if (originFile < 0 || originFile > 7 || attackRank < 1 || attackRank > 8) {
      continue;
    }
    for (let pawnRank = 1; pawnRank <= 8; pawnRank += 1) {
      const pawn = chess.get(squareAt(originFile, pawnRank));
      if (pawn?.type !== 'p' || pawn.color !== enemy) {
        continue;
      }
      if (enemy === 'b' && pawnRank >= attackRank) {
        return false;
      }
      if (enemy === 'w' && pawnRank <= attackRank) {
        return false;
      }
    }
  }
  return true;
}

function materialSnapshot(chess) {
  let total = 0;
  let queens = 0;
  for (const square of ALL_SQUARES) {
    const piece = chess.get(square);
    if (!piece || piece.type === 'k') {
      continue;
    }
    total += PIECE_VALUE[piece.type];
    if (piece.type === 'q') {
      queens += 1;
    }
  }
  return { total, queens };
}

function isEndgame(chess) {
  const snap = materialSnapshot(chess);
  return snap.queens === 0 && snap.total <= 16;
}

function pinsBy(chess, byColor) {
  const pins = [];
  const enemy = byColor === 'w' ? 'b' : 'w';
  const king = findKing(chess, enemy);
  for (const square of ALL_SQUARES) {
    const piece = chess.get(square);
    if (!piece || piece.color !== byColor || !'qrb'.includes(piece.type)) {
      continue;
    }
    if (king) {
      const delta = rayDelta(square, king);
      if (delta && sliderCanUseRay(piece.type, delta)) {
        const mids = between(square, king) ?? [];
        const occupants = mids.filter((mid) => chess.get(mid));
        if (occupants.length === 1) {
          const victim = chess.get(occupants[0]);
          if (victim?.color === enemy) {
            pins.push({
              kind: 'absolute',
              slider: square,
              sliderType: piece.type,
              victim: occupants[0],
              victimType: victim.type,
              rear: king,
              rearType: 'k',
            });
          }
        }
      }
    }
    for (const rear of ALL_SQUARES) {
      const rearPiece = chess.get(rear);
      if (!rearPiece || rearPiece.color !== enemy || rearPiece.type === 'k') {
        continue;
      }
      const delta = rayDelta(square, rear);
      if (!delta || !sliderCanUseRay(piece.type, delta)) {
        continue;
      }
      const mids = between(square, rear);
      if (!mids) {
        continue;
      }
      const occupants = mids.filter((mid) => chess.get(mid));
      if (occupants.length !== 1) {
        continue;
      }
      const victim = chess.get(occupants[0]);
      if (!victim || victim.color !== enemy) {
        continue;
      }
      if (PIECE_VALUE[rearPiece.type] <= PIECE_VALUE[victim.type]) {
        continue;
      }
      pins.push({
        kind: 'relative',
        slider: square,
        sliderType: piece.type,
        victim: occupants[0],
        victimType: victim.type,
        rear,
        rearType: rearPiece.type,
      });
    }
  }
  return pins;
}

function pinKey(pin) {
  return `${pin.kind}:${pin.victim}:${pin.rear}`;
}

function xrayPressure(after, move) {
  if (!'qrb'.includes(move.piece)) {
    return null;
  }
  const enemy = move.color === 'w' ? 'b' : 'w';
  const king = findKing(after, enemy);
  if (!king) {
    return null;
  }
  const delta = rayDelta(move.to, king);
  if (!delta || !sliderCanUseRay(move.piece, delta)) {
    return null;
  }
  const mids = between(move.to, king);
  if (!mids?.length) {
    return null;
  }
  const occupants = mids.filter((square) => after.get(square));
  if (occupants.length < 2) {
    return null;
  }
  const victim = after.get(occupants[0]);
  if (!victim || victim.color !== enemy) {
    return null;
  }
  return {
    victimSq: occupants[0],
    victim,
    blockerSq: occupants[1],
    blocker: after.get(occupants[1]),
  };
}

function forkTargets(after, move) {
  const piece = after.get(move.to);
  if (!piece) {
    return [];
  }
  const enemies = attacksOf(after, move.to)
    .map((square) => ({ square, piece: after.get(square) }))
    .filter((item) => item.piece && item.piece.color !== piece.color);
  const hasKing = enemies.some((item) => item.piece.type === 'k');
  const others = enemies.filter((item) => item.piece.type !== 'k' && PIECE_VALUE[item.piece.type] >= 3);
  if (hasKing && others.length) {
    return enemies.filter((item) => item.piece.type === 'k' || PIECE_VALUE[item.piece.type] >= 3);
  }
  const heavy = enemies.filter((item) => PIECE_VALUE[item.piece.type] >= 3);
  return heavy.length >= 2 ? heavy : [];
}

function discoveries(before, move) {
  const color = move.color;
  const enemy = color === 'w' ? 'b' : 'w';
  const targets = [];
  const king = findKing(before, enemy);
  if (king) {
    targets.push({ square: king, type: 'k' });
  }
  for (const square of ALL_SQUARES) {
    const piece = before.get(square);
    if (!piece || piece.color !== enemy || piece.type === 'k') {
      continue;
    }
    if (PIECE_VALUE[piece.type] >= 5) {
      targets.push({ square, type: piece.type });
    }
  }
  const found = [];
  for (const square of ALL_SQUARES) {
    const piece = before.get(square);
    if (!piece || piece.color !== color || !'qrb'.includes(piece.type) || square === move.from) {
      continue;
    }
    for (const target of targets) {
      const delta = rayDelta(square, target.square);
      if (!delta || !sliderCanUseRay(piece.type, delta)) {
        continue;
      }
      const mids = between(square, target.square);
      if (!mids?.includes(move.from)) {
        continue;
      }
      const blockers = mids.filter((mid) => before.get(mid));
      if (blockers.length !== 1 || blockers[0] !== move.from) {
        continue;
      }
      if (mids.includes(move.to)) {
        continue;
      }
      found.push({
        slider: square,
        sliderType: piece.type,
        target: target.square,
        targetType: target.type,
      });
    }
  }
  return found;
}

function skewerFrom(after, square) {
  const piece = after.get(square);
  if (!piece || !'qrb'.includes(piece.type)) {
    return null;
  }
  for (const [df, dr] of rayDirs(piece.type)) {
    const chain = [];
    let file = fileIdx(square) + df;
    let rank = rankIdx(square) + dr;
    while (chain.length < 2) {
      const target = squareAt(file, rank);
      if (!target) {
        break;
      }
      const occupant = after.get(target);
      if (occupant) {
        if (occupant.color === piece.color) {
          break;
        }
        chain.push({ square: target, piece: occupant });
      }
      file += df;
      rank += dr;
    }
    if (chain.length < 2) {
      continue;
    }
    const front = PIECE_VALUE[chain[0].piece.type];
    const back = PIECE_VALUE[chain[1].piece.type];
    if (front > back && front >= 5) {
      return { front: chain[0], back: chain[1] };
    }
  }
  return null;
}

function enemySliderAttacks(chess, square, byColor) {
  for (const from of ALL_SQUARES) {
    const piece = chess.get(from);
    if (!piece || piece.color !== byColor || (piece.type !== 'b' && piece.type !== 'q')) {
      continue;
    }
    if (attacksOf(chess, from).includes(square)) {
      return true;
    }
  }
  return false;
}

function fileIsOpen(chess, fileIndex) {
  for (let rank = 1; rank <= 8; rank += 1) {
    const piece = chess.get(squareAt(fileIndex, rank));
    if (piece?.type === 'p') {
      return false;
    }
  }
  return true;
}

function fileIsHalfOpen(chess, fileIndex, color) {
  let enemyPawn = false;
  for (let rank = 1; rank <= 8; rank += 1) {
    const piece = chess.get(squareAt(fileIndex, rank));
    if (piece?.type !== 'p') {
      continue;
    }
    if (piece.color === color) {
      return false;
    }
    enemyPawn = true;
  }
  return enemyPawn;
}

function centerDistance(square) {
  const file = fileIdx(square);
  const rank = rankIdx(square);
  const df = Math.min(Math.abs(file - 3), Math.abs(file - 4));
  const dr = Math.min(Math.abs(rank - 4), Math.abs(rank - 5));
  return df + dr;
}

function attackersOf(chess, square, byColor) {
  const list = [];
  for (const from of ALL_SQUARES) {
    const piece = chess.get(from);
    if (!piece || piece.color !== byColor) {
      continue;
    }
    if (attacksOf(chess, from).includes(square)) {
      list.push(from);
    }
  }
  return list;
}

function centralEyes(chess, square) {
  const eyes = attacksOf(chess, square);
  return CENTER.filter((center) => eyes.includes(center));
}

export function whiteEval(score, turn) {
  if (!score || (score.type !== 'cp' && score.type !== 'mate')) {
    return null;
  }
  const sign = turn === 'b' || turn === 'black' ? -1 : 1;
  if (score.type === 'mate') {
    return { kind: 'mate', moves: score.value * sign };
  }
  return { kind: 'cp', cp: score.value * sign };
}

export function formatWhiteEval(score, turn) {
  const view = whiteEval(score, turn);
  if (!view) {
    return '—';
  }
  if (view.kind === 'mate') {
    if (view.moves === 0) {
      return 'Mate';
    }
    const marks = `M${Math.abs(view.moves)}`;
    return view.moves > 0 ? `+${marks}` : `-${marks}`;
  }
  const pawns = view.cp / 100;
  const abs = Math.abs(pawns).toFixed(2);
  if (pawns > 0) {
    return `+${abs}`;
  }
  if (pawns < 0) {
    return `-${abs}`;
  }
  return '0.00';
}

export function evalCaption(score, turn) {
  const view = whiteEval(score, turn);
  if (!view) {
    return '';
  }
  if (view.kind === 'mate') {
    if (view.moves === 0) {
      return 'Checkmate.';
    }
    const winner = view.moves > 0 ? 'White' : 'Black';
    const n = Math.abs(view.moves);
    return `${winner} forces mate in ${n}.`;
  }
  const abs = Math.abs(view.cp);
  if (abs <= 15) {
    return 'The evaluation is about equal.';
  }
  const side = view.cp > 0 ? 'White' : 'Black';
  if (abs < 80) {
    return `${side} is slightly better.`;
  }
  if (abs < 180) {
    return `${side} has a clear advantage.`;
  }
  if (abs < 400) {
    return `${side} is winning if the technique holds.`;
  }
  return `${side} has a decisive advantage.`;
}

/** How much worse this score is for the side to move than the best score. */
export function moverGap(score, bestScore) {
  if (!score || !bestScore) {
    return null;
  }
  if (bestScore.type === 'mate' && bestScore.value > 0) {
    if (score.type === 'mate' && score.value > 0) {
      const extra = score.value - bestScore.value;
      if (extra <= 0) {
        return { kind: 'best', loss: 0 };
      }
      return { kind: 'slower-mate', extra, loss: extra * 100 };
    }
    return { kind: 'missed-mate', loss: 10000 };
  }
  if (score.type === 'mate' && score.value < 0 && !(bestScore.type === 'mate' && bestScore.value <= 0)) {
    return { kind: 'walks-into-mate', loss: 10000 };
  }
  if (score.type === 'cp' && bestScore.type === 'cp') {
    const loss = bestScore.value - score.value;
    if (loss <= 0) {
      return { kind: 'best', loss: 0 };
    }
    return { kind: 'cp', loss };
  }
  return null;
}

export function describeGap(score, bestScore) {
  const gap = moverGap(score, bestScore);
  if (!gap) {
    return '';
  }
  if (gap.kind === 'best') {
    return "This is the engine's first choice.";
  }
  if (gap.kind === 'missed-mate') {
    return 'This misses a forced mate.';
  }
  if (gap.kind === 'walks-into-mate') {
    return 'This walks into a forced mate.';
  }
  if (gap.kind === 'slower-mate') {
    return gap.extra <= 1
      ? 'Also a forced mate, one move slower.'
      : `Also mate, but ${gap.extra} moves slower.`;
  }
  const loss = gap.loss;
  if (loss <= 15) {
    return 'Essentially the same evaluation as the best move.';
  }
  const pawns = (loss / 100).toFixed(2);
  if (loss <= 50) {
    return `A small concession, about ${pawns} pawns.`;
  }
  if (loss <= 120) {
    return `Inaccurate. It gives up about ${pawns} pawns.`;
  }
  if (loss <= 250) {
    return `A mistake, about ${pawns} pawns. The opponent takes over the plan.`;
  }
  return `A serious error, about ${pawns} pawns.`;
}

export function rankLabelFor(rank, gap) {
  if (rank === 1) {
    return 'First choice';
  }
  if (!gap || gap.kind === 'best') {
    return 'Sound';
  }
  if (gap.kind === 'missed-mate' || gap.kind === 'walks-into-mate') {
    return 'Misses the point';
  }
  if (gap.kind === 'slower-mate') {
    return 'Slower mate';
  }
  if (gap.loss <= 15) {
    return 'Sound';
  }
  if (gap.loss <= 50) {
    return 'Alternative';
  }
  if (gap.loss <= 120) {
    return 'Concession';
  }
  return 'Inaccuracy';
}

function themeLabels(themes) {
  const labels = {
    'castle-kingside': 'King safety',
    'castle-queenside': 'King safety',
    check: 'Check',
    mate: 'Mate',
    'double-check': 'Double check',
    'discovered-check': 'Discovered check',
    'discovered-attack': 'Discovery',
    fork: 'Fork',
    pin: 'Pin',
    skewer: 'Skewer',
    promotion: 'Promotion',
    'en-passant': 'En passant',
    outpost: 'Outpost',
    'passed-pawn': 'Passed pawn',
    'isolated-pawn': 'Isolated pawn',
    'doubled-pawns': 'Doubled pawns',
    'pawn-break': 'Pawn break',
    'open-file': 'Open file',
    'half-open-file': 'Half-open file',
    'seventh-rank': 'Seventh rank',
    development: 'Development',
    center: 'Center',
    prophylaxis: 'Prophylaxis',
    'king-shelter': 'Pawn shield',
    opposition: 'Opposition',
    'king-centralization': 'King activity',
    xray: 'Pressure',
    capture: 'Capture',
    tempo: 'Tempo',
  };
  return themes.map((theme) => labels[theme]).filter(Boolean);
}

function joinTargets(items) {
  const names = items.map((item) => {
    if (item.piece.type === 'k') {
      return 'the king';
    }
    return `the ${PIECE_NAME[item.piece.type]} on ${item.square}`;
  });
  if (names.length === 1) {
    return names[0];
  }
  if (names.length === 2) {
    return `${names[0]} and ${names[1]}`;
  }
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

/**
 * Explain one legal move from a FEN. Every claim is checked on the board
 * or taken from the engine score / principal variation passed in.
 */
export function annotateMove(fen, san, {
  pvSans = [],
  score = null,
  bestScore = null,
  rank = 1,
  gameSans = [],
  depth = null,
} = {}) {
  const before = new Chess(fen);
  let move = null;
  try {
    move = before.move(san, { strict: false });
  } catch {
    move = null;
  }
  if (!move) {
    return null;
  }
  const played = new Chess(fen);
  played.move(san, { strict: false });
  const prior = new Chess(fen);
  const turn = move.color === 'w' ? 'white' : 'black';
  const enemy = move.color === 'w' ? 'b' : 'w';
  const themes = [];
  const motifs = {};

  if (move.isKingsideCastle?.() || String(move.flags || '').includes('k')) {
    themes.push('castle-kingside');
    motifs.castle = 'k';
  } else if (move.isQueensideCastle?.() || String(move.flags || '').includes('q')) {
    themes.push('castle-queenside');
    motifs.castle = 'q';
  }

  const mate = Boolean(played.isCheckmate()) || String(move.san).includes('#');
  const check = Boolean(played.isCheck()) || String(move.san).includes('+');
  if (mate) {
    themes.push('mate');
    motifs.mate = true;
  } else if (check) {
    themes.push('check');
    motifs.check = true;
  }

  if (move.promotion) {
    themes.push('promotion');
    motifs.promotion = move.promotion;
  }
  if (move.isEnPassant?.() || String(move.flags || '').includes('e')) {
    themes.push('en-passant');
    motifs.enPassant = true;
  }
  if (move.captured) {
    themes.push('capture');
    motifs.capture = move.captured;
  }

  const foundDiscoveries = discoveries(prior, move);
  const discoveredOnKing = foundDiscoveries.find((item) => item.targetType === 'k');
  if (discoveredOnKing) {
    themes.push('discovered-check');
    motifs.discoveredCheck = discoveredOnKing;
  } else if (foundDiscoveries.length) {
    themes.push('discovered-attack');
    motifs.discovered = foundDiscoveries[0];
  }

  if (check) {
    const checkers = attackersOf(played, findKing(played, enemy), move.color);
    if (checkers.length >= 2) {
      themes.push('double-check');
      motifs.doubleCheck = true;
    }
  }

  const forks = forkTargets(played, move);
  if (forks.length >= 2) {
    themes.push('fork');
    motifs.fork = forks;
  }

  const beforePins = new Set(pinsBy(prior, move.color).map(pinKey));
  const createdPins = pinsBy(played, move.color).filter((pin) => {
    if (beforePins.has(pinKey(pin))) {
      return false;
    }
    if (pin.slider === move.to) {
      return true;
    }
    const ray = between(pin.slider, pin.rear) ?? [];
    return ray.includes(move.from) || move.from === pin.slider;
  });
  const pin = createdPins.find((item) => item.kind === 'absolute') || createdPins[0] || null;
  if (pin) {
    themes.push('pin');
    motifs.pin = pin;
  }

  if ('qrb'.includes(move.piece)) {
    const skewer = skewerFrom(played, move.to);
    if (skewer && !motifs.pin) {
      themes.push('skewer');
      motifs.skewer = skewer;
    }
  }

  const xray = !motifs.pin ? xrayPressure(played, move) : null;
  if (xray) {
    themes.push('xray');
    motifs.xray = xray;
  }

  if (isOutpost(played, move.to) && move.piece === 'n') {
    themes.push('outpost');
    motifs.outpost = move.to;
  }

  if (move.piece === 'p' && isPassedPawn(played, move.to)) {
    themes.push('passed-pawn');
    motifs.passed = move.to;
  }

  const breakTargets = move.piece === 'p'
    ? attacksOf(played, move.to)
      .filter((square) => {
        const piece = played.get(square);
        return piece?.type === 'p' && piece.color !== move.color;
      })
    : [];
  if (breakTargets.length) {
    themes.push('pawn-break');
    motifs.pawnBreak = breakTargets;
  }

  if (!move.captured && !motifs.fork && !motifs.pin) {
    const threatened = attacksOf(played, move.to)
      .map((square) => ({ square, piece: played.get(square) }))
      .filter((item) => (
        item.piece
        && item.piece.color !== move.color
        && item.piece.type !== 'k'
        && item.piece.type !== 'p'
        && PIECE_VALUE[item.piece.type] >= 3
        && item.square !== motifs.xray?.victimSq
      ));
    if (threatened.length) {
      themes.push('tempo');
      motifs.tempo = threatened;
    }
  }

  if (CENTER.includes(move.to) && (move.piece === 'p' || move.piece === 'n')) {
    themes.push('center');
    motifs.center = move.to;
  }

  const home = HOME[move.color]?.[move.piece];
  const ply = Array.isArray(gameSans) ? gameSans.length : 0;
  const openingPhase = ply <= 16 && (materialSnapshot(prior).queens >= 1 || ply <= 10);
  if (home?.includes(move.from) && openingPhase) {
    themes.push('development');
    motifs.development = true;
  }

  const file = fileIdx(move.to);
  if ((move.piece === 'r' || move.piece === 'q') && fileIsOpen(played, file)) {
    themes.push('open-file');
    motifs.openFile = FILES[file];
  } else if ((move.piece === 'r' || move.piece === 'q') && fileIsHalfOpen(played, file, move.color)) {
    themes.push('half-open-file');
    motifs.halfOpenFile = FILES[file];
  }

  const seventh = (move.color === 'w' && rankIdx(move.to) === 7) || (move.color === 'b' && rankIdx(move.to) === 2);
  if (seventh && (move.piece === 'r' || move.piece === 'q')) {
    themes.push('seventh-rank');
    motifs.seventh = true;
  }

  const prophylaxis = PROPHYLAXIS.find((item) => item.san === move.san && item.color === move.color);
  if (prophylaxis && prior.get(prophylaxis.knight)?.type === 'n' && prior.get(prophylaxis.knight)?.color === move.color) {
    if (enemySliderAttacks(prior, prophylaxis.square, enemy)) {
      themes.push('prophylaxis');
      motifs.prophylaxis = prophylaxis;
    }
  }

  const beforeIsolated = new Set(isolatedSquares(prior, move.color).concat(isolatedSquares(prior, enemy)));
  const afterIsolated = isolatedSquares(played, move.color).concat(isolatedSquares(played, enemy));
  const newIsolated = afterIsolated.find((square) => !beforeIsolated.has(square));
  if (newIsolated) {
    themes.push('isolated-pawn');
    motifs.isolated = { square: newIsolated, color: played.get(newIsolated)?.color };
  }

  const beforeFiles = { w: pawnFiles(prior, 'w'), b: pawnFiles(prior, 'b') };
  const afterFiles = { w: pawnFiles(played, 'w'), b: pawnFiles(played, 'b') };
  for (const color of ['w', 'b']) {
    for (let index = 0; index < 8; index += 1) {
      if (beforeFiles[color][index].length <= 1 && afterFiles[color][index].length >= 2) {
        themes.push('doubled-pawns');
        motifs.doubled = { file: FILES[index], color };
      }
    }
  }

  const kingHome = {
    w: { g1: ['f2', 'g2', 'h2'], c1: ['a2', 'b2', 'c2'] },
    b: { g8: ['f7', 'g7', 'h7'], c8: ['a7', 'b7', 'c7'] },
  };
  if (move.piece === 'p') {
    const king = findKing(played, move.color);
    const shield = king && kingHome[move.color]?.[king];
    if (shield?.includes(move.from)) {
      themes.push('king-shelter');
      motifs.shelter = true;
    }
  }

  if (move.piece === 'k' && isEndgame(played)) {
    const myKing = move.to;
    const theirKing = findKing(played, enemy);
    if (theirKing) {
      const df = Math.abs(fileIdx(myKing) - fileIdx(theirKing));
      const dr = Math.abs(rankIdx(myKing) - rankIdx(theirKing));
      if ((df === 0 && dr === 2) || (dr === 0 && df === 2)) {
        themes.push('opposition');
        motifs.opposition = 'direct';
      } else if (df === 2 && dr === 2) {
        themes.push('opposition');
        motifs.opposition = 'diagonal';
      }
    }
    if (centerDistance(move.to) < centerDistance(move.from)) {
      themes.push('king-centralization');
      motifs.centralizing = true;
    }
  }

  const lineSans = [...(Array.isArray(gameSans) ? gameSans : []), move.san];
  const opening = identifyOpening(lineSans);
  const openingBefore = identifyOpening(gameSans);
  const openingEntered = opening && opening !== openingBefore ? opening : null;

  const gap = moverGap(score, bestScore ?? score);
  const headline = pickHeadline(motifs, move, openingEntered);
  const paragraphs = composeParagraphs(motifs, move, prior, played, openingEntered);
  const continuation = Array.isArray(pvSans) && pvSans.length > 1
    ? `Expected continuation: ${pvSans.slice(1, 5).join(' ')}.`
    : '';

  return {
    san: move.san,
    uci: `${move.from}${move.to}${move.promotion || ''}`,
    from: move.from,
    to: move.to,
    color: turn,
    headline,
    themes,
    themeLabels: unique(themeLabels(themes)).slice(0, 4),
    paragraphs,
    continuation,
    opening,
    openingEntered,
    evalLabel: formatWhiteEval(score, turn),
    evalCaption: evalCaption(score, turn),
    rank,
    rankLabel: rankLabelFor(rank, rank === 1 ? { kind: 'best', loss: 0 } : gap),
    gapNote: rank === 1 ? "This is the engine's first choice." : describeGap(score, bestScore),
    depth,
    score,
  };
}

function unique(list) {
  return [...new Set(list)];
}

function pickHeadline(motifs, move, openingEntered) {
  if (motifs.mate) {
    return 'Checkmate';
  }
  if (motifs.doubleCheck) {
    return 'Double check';
  }
  if (motifs.discoveredCheck) {
    return `Discovered check from the ${PIECE_NAME[motifs.discoveredCheck.sliderType]}`;
  }
  if (motifs.fork) {
    return `${cap(PIECE_NAME[move.piece])} fork`;
  }
  if (motifs.skewer) {
    return 'Skewer';
  }
  if (motifs.pin) {
    return motifs.pin.kind === 'absolute' ? 'Absolute pin' : 'Relative pin';
  }
  if (motifs.discovered) {
    return 'Discovered attack';
  }
  if (motifs.promotion) {
    return `Promotes to a ${PIECE_NAME[motifs.promotion]}`;
  }
  if (motifs.outpost) {
    return `Outpost on ${move.to}`;
  }
  if (motifs.passed) {
    return 'Passed pawn';
  }
  if (motifs.castle === 'k') {
    return 'Kingside castling';
  }
  if (motifs.castle === 'q') {
    return 'Queenside castling';
  }
  if (motifs.pawnBreak) {
    return 'Pawn break';
  }
  if (motifs.tempo) {
    return `Attacks the ${PIECE_NAME[motifs.tempo[0].piece.type]}`;
  }
  if (motifs.seventh) {
    return move.piece === 'q' ? 'Queen on the seventh' : 'Rook on the seventh';
  }
  if (motifs.prophylaxis) {
    return 'Prophylaxis';
  }
  if (openingEntered) {
    return openingEntered;
  }
  if (motifs.xray) {
    return `Pressure on the ${PIECE_NAME[motifs.xray.victim.type]}`;
  }
  if (motifs.opposition) {
    return motifs.opposition === 'diagonal' ? 'Diagonal opposition' : 'Taking the opposition';
  }
  if (motifs.development) {
    return 'Development';
  }
  if (motifs.center) {
    return 'Fighting for the center';
  }
  if (motifs.openFile) {
    return `Open ${motifs.openFile}-file`;
  }
  if (motifs.check) {
    return 'Check';
  }
  if (motifs.capture) {
    return `Captures the ${PIECE_NAME[motifs.capture]}`;
  }
  return `${cap(PIECE_NAME[move.piece])} to ${move.to}`;
}

function composeParagraphs(motifs, move, before, after, openingEntered) {
  const sentences = [];
  const who = sideName(move.color);
  const piece = PIECE_NAME[move.piece];

  if (motifs.castle === 'k') {
    const rookTo = move.color === 'w' ? 'f1' : 'f8';
    sentences.push(`${who} castles kingside. The king steps behind the pawn shield and the rook enters on ${rookTo}, which is how the rooks start to get connected.`);
  } else if (motifs.castle === 'q') {
    const rookTo = move.color === 'w' ? 'd1' : 'd8';
    sentences.push(`${who} castles queenside. The king settles on the c-file and the rook lands on ${rookTo}. Queenside castling often means opposite-side attacking chances.`);
  } else if (motifs.mate) {
    sentences.push(`${move.san} is checkmate. The king is in check, and no capture, block, or flight saves it.`);
  } else if (motifs.fork) {
    sentences.push(`${cap(piece)} fork. From ${move.to} the ${piece} attacks ${joinTargets(motifs.fork)} at the same time, so both cannot be saved.`);
  } else if (motifs.discoveredCheck) {
    sentences.push(`Discovered check. Moving the ${piece} off ${move.from} unmasks the ${PIECE_NAME[motifs.discoveredCheck.sliderType]} on ${motifs.discoveredCheck.slider} against the king.`);
  } else if (motifs.doubleCheck) {
    sentences.push(`Double check. Two pieces attack the king at once, so the king has to move — a block or a capture cannot answer both checks.`);
  } else if (motifs.pin) {
    const pin = motifs.pin;
    const rearName = pin.rearType === 'k' ? 'the king' : `the ${PIECE_NAME[pin.rearType]} on ${pin.rear}`;
    const kind = pin.kind === 'absolute' ? 'Absolute pin' : 'Relative pin';
    sentences.push(`${kind}. The ${PIECE_NAME[pin.sliderType]} on ${pin.slider} pins the ${PIECE_NAME[pin.victimType]} on ${pin.victim} to ${rearName}.`);
  } else if (motifs.skewer) {
    const front = motifs.skewer.front;
    const back = motifs.skewer.back;
    const frontName = front.piece.type === 'k' ? 'the king' : `the ${PIECE_NAME[front.piece.type]} on ${front.square}`;
    sentences.push(`Skewer. The ${piece} attacks ${frontName}, and the ${PIECE_NAME[back.piece.type]} on ${back.square} stands behind it on the same line.`);
  } else if (motifs.xray) {
    const victimName = PIECE_NAME[motifs.xray.victim.type];
    const blockerName = PIECE_NAME[motifs.xray.blocker?.type] || 'piece';
    sentences.push(`The ${piece} attacks the ${victimName} on ${motifs.xray.victimSq}. This is pressure, not yet a pin: the ${blockerName} on ${motifs.xray.blockerSq} still stands between that ${victimName} and the king.`);
  } else if (motifs.development) {
    const eyes = centralEyes(after, move.to);
    const eyeText = eyes.length ? ` From ${move.to} it influences ${eyes.join(' and ')}.` : '';
    sentences.push(`The ${piece} develops from ${move.from} to ${move.to}.${eyeText} In the opening, getting the minor pieces out matters more than moving the same one twice.`);
  } else if (move.piece === 'p' && motifs.center) {
    const bishopNote = centerBishopNote(move.to);
    sentences.push(`${move.san} stakes a claim in the center.${bishopNote} The pawn cannot retreat, so the structure is committed.`);
  } else if (motifs.capture) {
    sentences.push(`${move.san} takes the ${PIECE_NAME[motifs.capture]} on ${move.to}.`);
  } else if (motifs.check) {
    sentences.push(`${move.san} gives check. The opponent has to answer before continuing a plan, which is a gain of tempo.`);
  } else {
    const eyes = centralEyes(after, move.to);
    const eyeText = eyes.length ? ` It eyes ${eyes.join(' and ')}.` : '';
    sentences.push(`The ${piece} moves from ${move.from} to ${move.to}.${eyeText}`);
  }

  if (motifs.outpost) {
    sentences.push(`Outpost. The knight on ${move.to} is protected by a pawn, and no enemy pawn can kick it off that square.`);
  }
  if (motifs.passed) {
    sentences.push(`Passed pawn. No enemy pawn stands on the ${FILES[fileIdx(move.to)]}-file or an adjacent file in front of it, so only pieces can stop it.`);
  }
  if (motifs.pawnBreak) {
    const targets = motifs.pawnBreak.join(' and ');
    sentences.push(`Pawn break. The pawn attacks the enemy pawn on ${targets} and fights for central space. Breaks are how a cramped position opens lines.`);
  }
  if (motifs.tempo) {
    sentences.push(`It attacks ${joinTargets(motifs.tempo)}. That piece has to answer, so the move gains a tempo.`);
  }
  if (motifs.prophylaxis) {
    sentences.push(`Prophylaxis. ${move.san} takes ${motifs.prophylaxis.square} away from the bishop before it can pin the knight on ${motifs.prophylaxis.knight}.`);
  }
  if (motifs.openFile) {
    sentences.push(`The ${piece} occupies the open ${motifs.openFile}-file. An open file has no pawns on it, so a rook there attacks straight into the position.`);
  } else if (motifs.halfOpenFile) {
    sentences.push(`The ${piece} uses the half-open ${motifs.halfOpenFile}-file. Your pawns have left it, and the enemy pawn that remains is a natural target.`);
  }
  if (motifs.seventh) {
    const rank = move.color === 'w' ? 'seventh' : 'second';
    sentences.push(`On the ${rank} rank the ${piece} attacks unadvanced pawns from the side and cuts the king off.`);
  }
  if (motifs.enPassant) {
    sentences.push('En passant. The pawn that just stepped two squares is taken as if it had moved one, and the file opens.');
  }
  if (motifs.promotion) {
    sentences.push(`The pawn promotes to a ${PIECE_NAME[motifs.promotion]}. Promotion is the pawn's whole career: it becomes a new piece on the last rank.`);
  }
  if (motifs.opposition === 'direct') {
    sentences.push('The king takes the opposition. One square stands between the kings on the same file or rank, and it is the opponent to move.');
  } else if (motifs.opposition === 'diagonal') {
    sentences.push('The king takes the diagonal opposition, with one square between the kings on a diagonal.');
  }
  if (motifs.centralizing) {
    sentences.push('In the endgame the king is a fighting piece. This step brings it closer to the center.');
  }
  if (motifs.shelter) {
    sentences.push('That pawn move loosens the shield in front of the castled king. Air around the king helps the opponent later.');
  }
  if (motifs.isolated) {
    const owner = sideName(motifs.isolated.color);
    sentences.push(`The pawn on ${motifs.isolated.square} is isolated. ${owner} has no pawn on an adjacent file, so only pieces can defend it.`);
  }
  if (motifs.doubled && sentences.length < 3) {
    sentences.push(`Doubled pawns on the ${motifs.doubled.file}-file. Two pawns on one file cannot defend each other, and the extra pawn does not add a new file of space.`);
  }
  if (openingEntered) {
    sentences.push(`This is the ${openingEntered}.`);
  }
  if (motifs.discovered && !motifs.discoveredCheck) {
    sentences.push(`Discovered attack. Leaving ${move.from} unmasks the ${PIECE_NAME[motifs.discovered.sliderType]} on ${motifs.discovered.slider} against the ${PIECE_NAME[motifs.discovered.targetType]} on ${motifs.discovered.target}.`);
  }

  const uniqueSentences = [];
  for (const sentence of sentences) {
    if (sentence && !uniqueSentences.includes(sentence)) {
      uniqueSentences.push(sentence);
    }
  }
  return uniqueSentences.slice(0, 3);
}

function centerBishopNote(square) {
  if (square === 'e4') {
    return ' It also opens a diagonal for the queen and the light-squared bishop.';
  }
  if (square === 'd4') {
    return ' It also opens a diagonal for the queen and the dark-squared bishop.';
  }
  if (square === 'e5') {
    return ' It also opens a diagonal for the queen and the dark-squared bishop.';
  }
  if (square === 'd5') {
    return ' It also opens a diagonal for the queen and the light-squared bishop.';
  }
  return '';
}

export function sanLineFromUci(fen, uciMoves) {
  const chess = new Chess(fen);
  const sans = [];
  const plies = [];
  const moves = Array.isArray(uciMoves) ? uciMoves : [];
  for (const uci of moves) {
    const token = String(uci || '').toLowerCase();
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(token)) {
      break;
    }
    let move = null;
    try {
      move = chess.move({
        from: token.slice(0, 2),
        to: token.slice(2, 4),
        promotion: token.length > 4 ? token[4] : undefined,
      });
    } catch {
      move = null;
    }
    if (!move) {
      break;
    }
    sans.push(move.san);
    plies.push({
      san: move.san,
      fen: chess.fen(),
      from: move.from,
      to: move.to,
      color: move.color === 'w' ? 'white' : 'black',
    });
  }
  return { sans, plies };
}

export function buildCandidates(fen, entries, { gameSans = [] } = {}) {
  const sorted = [...(entries || [])].sort((a, b) => (a.multipv || 1) - (b.multipv || 1));
  if (!sorted.length) {
    return [];
  }
  const bestScore = sorted[0].score ?? null;
  const candidates = [];
  for (let index = 0; index < sorted.length; index += 1) {
    const entry = sorted[index];
    const line = sanLineFromUci(fen, entry.pv);
    if (!line.sans.length) {
      continue;
    }
    const note = annotateMove(fen, line.sans[0], {
      pvSans: line.sans,
      score: entry.score ?? null,
      bestScore,
      rank: entry.multipv || index + 1,
      gameSans,
      depth: entry.depth ?? null,
    });
    if (!note) {
      continue;
    }
    candidates.push({ ...note, pvUci: entry.pv, plies: line.plies });
  }
  return candidates;
}

export function narrateDecision({ actor, playedSan, candidates, playedNote = null }) {
  if (!playedSan || !candidates?.length) {
    return null;
  }
  const best = candidates[0];
  const match = candidates.find((candidate) => candidate.san === playedSan);
  if (match && (match.rank === 1 || match.san === best.san)) {
    const detail = match.paragraphs?.[0] || match.headline;
    return {
      title: `${actor} played ${playedSan}`,
      body: `That is the coach's first choice. ${match.headline}. ${detail}`,
    };
  }
  if (match) {
    return {
      title: `${actor} played ${playedSan}`,
      body: `The coach ranked this ${match.rankLabel.toLowerCase()}: ${match.headline}. The first choice was ${best.san} — ${best.headline}. ${match.gapNote || ''}`.trim(),
    };
  }
  const observed = playedNote?.paragraphs?.[0]
    ? `${playedNote.headline}. ${playedNote.paragraphs[0]} `
    : '';
  return {
    title: `${actor} played ${playedSan}`,
    body: `${observed}That move is outside the coach's main tries. The first choice was ${best.san}: ${best.headline}.`.trim(),
  };
}

export function parseInfoLine(line) {
  const text = String(line || '').trim();
  if (!text.startsWith('info ') || text.startsWith('info string')) {
    return null;
  }
  const tokens = text.split(/\s+/);
  const depthIndex = tokens.indexOf('depth');
  const scoreIndex = tokens.indexOf('score');
  const pvIndex = tokens.indexOf('pv');
  if (depthIndex < 0 || scoreIndex < 0 || pvIndex < 0) {
    return null;
  }
  const depth = Number(tokens[depthIndex + 1]);
  const multipvIndex = tokens.indexOf('multipv');
  const multipv = multipvIndex >= 0 ? Number(tokens[multipvIndex + 1]) : 1;
  const scoreType = tokens[scoreIndex + 1];
  const scoreValue = Number(tokens[scoreIndex + 2]);
  if (!depth || (scoreType !== 'cp' && scoreType !== 'mate') || !Number.isFinite(scoreValue)) {
    return null;
  }
  const bound = tokens[scoreIndex + 3];
  if (bound === 'upperbound' || bound === 'lowerbound') {
    return null;
  }
  const pv = tokens.slice(pvIndex + 1).filter((token) => /^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(token));
  if (!pv.length) {
    return null;
  }
  return {
    depth,
    multipv: multipv || 1,
    score: { type: scoreType, value: scoreValue },
    pv: pv.map((token) => token.toLowerCase()),
  };
}

/** Keep the deepest depth that actually produced a first-choice line. */
export function selectMultipv(depths) {
  if (!depths) {
    return [];
  }
  const keys = [...depths.keys()].sort((a, b) => b - a);
  for (const depth of keys) {
    const map = depths.get(depth);
    if (map?.has(1)) {
      return [...map.values()].sort((a, b) => a.multipv - b.multipv);
    }
  }
  return [];
}

function parseBestMove(line) {
  const text = String(line || '').trim();
  if (!text.startsWith('bestmove')) {
    return null;
  }
  return { none: !/^bestmove\s+[a-h][1-8]/i.test(text) };
}

/**
 * Second Stockfish worker. It searches MultiPV and returns lines.
 * It has no method that writes a move into the game.
 */
export class CoachEngine {
  constructor() {
    this.worker = null;
    this.ready = null;
    this.pending = null;
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
          reject(new Error('The coach engine timed out while starting.'));
        }
      }, 30_000);
      const onMessage = (event) => {
        const line = String(event.data ?? '');
        if (line === 'uciok') {
          worker.postMessage('setoption name MultiPV value 4');
          worker.postMessage('setoption name UCI_LimitStrength value false');
          worker.postMessage('setoption name Skill Level value 20');
          worker.postMessage('setoption name Hash value 16');
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
          reject(event.error || new Error('The coach engine failed to load.'));
        }
      });
      worker.postMessage('uci');
    });
    worker.addEventListener('message', (event) => this._onWorkerMessage(event));
  }

  _onWorkerMessage(event) {
    const line = String(event.data ?? '');
    const info = parseInfoLine(line);
    if (info && this.pending) {
      let byDepth = this.pending.depths.get(info.depth);
      if (!byDepth) {
        byDepth = new Map();
        this.pending.depths.set(info.depth, byDepth);
      }
      byDepth.set(info.multipv, info);
    }
    if (!parseBestMove(line) || !this.pending) {
      return;
    }
    this._searching = false;
    const { resolve, depths } = this.pending;
    this.pending = null;
    resolve(selectMultipv(depths));
  }

  _waitReady() {
    return new Promise((resolve, reject) => {
      const worker = this.worker;
      if (!worker) {
        reject(new Error('The coach engine is not running.'));
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

  _stopSearch() {
    if (!this.worker || (!this.pending && !this._searching)) {
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
   * @returns {Promise<Array<{depth:number,multipv:number,score:{type:string,value:number},pv:string[]}>>}
   */
  async analyze(fen, { depth = 12, movetime = 1200 } = {}) {
    await this.ensureReady();
    await this._stopSearch();
    this._searching = true;
    const depths = new Map();
    const searchDepth = Math.max(1, Number(depth) || 12);
    const searchTime = Math.max(200, Number(movetime) || 1200);
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject, depths };
      this.worker.postMessage(`position fen ${fen}`);
      this.worker.postMessage(`go depth ${searchDepth} movetime ${searchTime}`);
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
