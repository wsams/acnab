import assert from 'node:assert/strict';
import test from 'node:test';

import { CLOCK_MODES, ChessClock } from '../web/clock.js';

test('off mode never runs and shows Off', () => {
  const clock = new ChessClock({ mode: 'off', baseMs: 60_000, incrementMs: 1000 });
  clock.press('white');
  clock.setActive('black', { start: true });
  clock.afterMove('black');
  clock.ensureRunning();
  const snap = clock.snapshot();
  assert.equal(snap.mode, 'off');
  assert.equal(snap.running, false);
  assert.equal(snap.active, null);
  assert.equal(snap.display.white, 'Off');
  assert.equal(snap.display.black, 'Off');
  assert.equal(CLOCK_MODES.off.label, 'Off');
});

test('pause stops a running clock until it is resumed', () => {
  const clock = new ChessClock({ mode: 'live', baseMs: 60_000 });
  clock.press('white');
  assert.equal(clock.snapshot().running, true);
  assert.equal(clock.snapshot().active, 'white');
  clock.pause();
  const paused = clock.snapshot();
  assert.equal(paused.running, false);
  assert.equal(paused.active, 'white');
  clock.ensureRunning();
  assert.equal(clock.snapshot().running, true);
  assert.equal(clock.snapshot().active, 'white');
});
