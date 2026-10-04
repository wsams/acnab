/**
 * Lessons portal.
 *
 * A second engine reads the live position and explains candidate moves.
 * Previewing steps through a line on the board without writing notation.
 * The student makes the real move themselves, or presses Play on a try.
 */

import { Chess } from './vendor/chess.js';
import { renderLine } from './engine.js';
import {
  CoachEngine,
  DEFAULT_LESSON_DEPTH,
  LESSON_DEPTHS,
  annotateMove,
  buildCandidates,
  narrateDecision,
  resolveLessonDepth,
} from './coach.js';

const STORAGE_ENABLED = 'acnab:lessons';
const STORAGE_DEPTH = 'acnab:lessons-depth';
const STORAGE_WHITE = 'acnab:lessons-white';
const STORAGE_BLACK = 'acnab:lessons-black';
const STORAGE_SELF = 'acnab:lessons-self';

function emptySeats() {
  return { white: false, black: false };
}

function sameSans(left, right) {
  return left.length === right.length && left.every((san, index) => san === right[index]);
}

function extendsByOne(previous, next) {
  return next.length === previous.length + 1
    && previous.every((san, index) => san === next[index]);
}

function rewindsByOne(previous, next) {
  return next.length === previous.length - 1
    && next.every((san, index) => san === previous[index]);
}

/**
 * Coaching is chosen while the board is still the start position.
 * The first ply freezes that choice. A jump straight into a played game
 * (a save, a share, a paste) does not carry a coach.
 */
export function advanceCoaching(state, ctx, enrollment) {
  const sans = Array.isArray(ctx?.sans) ? ctx.sans : [];
  const previous = state?.phase
    ? state
    : { phase: 'setup', enrolled: emptySeats(), sans: [] };

  if (!ctx?.live) {
    return {
      phase: previous.phase,
      enrolled: previous.enrolled || emptySeats(),
      sans: previous.sans || [],
    };
  }
  if (sans.length === 0) {
    if (ctx.offerCoaching) {
      return { phase: 'setup', enrolled: emptySeats(), sans: [] };
    }
    if (previous.phase === 'playing') {
      return {
        phase: 'playing',
        enrolled: previous.enrolled || emptySeats(),
        sans: [],
      };
    }
    return { phase: 'studying', enrolled: emptySeats(), sans: previous.sans || [] };
  }
  if (previous.phase === 'setup') {
    if (sans.length === 1) {
      return {
        phase: 'playing',
        enrolled: {
          white: Boolean(enrollment?.white),
          black: Boolean(enrollment?.black),
        },
        sans: sans.slice(),
      };
    }
    return { phase: 'studying', enrolled: emptySeats(), sans: sans.slice() };
  }
  if (previous.phase === 'playing') {
    const prior = previous.sans || [];
    if (sameSans(prior, sans) || extendsByOne(prior, sans) || rewindsByOne(prior, sans)) {
      return {
        phase: 'playing',
        enrolled: previous.enrolled || emptySeats(),
        sans: sans.slice(),
      };
    }
    return { phase: 'studying', enrolled: emptySeats(), sans: sans.slice() };
  }
  return { phase: 'studying', enrolled: emptySeats(), sans: sans.slice() };
}

export function liveEnrollment(ctx, prefs, selfCoach) {
  if (ctx?.cpu?.enabled) {
    const human = ctx.cpu.humanSide;
    if (human === 'white' || human === 'black') {
      return {
        white: human === 'white' && Boolean(selfCoach),
        black: human === 'black' && Boolean(selfCoach),
      };
    }
    return emptySeats();
  }
  return {
    white: Boolean(prefs?.white),
    black: Boolean(prefs?.black),
  };
}

export function coachAdvises(enrolled, ctx) {
  if (!enrolled || ctx?.isGameOver) {
    return false;
  }
  if (ctx?.cpu?.enabled) {
    const human = ctx.cpu.humanSide;
    return Boolean(human && enrolled[human]);
  }
  const turn = ctx?.turn === 'black' ? 'black' : 'white';
  return Boolean(enrolled[turn]);
}

export function agreementText({ phase, enrolled, cpu, sideNames }) {
  const white = sideNames?.white || 'White';
  const black = sideNames?.black || 'Black';
  if (phase === 'studying') {
    return 'This board already has moves. Coaching is chosen on a new board, before the first move, so both players can see it.';
  }
  if (phase === 'setup') {
    if (cpu?.enabled) {
      if (cpu.tossing) {
        return 'Tossing for colors. Turn your coach on or off before the first move. That choice stays on the board for the match.';
      }
      if (cpu.humanSide === 'white' || cpu.humanSide === 'black') {
        const you = cpu.humanSide === 'black' ? black : white;
        return `You have ${you}. Turn your coach on or off before the first move. The choice stays on the board once the match starts.`;
      }
      return 'Turn your coach on before the first move. The choice stays on the board for the whole match.';
    }
    return `Before the first move, ${white} and ${black} each choose a coach. Both players can see the choice. It cannot be turned on after the game starts.`;
  }
  if (cpu?.enabled) {
    const human = cpu.humanSide;
    const on = human && enrolled?.[human];
    return on
      ? 'You are using the coach this match. That was set before the first move.'
      : 'You are playing this match without a coach. That was set before the first move.';
  }
  const whiteOn = Boolean(enrolled?.white);
  const blackOn = Boolean(enrolled?.black);
  if (whiteOn && blackOn) {
    return `${white} and ${black} are both using the coach. Tries show for the side to move. Both players can see this.`;
  }
  if (!whiteOn && !blackOn) {
    return 'Neither player is using the coach. That was set before the first move.';
  }
  const using = whiteOn ? white : black;
  const plain = whiteOn ? black : white;
  return `${using} is using the coach. ${plain} is not. Both players can see this. It was set before the first move.`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character]));
}

function readDepth() {
  try {
    return resolveLessonDepth(localStorage.getItem(STORAGE_DEPTH));
  } catch {
    return DEFAULT_LESSON_DEPTH;
  }
}

function studentToMove(ctx, enrolled) {
  if (!coachAdvises(enrolled, ctx)) {
    return false;
  }
  if (ctx?.cpu?.enabled && ctx.cpu.humanSide) {
    return ctx.turn === ctx.cpu.humanSide;
  }
  return true;
}

function actorName(move, ctx) {
  const color = move?.color === 'black' ? 'black' : 'white';
  const names = ctx?.sideNames || { white: 'White', black: 'Black' };
  if (ctx?.cpu?.enabled && ctx.cpu.cpuSide && color === ctx.cpu.cpuSide) {
    return 'The CPU';
  }
  if (ctx?.cpu?.enabled && ctx.cpu.humanSide && color === ctx.cpu.humanSide) {
    return 'You';
  }
  return names[color];
}

function gameOverCopy(ctx) {
  if (ctx.isCheckmate) {
    return 'Checkmate. The king is in check, and no capture, block, or flight saves it. That is the end of the game.';
  }
  if (/stalemate/i.test(ctx.status || '')) {
    return 'Stalemate. The side to move is not in check, but no legal move exists, so the game is drawn. Winning endgames are often lost this way.';
  }
  if (/insufficient/i.test(ctx.status || '')) {
    return 'Insufficient material. Neither side has enough force left to force mate, so the game is drawn.';
  }
  if (/repetition/i.test(ctx.status || '')) {
    return 'Threefold repetition. The same position has occurred three times, and a draw can be claimed.';
  }
  if (/fifty/i.test(ctx.status || '')) {
    return 'The fifty-move rule. Fifty moves have passed without a pawn move or a capture, so a draw can be claimed.';
  }
  return ctx.status || 'The game is over.';
}

function formatLine(fen, sans, cursor) {
  const fields = String(fen || '').split(' ');
  let fullmove = Number(fields[5]) || 1;
  let side = fields[1] === 'b' ? 'b' : 'w';
  return sans.map((san, index) => {
    let prefix = '';
    if (side === 'w') {
      prefix = `${fullmove}. `;
    } else if (index === 0) {
      prefix = `${fullmove}... `;
    }
    const current = index + 1 === cursor ? ' is-current' : '';
    const button = `<button type="button" class="lesson-ply${current}" data-ply="${index + 1}">${prefix}${escapeHtml(san)}</button>`;
    if (side === 'b') {
      fullmove += 1;
    }
    side = side === 'w' ? 'b' : 'w';
    return button;
  }).join(' ');
}

function readFlag(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    if (value === '1') {
      return true;
    }
    if (value === '0') {
      return false;
    }
  } catch {
    // Ignore storage failures and use the fallback.
  }
  return fallback;
}

function writeFlag(key, on) {
  try {
    localStorage.setItem(key, on ? '1' : '0');
    localStorage.removeItem(STORAGE_ENABLED);
  } catch {
    // The choice still applies for this visit.
  }
}

function readCoachPrefs() {
  let legacy = false;
  try {
    legacy = localStorage.getItem(STORAGE_ENABLED) === '1';
  } catch {
    legacy = false;
  }
  return {
    white: readFlag(STORAGE_WHITE, legacy),
    black: readFlag(STORAGE_BLACK, legacy),
    selfCoach: readFlag(STORAGE_SELF, legacy),
  };
}

export function mountLessonPortal({ onPreview, onClearPreview, onPlayMove, getContext }) {
  const panel = document.querySelector('#lessons-panel');
  const intro = document.querySelector('#lessons-intro');
  const agreement = document.querySelector('#lessons-agreement');
  const seatWhite = document.querySelector('#lessons-seat-white');
  const seatBlack = document.querySelector('#lessons-seat-black');
  const seatSelf = document.querySelector('#lessons-seat-self');
  const body = document.querySelector('#lessons-body');
  const depthRow = document.querySelector('#lessons-depth');
  const depthHint = document.querySelector('#lessons-depth-hint');
  const status = document.querySelector('#lessons-status');
  const decision = document.querySelector('#lessons-decision');
  const previewBox = document.querySelector('#lessons-preview');
  const options = document.querySelector('#lessons-options');
  const engine = new CoachEngine();
  const stored = readCoachPrefs();

  const portal = {
    prefs: { white: stored.white, black: stored.black },
    selfCoach: stored.selfCoach,
    depthId: readDepth(),
    phaseState: { phase: 'setup', enrolled: emptySeats(), sans: [] },
    token: 0,
    seenFen: null,
    brief: null,
    decision: null,
    forecast: null,
    analyzingFen: null,
    preview: null,
    lastPayload: null,
    watchTimer: null,
  };

  function setStatus(text) {
    if (status && status.textContent !== text) {
      status.textContent = text;
    }
  }

  function enrollmentFor(ctx) {
    if (portal.phaseState.phase === 'setup') {
      return liveEnrollment(ctx, portal.prefs, portal.selfCoach);
    }
    return portal.phaseState.enrolled || emptySeats();
  }

  function sideLabel(ctx, color) {
    const names = ctx?.sideNames || { white: 'White', black: 'Black' };
    return color === 'black' ? names.black : names.white;
  }

  function paintSeat(button, { pressed, label, visible, locked }) {
    if (!button) {
      return;
    }
    button.hidden = !visible;
    button.disabled = locked;
    button.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    button.textContent = label;
    button.title = locked
      ? 'Coaching is chosen before the first move.'
      : 'Both players can see this choice.';
  }

  function stopWatch() {
    portal.watching = false;
    if (portal.watchTimer != null) {
      window.clearTimeout(portal.watchTimer);
      portal.watchTimer = null;
    }
  }

  function exitPreview({ restore = true } = {}) {
    stopWatch();
    portal.preview = null;
    portal.lastPayload = null;
    onClearPreview?.({ restore });
  }

  function paintPreview() {
    const preview = portal.preview;
    if (!preview) {
      return;
    }
    const cursor = Math.max(0, Math.min(preview.cursor, preview.sans.length));
    preview.cursor = cursor;
    let game = null;
    try {
      game = renderLine(preview.anchorFen, preview.sans.slice(0, cursor));
    } catch {
      exitPreview({ restore: true });
      return;
    }
    const move = cursor > 0 ? game.history[cursor - 1] : null;
    const played = preview.sans.slice(0, cursor).join(' ');
    const payload = {
      anchorFen: preview.anchorFen,
      game,
      from: move?.from ?? null,
      to: move?.to ?? null,
      banner: cursor === 0
        ? 'Lesson line — back on the game position. Nothing has been played.'
        : `Lesson line · ${played} — not in the game until you press Play.`,
    };
    portal.lastPayload = payload;
    onPreview?.(payload);
    render();
  }

  function openPreview(candidate) {
    const ctx = getContext?.();
    if (!ctx?.fen || !candidate?.plies?.length) {
      return;
    }
    stopWatch();
    portal.preview = {
      anchorFen: ctx.fen,
      sans: candidate.plies.slice(0, 8).map((ply) => ply.san),
      cursor: 1,
      playSan: candidate.san,
      allowPlay: studentToMove(ctx),
      headline: candidate.headline,
    };
    paintPreview();
  }

  function step(delta) {
    if (!portal.preview) {
      return;
    }
    stopWatch();
    portal.preview.cursor += delta;
    paintPreview();
  }

  function watchLine() {
    if (!portal.preview) {
      return;
    }
    if (portal.watching) {
      stopWatch();
      render();
      return;
    }
    portal.watching = true;
    const tick = () => {
      if (!portal.watching || !portal.preview) {
        return;
      }
      if (portal.preview.cursor >= portal.preview.sans.length) {
        stopWatch();
        render();
        return;
      }
      portal.preview.cursor += 1;
      paintPreview();
      portal.watchTimer = window.setTimeout(tick, 720);
    };
    tick();
  }

  async function playSan(san) {
    const ctx = getContext?.();
    const enrolled = enrollmentFor(ctx || {});
    if (!ctx || !studentToMove(ctx, enrolled)) {
      setStatus(ctx?.cpu?.enabled
        ? 'The CPU is to move. The coach can show the idea, and you play on your own turn.'
        : 'The coach writes a move only for the side that chose it, and only on that side’s turn.');
      return;
    }
    exitPreview({ restore: false });
    await onPlayMove?.(san);
  }

  function explainTransition(previousFen, ctx) {
    const last = ctx.lastMove;
    if (!previousFen || !last?.san || !ctx.sans?.length) {
      return null;
    }
    const chess = new Chess(previousFen);
    let move = null;
    try {
      move = chess.move(last.san, { strict: false });
    } catch {
      move = null;
    }
    if (!move || chess.fen() !== ctx.fen) {
      portal.forecast = null;
      return null;
    }
    const actor = actorName(last, ctx);
    if (portal.brief?.fen === previousFen && portal.brief.candidates?.length) {
      const match = portal.brief.candidates.find((candidate) => candidate.san === move.san);
      const reply = match?.plies?.[1];
      portal.forecast = reply
        ? { fen: match.plies[0].fen, san: reply.san }
        : null;
      const playedNote = match
        ? null
        : annotateMove(previousFen, move.san, { gameSans: ctx.sans.slice(0, -1) });
      return narrateDecision({
        actor,
        playedSan: move.san,
        candidates: portal.brief.candidates,
        playedNote,
      });
    }
    if (portal.forecast?.fen === previousFen) {
      const expected = portal.forecast.san;
      portal.forecast = null;
      if (expected === move.san) {
        return {
          title: `${actor} played ${move.san}`,
          body: 'That is the reply the coach had already lined up from the previous line.',
        };
      }
      return {
        title: `${actor} played ${move.san}`,
        body: `The coach had expected ${expected} from the line it was considering. ${move.san} is a different idea, and the coach is reading the new position.`,
      };
    }
    return null;
  }

  function renderDepth(locked) {
    const current = LESSON_DEPTHS[portal.depthId];
    depthRow?.querySelectorAll('[data-depth]').forEach((button) => {
      const on = button.dataset.depth === portal.depthId;
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
      button.disabled = locked;
    });
    if (depthHint) {
      const description = current?.description ?? '';
      depthHint.textContent = locked
        ? `${description} Depth stays as it was before the first move.`
        : description;
    }
  }

  function renderPreviewBox(ctx) {
    const preview = portal.preview;
    if (!previewBox) {
      return;
    }
    if (!preview) {
      previewBox.hidden = true;
      previewBox.innerHTML = '';
      return;
    }
    const allowPlay = studentToMove(ctx, enrollmentFor(ctx));
    preview.allowPlay = allowPlay;
    previewBox.hidden = false;
    previewBox.innerHTML = `
      <p class="lessons-kicker">Line preview</p>
      <p class="lessons-preview-headline">${escapeHtml(preview.headline || 'Variation')}</p>
      <div class="lessons-line">${formatLine(preview.anchorFen, preview.sans, preview.cursor)}</div>
      <p class="lessons-preview-count">${preview.cursor} / ${preview.sans.length} · nothing is written into the game</p>
      <div class="lessons-preview-controls">
        <button type="button" class="button ghost small" data-act="start">Start</button>
        <button type="button" class="button ghost small" data-act="prev">Prev</button>
        <button type="button" class="button ghost small" data-act="watch">${portal.watching ? 'Stop' : 'Watch'}</button>
        <button type="button" class="button ghost small" data-act="next">Next</button>
        <button type="button" class="button ghost small" data-act="end">End</button>
      </div>
      <div class="lessons-preview-actions">
        <button type="button" class="button ghost" data-act="back">Back to the game</button>
        ${allowPlay
          ? `<button type="button" class="button primary" data-act="play">Play ${escapeHtml(preview.playSan)}</button>`
          : `<p class="lessons-wait">${escapeHtml(ctx?.cpu?.enabled
            ? 'The CPU is to move. Watch the idea, then answer on your turn.'
            : 'This preview is for the side that chose the coach.')}</p>`}
      </div>
    `;
  }

  function renderOptions(ctx) {
    if (!options) {
      return;
    }
    if (portal.preview) {
      options.hidden = true;
      options.innerHTML = '';
      return;
    }
    const shown = portal.brief?.fen === ctx.fen ? portal.brief.candidates : [];
    if (!shown?.length) {
      options.hidden = true;
      options.innerHTML = '';
      return;
    }
    const enrolled = enrollmentFor(ctx);
    const yours = studentToMove(ctx, enrolled);
    const turnName = sideLabel(ctx, ctx.turn === 'black' ? 'black' : 'white');
    const heading = ctx.cpu?.enabled
      ? (yours ? 'Tries for you' : 'What the coach would play for the CPU')
      : `Tries for ${turnName}`;
    const note = ctx.cpu?.enabled
      ? (yours
        ? 'Preview any try. The board shows the line and the notation stays put until you press Play or make your own move.'
        : 'The CPU may choose something else. Preview a line to see why the coach likes it. These moves are not yours to play.')
      : 'Both players can see that this side is using the coach. Preview a line, then press Play or move the piece yourself. The notation stays put until then.';
    options.hidden = false;
    options.innerHTML = `
      <li class="lessons-options-intro">
        <p class="lessons-kicker">${escapeHtml(heading)}</p>
        <p>${escapeHtml(note)}</p>
      </li>
      ${shown.map((candidate, index) => `
        <li class="lesson-card" data-index="${index}">
          <div class="lesson-card-top">
            <span class="lesson-san">${escapeHtml(candidate.san)}</span>
            <span class="lesson-eval" title="${escapeHtml(candidate.evalCaption || 'White’s point of view')}">${escapeHtml(candidate.evalLabel)}</span>
          </div>
          <p class="lesson-rank">${escapeHtml(candidate.rankLabel)} · ${escapeHtml(candidate.headline)}</p>
          ${candidate.themeLabels?.length
            ? `<ul class="lesson-chips">${candidate.themeLabels.map((label) => `<li>${escapeHtml(label)}</li>`).join('')}</ul>`
            : ''}
          ${candidate.paragraphs.map((paragraph) => `<p class="lesson-copy">${escapeHtml(paragraph)}</p>`).join('')}
          ${candidate.continuation ? `<p class="lesson-continuation">${escapeHtml(candidate.continuation)}</p>` : ''}
          ${candidate.gapNote ? `<p class="lesson-gap">${escapeHtml(candidate.gapNote)}</p>` : ''}
          <div class="lesson-card-actions">
            <button type="button" class="button ghost small" data-preview="${index}">Preview line</button>
            ${yours ? `<button type="button" class="button primary small" data-play="${index}">Play ${escapeHtml(candidate.san)}</button>` : ''}
          </div>
        </li>
      `).join('')}
    `;
  }

  function render(ctx = getContext?.() || {}) {
    const phase = portal.phaseState.phase;
    const enrolled = enrollmentFor(ctx);
    const advising = Boolean(ctx.live) && coachAdvises(enrolled, ctx);
    const showBody = advising;
    const cpuOn = Boolean(ctx.cpu?.enabled);
    const locked = phase !== 'setup';
    panel?.setAttribute('data-enabled', showBody ? 'true' : 'false');
    panel?.setAttribute('data-phase', phase);
    panel?.classList.toggle('is-thinking', Boolean(portal.analyzingFen));
    panel?.classList.toggle('is-preview', Boolean(portal.preview));
    if (agreement) {
      let text = agreementText({
        phase,
        enrolled,
        cpu: ctx.cpu,
        sideNames: ctx.sideNames,
      });
      if (phase === 'playing' && ctx.live === false) {
        text = `${text} Lessons follow the live board. Go to the last move to keep the lesson going.`;
      }
      agreement.textContent = text;
    }
    if (intro) {
      intro.hidden = phase !== 'setup';
    }
    const whiteName = sideLabel(ctx, 'white');
    const blackName = sideLabel(ctx, 'black');
    paintSeat(seatWhite, {
      visible: !cpuOn,
      locked,
      pressed: enrolled.white,
      label: `${whiteName}: coach ${enrolled.white ? 'on' : 'off'}`,
    });
    paintSeat(seatBlack, {
      visible: !cpuOn,
      locked,
      pressed: enrolled.black,
      label: `${blackName}: coach ${enrolled.black ? 'on' : 'off'}`,
    });
    const selfOn = Boolean(ctx.cpu?.humanSide
      ? enrolled[ctx.cpu.humanSide]
      : portal.selfCoach);
    const selfName = ctx.cpu?.humanSide ? sideLabel(ctx, ctx.cpu.humanSide) : '';
    paintSeat(seatSelf, {
      visible: cpuOn,
      locked,
      pressed: selfOn,
      label: selfName
        ? `Your coach: ${selfOn ? 'on' : 'off'} · ${selfName}`
        : `Your coach: ${selfOn ? 'on' : 'off'}`,
    });
    if (body) {
      body.hidden = !showBody;
    }
    if (decision) {
      decision.hidden = !portal.decision;
      decision.innerHTML = portal.decision
        ? `<p class="lessons-kicker">What just happened</p><h3>${escapeHtml(portal.decision.title)}</h3><p>${escapeHtml(portal.decision.body)}</p>`
        : '';
    }
    if (!showBody) {
      return;
    }
    renderDepth(locked);
    renderPreviewBox(ctx);
    renderOptions(ctx);
  }

  async function startAnalysis(ctx) {
    const token = portal.token + 1;
    portal.token = token;
    const depth = LESSON_DEPTHS[portal.depthId];
    portal.analyzingFen = ctx.fen;
    const yours = studentToMove(ctx, enrollmentFor(ctx));
    const turnName = sideLabel(ctx, ctx.turn === 'black' ? 'black' : 'white');
    setStatus(ctx.cpu?.enabled
      ? (yours
        ? 'Coach is reading your position…'
        : 'Coach is reading the position while the CPU thinks…')
      : `Coach is reading the position for ${turnName}…`);
    render();
    try {
      const entries = await engine.analyze(ctx.fen, depth);
      if (token !== portal.token) {
        return;
      }
      const latest = getContext?.();
      if (!latest || latest.fen !== ctx.fen || !coachAdvises(enrollmentFor(latest), latest)) {
        return;
      }
      const multipv = entries.slice(0, depth.multipv);
      const candidates = buildCandidates(ctx.fen, multipv, { gameSans: latest.sans || [] });
      portal.brief = {
        fen: ctx.fen,
        candidates,
        depth: multipv[0]?.depth ?? null,
      };
      portal.analyzingFen = null;
      if (!candidates.length) {
        setStatus('The coach finished without a line. Try Master class, or play a move and it will read the next position.');
      } else {
        const best = candidates[0];
        const depthText = portal.brief.depth ? `depth ${portal.brief.depth}` : depth.label;
        setStatus(`${depth.label} · ${depthText} · ${best.evalLabel} from White’s side. ${best.evalCaption}`);
      }
      render();
    } catch (error) {
      if (token !== portal.token) {
        return;
      }
      portal.analyzingFen = null;
      if (error?.message === 'Search cancelled.') {
        return;
      }
      setStatus(error?.message || 'The coach could not start in this browser.');
      render();
    }
  }

  function haltSearch() {
    engine.stop();
    portal.analyzingFen = null;
    portal.token += 1;
  }

  function sync(ctx) {
    if (!ctx?.fen) {
      render(ctx || {});
      return;
    }
    const offered = portal.phaseState.phase === 'setup'
      ? liveEnrollment(ctx, portal.prefs, portal.selfCoach)
      : portal.phaseState.enrolled;
    const nextPhase = advanceCoaching(portal.phaseState, ctx, offered);
    const enteredStudy = nextPhase.phase === 'studying' && portal.phaseState.phase !== 'studying';
    portal.phaseState = nextPhase;

    if (enteredStudy) {
      haltSearch();
      portal.forecast = null;
      portal.brief = null;
      portal.decision = null;
      portal.seenFen = ctx.fen;
      if (portal.preview) {
        exitPreview({ restore: true });
      }
      setStatus('');
      render(ctx);
      return;
    }

    if (!ctx.live) {
      haltSearch();
      if (portal.preview) {
        exitPreview({ restore: false });
      }
      setStatus('Lessons follow the live board. Go to the last move to keep the lesson going.');
      render(ctx);
      return;
    }

    const enrolled = enrollmentFor(ctx);
    const advising = coachAdvises(enrolled, ctx);

    if (ctx.fen !== portal.seenFen) {
      const previousFen = portal.seenFen;
      portal.decision = previousFen && ctx.sans?.length && nextPhase.phase === 'playing'
        ? explainTransition(previousFen, ctx)
        : null;
      portal.seenFen = ctx.fen;
    }

    if (ctx.cpu?.tossing || ctx.isGameOver || !advising) {
      haltSearch();
      if (portal.preview) {
        exitPreview({ restore: ctx.cpu?.tossing || !advising });
      }
      if (ctx.isGameOver) {
        setStatus(gameOverCopy(ctx));
      } else {
        setStatus('');
      }
      render(ctx);
      return;
    }

    if (portal.preview && portal.preview.anchorFen !== ctx.fen) {
      exitPreview({ restore: false });
    }

    if (portal.preview && portal.preview.anchorFen === ctx.fen) {
      paintPreview();
      return;
    }

    if (portal.brief?.fen === ctx.fen && !portal.analyzingFen) {
      const best = portal.brief.candidates[0];
      if (best) {
        const depth = LESSON_DEPTHS[portal.depthId];
        const depthText = portal.brief.depth ? `depth ${portal.brief.depth}` : depth.label;
        setStatus(`${depth.label} · ${depthText} · ${best.evalLabel} from White’s side. ${best.evalCaption}`);
      }
      render(ctx);
      return;
    }

    if (portal.analyzingFen === ctx.fen) {
      render(ctx);
      return;
    }

    startAnalysis(ctx);
  }

  function setSeat(seat) {
    if (portal.phaseState.phase !== 'setup') {
      return;
    }
    if (seat === 'self') {
      portal.selfCoach = !portal.selfCoach;
      writeFlag(STORAGE_SELF, portal.selfCoach);
    } else if (seat === 'white' || seat === 'black') {
      portal.prefs[seat] = !portal.prefs[seat];
      writeFlag(seat === 'white' ? STORAGE_WHITE : STORAGE_BLACK, portal.prefs[seat]);
    } else {
      return;
    }
    haltSearch();
    portal.brief = null;
    portal.seenFen = null;
    portal.forecast = null;
    portal.decision = null;
    if (portal.preview) {
      exitPreview({ restore: true });
    }
    const ctx = getContext?.();
    if (ctx) {
      sync(ctx);
    } else {
      render({});
    }
  }

  function setDepth(depthId) {
    if (portal.phaseState.phase !== 'setup') {
      return;
    }
    const next = resolveLessonDepth(depthId);
    if (next === portal.depthId) {
      return;
    }
    portal.depthId = next;
    try {
      localStorage.setItem(STORAGE_DEPTH, next);
    } catch {
      // ignore
    }
    portal.brief = null;
    portal.analyzingFen = null;
    if (portal.preview) {
      exitPreview({ restore: true });
    }
    const ctx = getContext?.();
    if (ctx) {
      sync(ctx);
    }
  }

  document.querySelector('#lessons-seats')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-seat]');
    if (!(button instanceof HTMLElement) || !button.dataset.seat) {
      return;
    }
    setSeat(button.dataset.seat);
  });
  depthRow?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-depth]');
    if (!(button instanceof HTMLElement) || !button.dataset.depth) {
      return;
    }
    setDepth(button.dataset.depth);
  });
  options?.addEventListener('click', (event) => {
    const target = event.target.closest('[data-preview], [data-play]');
    if (!(target instanceof HTMLElement) || !portal.brief) {
      return;
    }
    const list = portal.brief.candidates;
    if (target.dataset.preview != null) {
      openPreview(list[Number(target.dataset.preview)]);
      return;
    }
    if (target.dataset.play != null) {
      const candidate = list[Number(target.dataset.play)];
      if (candidate) {
        playSan(candidate.san);
      }
    }
  });
  previewBox?.addEventListener('click', (event) => {
    const target = event.target.closest('[data-act], [data-ply]');
    if (!(target instanceof HTMLElement) || !portal.preview) {
      return;
    }
    if (target.dataset.ply != null) {
      stopWatch();
      portal.preview.cursor = Number(target.dataset.ply);
      paintPreview();
      return;
    }
    const action = target.dataset.act;
    if (action === 'start') {
      stopWatch();
      portal.preview.cursor = 0;
      paintPreview();
    } else if (action === 'prev') {
      step(-1);
    } else if (action === 'next') {
      step(1);
    } else if (action === 'end') {
      stopWatch();
      portal.preview.cursor = portal.preview.sans.length;
      paintPreview();
    } else if (action === 'watch') {
      watchLine();
    } else if (action === 'back') {
      exitPreview({ restore: true });
      render();
    } else if (action === 'play') {
      playSan(portal.preview.playSan);
    }
  });

  const ctx = getContext?.();
  if (ctx?.fen) {
    sync(ctx);
  } else {
    render();
  }

  return {
    sync,
    isEnabled: () => {
      const latest = getContext?.() || {};
      const enrolled = enrollmentFor(latest);
      return Boolean(enrolled.white || enrolled.black);
    },
    isPreviewing: () => Boolean(portal.preview),
    exitPreview: () => {
      if (!portal.preview) {
        return;
      }
      exitPreview({ restore: true });
      render();
    },
    step,
    reapplyPreview: () => {
      if (portal.lastPayload && portal.preview) {
        onPreview?.(portal.lastPayload);
      }
    },
  };
}
