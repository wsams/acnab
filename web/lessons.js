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

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character]));
}

function readEnabled() {
  try {
    return localStorage.getItem(STORAGE_ENABLED) === '1';
  } catch {
    return false;
  }
}

function readDepth() {
  try {
    return resolveLessonDepth(localStorage.getItem(STORAGE_DEPTH));
  } catch {
    return DEFAULT_LESSON_DEPTH;
  }
}

function studentToMove(ctx) {
  if (!ctx?.cpu?.enabled || !ctx.cpu.humanSide) {
    return true;
  }
  return ctx.turn === ctx.cpu.humanSide;
}

function actorName(move, ctx) {
  const color = move?.color;
  if (ctx?.cpu?.enabled && ctx.cpu.cpuSide && color === ctx.cpu.cpuSide) {
    return 'The CPU';
  }
  if (!ctx?.cpu?.enabled || (ctx.cpu.humanSide && color === ctx.cpu.humanSide)) {
    return 'You';
  }
  return color === 'white' ? 'White' : 'Black';
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

export function mountLessonPortal({ onPreview, onClearPreview, onPlayMove, getContext }) {
  const panel = document.querySelector('#lessons-panel');
  const toggle = document.querySelector('#lessons-toggle');
  const intro = document.querySelector('#lessons-intro');
  const body = document.querySelector('#lessons-body');
  const depthRow = document.querySelector('#lessons-depth');
  const depthHint = document.querySelector('#lessons-depth-hint');
  const status = document.querySelector('#lessons-status');
  const decision = document.querySelector('#lessons-decision');
  const previewBox = document.querySelector('#lessons-preview');
  const options = document.querySelector('#lessons-options');
  const engine = new CoachEngine();

  const portal = {
    enabled: readEnabled(),
    depthId: readDepth(),
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
    if (!ctx || !studentToMove(ctx)) {
      setStatus('The CPU is to move. The coach can show the idea, and you play on your own turn.');
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

  function renderDepth() {
    const current = LESSON_DEPTHS[portal.depthId];
    depthRow?.querySelectorAll('[data-depth]').forEach((button) => {
      const on = button.dataset.depth === portal.depthId;
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    if (depthHint) {
      depthHint.textContent = current?.description ?? '';
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
    const allowPlay = studentToMove(ctx);
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
          : '<p class="lessons-wait">The CPU is to move. Watch the idea, then answer on your turn.</p>'}
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
    const yours = studentToMove(ctx);
    const heading = yours
      ? 'Tries for you'
      : 'What the coach would play for the CPU';
    const note = yours
      ? 'Preview any try. The board shows the line and the notation stays put until you press Play or make your own move.'
      : 'The CPU may choose something else. Preview a line to see why the coach likes it. These moves are not yours to play.';
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

  function render() {
    const ctx = getContext?.() || {};
    panel?.setAttribute('data-enabled', portal.enabled ? 'true' : 'false');
    panel?.classList.toggle('is-thinking', Boolean(portal.analyzingFen));
    panel?.classList.toggle('is-preview', Boolean(portal.preview));
    if (toggle) {
      toggle.setAttribute('aria-pressed', portal.enabled ? 'true' : 'false');
      toggle.textContent = portal.enabled ? 'Lessons on' : 'Lessons off';
    }
    if (intro) {
      intro.hidden = portal.enabled;
    }
    if (body) {
      body.hidden = !portal.enabled;
    }
    if (!portal.enabled) {
      return;
    }
    renderDepth();
    if (decision) {
      decision.hidden = !portal.decision;
      decision.innerHTML = portal.decision
        ? `<p class="lessons-kicker">What just happened</p><h3>${escapeHtml(portal.decision.title)}</h3><p>${escapeHtml(portal.decision.body)}</p>`
        : '';
    }
    renderPreviewBox(ctx);
    renderOptions(ctx);
  }

  async function startAnalysis(ctx) {
    const token = portal.token + 1;
    portal.token = token;
    const depth = LESSON_DEPTHS[portal.depthId];
    portal.analyzingFen = ctx.fen;
    const yours = studentToMove(ctx);
    setStatus(yours
      ? 'Coach is reading your position…'
      : 'Coach is reading the position while the CPU thinks…');
    render();
    try {
      const entries = await engine.analyze(ctx.fen, depth);
      if (token !== portal.token) {
        return;
      }
      const latest = getContext?.();
      if (!latest || latest.fen !== ctx.fen || !portal.enabled) {
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

  function sync(ctx) {
    if (!portal.enabled || !ctx?.fen) {
      return;
    }
    if (ctx.cpu?.tossing) {
      engine.stop();
      portal.analyzingFen = null;
      portal.token += 1;
      setStatus('Tossing for colors. The lesson starts as soon as the sides are set.');
      render();
      return;
    }
    if (!ctx.live) {
      engine.stop();
      portal.analyzingFen = null;
      portal.token += 1;
      if (portal.preview) {
        exitPreview({ restore: false });
      }
      setStatus('Lessons follow the live board. Go to the last move to keep the lesson going.');
      render();
      return;
    }
    if (ctx.isGameOver) {
      engine.stop();
      portal.analyzingFen = null;
      portal.token += 1;
      if (portal.preview && portal.preview.anchorFen !== ctx.fen) {
        exitPreview({ restore: false });
      }
      setStatus(gameOverCopy(ctx));
      render();
      return;
    }

    if (portal.preview && portal.preview.anchorFen !== ctx.fen) {
      exitPreview({ restore: false });
    }

    if (ctx.fen !== portal.seenFen) {
      const previousFen = portal.seenFen;
      portal.decision = previousFen && ctx.sans?.length
        ? explainTransition(previousFen, ctx)
        : null;
      portal.seenFen = ctx.fen;
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
      render();
      return;
    }

    if (portal.analyzingFen === ctx.fen) {
      render();
      return;
    }

    startAnalysis(ctx);
  }

  function setEnabled(enabled) {
    portal.enabled = Boolean(enabled);
    try {
      localStorage.setItem(STORAGE_ENABLED, portal.enabled ? '1' : '0');
    } catch {
      // Ignore storage failures. The lesson still runs for this visit.
    }
    if (!portal.enabled) {
      portal.token += 1;
      engine.stop();
      portal.analyzingFen = null;
      portal.seenFen = null;
      portal.forecast = null;
      exitPreview({ restore: true });
      portal.decision = null;
      setStatus('');
      render();
      return;
    }
    render();
    const ctx = getContext?.();
    if (ctx) {
      sync(ctx);
    }
  }

  function setDepth(depthId) {
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
    if (portal.preview) {
      exitPreview({ restore: true });
    }
    renderDepth();
    const ctx = getContext?.();
    if (portal.enabled && ctx) {
      portal.analyzingFen = null;
      sync(ctx);
    }
  }

  toggle?.addEventListener('click', () => setEnabled(!portal.enabled));
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

  render();
  if (portal.enabled) {
    const ctx = getContext?.();
    if (ctx?.fen) {
      sync(ctx);
    }
  }

  return {
    sync,
    isEnabled: () => portal.enabled,
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
