import assert from 'node:assert/strict';
import test from 'node:test';

import {
  advanceCoaching,
  agreementText,
  coachAdvises,
  liveEnrollment,
} from '../web/lessons.js';

const setup = { phase: 'setup', enrolled: { white: false, black: false }, sans: [] };

test('the first move freezes each side’s coach', () => {
  const playing = advanceCoaching(setup, {
    live: true,
    offerCoaching: true,
    sans: ['e4'],
  }, { white: true, black: false });
  assert.equal(playing.phase, 'playing');
  assert.deepEqual(playing.enrolled, { white: true, black: false });

  const next = advanceCoaching(playing, {
    live: true,
    offerCoaching: true,
    sans: ['e4', 'e5'],
  }, { white: true, black: true });
  assert.equal(next.phase, 'playing');
  assert.deepEqual(next.enrolled, { white: true, black: false });
});

test('a pasted game does not inherit a coach, and a fresh board does', () => {
  const loaded = advanceCoaching(setup, {
    live: true,
    offerCoaching: true,
    sans: ['e4', 'e5', 'Nf3'],
  }, { white: true, black: true });
  assert.equal(loaded.phase, 'studying');
  assert.deepEqual(loaded.enrolled, { white: false, black: false });

  const again = advanceCoaching(loaded, {
    live: true,
    offerCoaching: true,
    sans: [],
  }, { white: true, black: false });
  assert.equal(again.phase, 'setup');
});

test('opening a board that already has moves stays locked', () => {
  const booting = advanceCoaching(setup, {
    live: true,
    offerCoaching: false,
    sans: [],
  }, { white: true, black: true });
  assert.equal(booting.phase, 'studying');

  const game = advanceCoaching(booting, {
    live: true,
    offerCoaching: false,
    sans: ['e4'],
  }, { white: true, black: true });
  assert.equal(game.phase, 'studying');
  assert.deepEqual(game.enrolled, { white: false, black: false });
});

test('stepping through history does not change the agreement', () => {
  const playing = advanceCoaching(setup, {
    live: true,
    offerCoaching: true,
    sans: ['e4'],
  }, { white: false, black: true });
  const reviewing = advanceCoaching(playing, {
    live: false,
    offerCoaching: true,
    sans: ['e4'],
  }, { white: true, black: true });
  assert.equal(reviewing.phase, 'playing');
  assert.deepEqual(reviewing.enrolled, { white: false, black: true });
});

test('starting the game freezes each coach before any move', () => {
  const playing = advanceCoaching(setup, {
    live: true,
    offerCoaching: true,
    gameStarted: true,
    sans: [],
  }, { white: true, black: false });
  assert.equal(playing.phase, 'playing');
  assert.deepEqual(playing.enrolled, { white: true, black: false });

  const moved = advanceCoaching(playing, {
    live: true,
    offerCoaching: true,
    gameStarted: true,
    sans: ['e4'],
  }, { white: true, black: true });
  assert.equal(moved.phase, 'playing');
  assert.deepEqual(moved.enrolled, { white: true, black: false });
});

test('two players are told who has a coach', () => {
  const names = { white: 'Ivory', black: 'Ebony' };
  assert.match(agreementText({
    phase: 'setup',
    enrolled: { white: false, black: false },
    sideNames: names,
  }), /Before Start game/);
  assert.match(agreementText({
    phase: 'setup',
    enrolled: { white: false, black: false },
    cpu: { enabled: true, humanSide: 'black', tossing: false },
    sideNames: names,
  }), /Start game/);
  assert.match(agreementText({
    phase: 'playing',
    enrolled: { white: true, black: false },
    sideNames: names,
  }), /Ivory is using the coach\. Ebony is not/);
  assert.match(agreementText({
    phase: 'playing',
    enrolled: { white: true, black: true },
    sideNames: names,
  }), /both using the coach/);
});

test('advice follows the side that chose a coach', () => {
  const both = { white: true, black: false };
  assert.equal(coachAdvises(both, { turn: 'white' }), true);
  assert.equal(coachAdvises(both, { turn: 'black' }), false);
  assert.equal(coachAdvises(both, { turn: 'white', isGameOver: true }), false);
  assert.deepEqual(
    liveEnrollment({ cpu: { enabled: true, humanSide: 'black' } }, { white: true, black: true }, true),
    { white: false, black: true },
  );
  assert.equal(coachAdvises(
    { white: false, black: true },
    { turn: 'white', cpu: { enabled: true, humanSide: 'black' } },
  ), true);
});
