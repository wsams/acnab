import assert from 'node:assert/strict';
import test from 'node:test';

import {
  annotateMove,
  buildCandidates,
  describeGap,
  evalCaption,
  formatWhiteEval,
  identifyOpening,
  moverGap,
  narrateDecision,
  parseInfoLine,
  rankLabelFor,
  selectMultipv,
} from '../web/coach.js';
import { renderLine } from '../web/engine.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

test('opening names follow the move list and stop at the longest real prefix', () => {
  assert.equal(identifyOpening(['e4']), "King's Pawn Opening");
  assert.equal(identifyOpening(['e4', 'c5']), 'Sicilian Defense');
  assert.equal(identifyOpening(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']), 'Ruy Lopez');
  assert.equal(identifyOpening(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']), 'Ruy Lopez, Morphy Defense');
  assert.equal(identifyOpening(['d4', 'd5', 'c4']), "Queen's Gambit");
  assert.equal(identifyOpening(['h3']), null);
});

test('eval is shown from White’s side, including mate scores', () => {
  assert.equal(formatWhiteEval({ type: 'cp', value: 32 }, 'white'), '+0.32');
  assert.equal(formatWhiteEval({ type: 'cp', value: 32 }, 'black'), '-0.32');
  assert.equal(formatWhiteEval({ type: 'mate', value: 2 }, 'white'), '+M2');
  assert.equal(formatWhiteEval({ type: 'mate', value: 2 }, 'black'), '-M2');
  assert.equal(evalCaption({ type: 'cp', value: 32 }, 'white'), 'White is slightly better.');
  assert.equal(evalCaption({ type: 'cp', value: 32 }, 'black'), 'Black is slightly better.');
  assert.equal(evalCaption({ type: 'mate', value: 3 }, 'white'), 'White forces mate in 3.');
});

test('candidate gaps use chess consequences, not a vague score dump', () => {
  assert.equal(moverGap({ type: 'cp', value: 40 }, { type: 'cp', value: 40 }).kind, 'best');
  assert.equal(moverGap({ type: 'cp', value: 10 }, { type: 'cp', value: 40 }).loss, 30);
  assert.equal(describeGap({ type: 'cp', value: 10 }, { type: 'cp', value: 40 }), 'A small concession, about 0.30 pawns.');
  assert.equal(moverGap({ type: 'cp', value: 80 }, { type: 'mate', value: 3 }).kind, 'missed-mate');
  assert.equal(describeGap({ type: 'cp', value: 80 }, { type: 'mate', value: 3 }), 'This misses a forced mate.');
  assert.equal(rankLabelFor(1, { kind: 'best', loss: 0 }), 'First choice');
  assert.equal(rankLabelFor(2, { kind: 'cp', loss: 30 }), 'Alternative');
  assert.equal(rankLabelFor(3, { kind: 'cp', loss: 180 }), 'Inaccuracy');
});

test('Stockfish info lines become principal variations, ignoring bounds', () => {
  const line = parseInfoLine('info depth 12 seldepth 18 multipv 2 score cp -15 nodes 10 nps 100 time 4 pv e7e5 g1f3');
  assert.equal(line.depth, 12);
  assert.equal(line.multipv, 2);
  assert.deepEqual(line.score, { type: 'cp', value: -15 });
  assert.deepEqual(line.pv, ['e7e5', 'g1f3']);
  assert.equal(parseInfoLine('info depth 8 multipv 1 score cp 10 upperbound nodes 1 pv e2e4'), null);
  assert.equal(parseInfoLine('info string NNUE evaluation using nn-file'), null);

  const depths = new Map([
    [10, new Map([[1, { depth: 10, multipv: 1, pv: ['e2e4'] }]])],
    [12, new Map([
      [2, { depth: 12, multipv: 2, pv: ['d2d4'] }],
      [1, { depth: 12, multipv: 1, pv: ['e2e4'] }],
    ])],
    [13, new Map([[2, { depth: 13, multipv: 2, pv: ['c2c4'] }]])],
  ]);
  const chosen = selectMultipv(depths);
  assert.equal(chosen[0].depth, 12);
  assert.deepEqual(chosen.map((entry) => entry.multipv), [1, 2]);
});

test('e4 is taught as a central pawn and the King’s Pawn Opening', () => {
  const note = annotateMove(START, 'e4', { gameSans: [], rank: 1, score: { type: 'cp', value: 20 }, bestScore: { type: 'cp', value: 20 } });
  assert.equal(note.san, 'e4');
  assert.ok(note.themes.includes('center'));
  assert.equal(note.opening, "King's Pawn Opening");
  assert.match(note.paragraphs.join(' '), /center/i);
  assert.match(note.paragraphs.join(' '), /light-squared bishop/);
});

test('Bb5 in the Ruy is pressure, not an absolute pin, while the d-pawn blocks', () => {
  const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';
  const note = annotateMove(fen, 'Bb5', { gameSans: ['e4', 'e5', 'Nf3', 'Nc6'] });
  assert.equal(note.opening, 'Ruy Lopez');
  assert.equal(note.headline, 'Ruy Lopez');
  assert.ok(note.themes.includes('development'));
  assert.ok(note.themes.includes('xray'));
  assert.equal(note.themes.includes('pin'), false);
  const text = note.paragraphs.join(' ');
  assert.match(text, /not yet a pin/i);
  assert.match(text, /d7/);
});

test('an absolute pin is named only when the king really stands behind the piece', () => {
  const fen = 'r1bqkbnr/ppp2ppp/2np4/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 4';
  const note = annotateMove(fen, 'Bb5');
  assert.ok(note.themes.includes('pin'));
  assert.match(note.headline, /pin/i);
  assert.match(note.paragraphs.join(' '), /Absolute pin/);
  assert.match(note.paragraphs.join(' '), /c6/);
});

test('a knight fork is called a fork and a check', () => {
  const fen = 'r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1';
  const note = annotateMove(fen, 'Nc7');
  assert.equal(note.san, 'Nc7+');
  assert.ok(note.themes.includes('fork'));
  assert.ok(note.themes.includes('check'));
  assert.match(note.headline, /fork/i);
  assert.match(note.paragraphs.join(' '), /king/i);
  assert.match(note.paragraphs.join(' '), /a8/);
});

test('discovered check names the piece that was unmasked', () => {
  const fen = '7k/8/8/8/8/8/1N6/B3K3 w - - 0 1';
  const note = annotateMove(fen, 'Nc4');
  assert.ok(note.themes.includes('discovered-check'));
  assert.match(note.headline, /Discovered check/);
  assert.match(note.paragraphs.join(' '), /bishop on a1/i);
});

test('castling, pawn breaks, outposts, passed pawns, and open files use their names', () => {
  const castle = annotateMove(
    'rnbqk2r/pppp1ppp/5n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
    'O-O',
  );
  assert.ok(castle.themes.includes('castle-kingside'));
  assert.match(castle.paragraphs.join(' '), /pawn shield/);

  const breakMove = annotateMove(
    'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1',
    'c5',
  );
  assert.ok(breakMove.themes.includes('pawn-break'));
  assert.match(breakMove.paragraphs.join(' '), /d4/);

  const outpost = annotateMove('4k3/8/8/8/2P5/2N5/8/4K3 w - - 0 1', 'Nd5');
  assert.ok(outpost.themes.includes('outpost'));
  assert.match(outpost.headline, /d5/);

  const passed = annotateMove('4k3/8/4P3/8/8/8/8/4K3 w - - 0 1', 'e7');
  assert.ok(passed.themes.includes('passed-pawn'));

  const file = annotateMove('4k3/8/8/8/8/8/8/R3K3 w - - 0 1', 'Rc1');
  assert.ok(file.themes.includes('open-file'));
  assert.match(file.headline, /c-file/);
});

test('opposition and prophylaxis are recognized from the geometry', () => {
  const opposition = annotateMove('8/8/8/4k3/8/8/4K3/8 w - - 0 1', 'Ke3');
  assert.ok(opposition.themes.includes('opposition'));
  assert.match(opposition.paragraphs.join(' '), /opposition/i);

  const prophylaxis = annotateMove(
    'rnbqkbnr/pp3ppp/8/2pp4/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 4',
    'h3',
  );
  assert.ok(prophylaxis.themes.includes('prophylaxis'));
  assert.match(prophylaxis.paragraphs.join(' '), /g4/);
  assert.match(prophylaxis.paragraphs.join(' '), /f3/);
});

test('1.e4 Nf6 is Alekhine, and 2.e5 is called an attack on that knight', () => {
  const alekhine = annotateMove(
    'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    'Nf6',
    { gameSans: ['e4'] },
  );
  assert.equal(alekhine.opening, "Alekhine's Defense");
  assert.equal(alekhine.headline, "Alekhine's Defense");

  const chase = annotateMove(
    'rnbqkb1r/pppppppp/5n2/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 1 2',
    'e5',
  );
  assert.ok(chase.themes.includes('tempo'));
  assert.match(chase.headline, /knight/i);
  assert.match(chase.paragraphs.join(' '), /f6/);
});

test('a principal variation becomes SAN options with a continuation', () => {
  const candidates = buildCandidates(START, [
    { depth: 12, multipv: 1, score: { type: 'cp', value: 30 }, pv: ['e2e4', 'e7e5', 'g1f3'] },
    { depth: 12, multipv: 2, score: { type: 'cp', value: -5 }, pv: ['d2d4', 'd7d5', 'c2c4'] },
  ]);
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].san, 'e4');
  assert.equal(candidates[0].rankLabel, 'First choice');
  assert.match(candidates[0].continuation, /e5 Nf3/);
  assert.equal(candidates[1].san, 'd4');
  assert.equal(candidates[1].rankLabel, 'Alternative');
  assert.equal(candidates[1].plies[0].from, 'd2');
});

test('the coach compares a played move with the tries it already had', () => {
  const candidates = buildCandidates(
    'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    [
      { depth: 10, multipv: 1, score: { type: 'cp', value: 28 }, pv: ['c7c5'] },
      { depth: 10, multipv: 2, score: { type: 'cp', value: 12 }, pv: ['e7e5'] },
    ],
  );
  const best = narrateDecision({ actor: 'The CPU', playedSan: 'c5', candidates });
  assert.match(best.body, /first choice/);
  const other = narrateDecision({ actor: 'You', playedSan: 'e5', candidates });
  assert.match(other.title, /e5/);
  assert.match(other.body, /c5/);
  const outside = narrateDecision({ actor: 'The CPU', playedSan: 'a5', candidates });
  assert.match(outside.body, /outside the coach's main tries/);
});

test('a preview line can be rendered from a FEN without rewriting the game', () => {
  const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
  const line = renderLine(fen, ['c5', 'Nf3']);
  assert.deepEqual(line.appliedMoves, ['c5', 'Nf3']);
  assert.equal(line.history.at(-1).to, 'f3');
  assert.equal(line.turn, 'black');
  assert.equal(line.board.length, 8);
});
