import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CPU_LEVELS,
  STOCKFISH_ELO_MAX,
  STOCKFISH_ELO_MIN,
  cpuStrengthKey,
  pickDepthForElo,
  resolveCpuSearch,
  skillLevelForElo,
} from '../web/cpu.js';
import { appendSanToMovetext, legalMovesFromSquare, selectCpuMove } from '../web/engine.js';

test('Stockfish 18 Elo polynomial matches the published anchors', () => {
  assert.equal(skillLevelForElo(STOCKFISH_ELO_MIN), 0);
  const top = skillLevelForElo(STOCKFISH_ELO_MAX);
  assert.ok(top > 18 && top < 19, `expected skill(3190) just under 19, got ${top}`);
  assert.equal(pickDepthForElo(1320), 1);
  assert.equal(pickDepthForElo(2500), 1 + Math.floor(skillLevelForElo(2500)));
});

test('CPU presets climb in strength and stay on the calibrated search', () => {
  const levels = Object.values(CPU_LEVELS);
  for (let index = 1; index < levels.length; index += 1) {
    assert.ok(
      cpuStrengthKey(levels[index]) > cpuStrengthKey(levels[index - 1]),
      `${levels[index].id} should be stronger than ${levels[index - 1].id}`,
    );
  }

  for (const level of levels) {
    const search = resolveCpuSearch(level);
    if (!level.limitStrength) {
      assert.equal(search.go, `go movetime ${level.movetime}`);
      assert.equal(search.depth, null);
      continue;
    }
    assert.ok(level.elo >= STOCKFISH_ELO_MIN && level.elo <= STOCKFISH_ELO_MAX);
    assert.equal(search.depth, pickDepthForElo(level.elo));
    assert.equal(search.go, `go depth ${search.depth} movetime ${search.movetime}`);
    assert.equal(search.blunderRate, level.blunderRate);
  }

  assert.equal(CPU_LEVELS.beginner.blunderRate, 0.5);
  assert.equal(CPU_LEVELS.casual.blunderRate, 0.25);
  assert.equal(CPU_LEVELS.intermediate.blunderRate, 0);
  assert.ok(CPU_LEVELS.intermediate.elo < CPU_LEVELS.club.elo);
});

test('click moves append SAN with move numbers and a trailing space after White', () => {
  assert.equal(appendSanToMovetext([], 'e4'), '1. e4 ');
  assert.equal(appendSanToMovetext(['e4'], 'e5'), '1. e4 e5');
  assert.equal(appendSanToMovetext(['e4', 'e5'], 'Nf3'), '1. e4 e5 2. Nf3 ');
  assert.equal(appendSanToMovetext(['e4', 'e5', 'Nf3'], 'Nc6'), '1. e4 e5 2. Nf3 Nc6');
});

test('board clicks can see the legal moves from a square', () => {
  const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const moves = legalMovesFromSquare(start, 'e2').map((move) => move.san).sort();
  assert.deepEqual(moves, ['e3', 'e4']);
  assert.equal(legalMovesFromSquare(start, 'e3').length, 0);
});

test('sub-floor CPU levels mix in a random legal move at the stated rate', () => {
  const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const engineMove = { from: 'e2', to: 'e4' };
  const kept = selectCpuMove(fen, engineMove, { blunderRate: 0.5, rng: () => 0.9 });
  assert.equal(kept.san, 'e4');

  const values = [0, 0];
  const blundered = selectCpuMove(fen, engineMove, {
    blunderRate: 0.5,
    rng: () => values.shift(),
  });
  assert.notEqual(blundered.san, undefined);
  assert.equal(typeof blundered.from, 'string');
});
