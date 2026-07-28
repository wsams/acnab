/** URL-safe base64 helpers for sharing movetext in the page hash. */

const HASH_PREFIX = 'g=';

function bytesToBase64(bytes) {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function encodeMovetext(movesText) {
  const text = String(movesText ?? '');
  const bytes = new TextEncoder().encode(text);
  return bytesToBase64(bytes)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function decodeMovetext(encoded) {
  const raw = String(encoded ?? '').trim();
  if (!raw) {
    return '';
  }
  const normalized = raw.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(padLength);
  return new TextDecoder().decode(base64ToBytes(padded));
}

export function parseShareHash(hash = window.location.hash) {
  const value = String(hash ?? '').replace(/^#/, '');
  if (!value) {
    return null;
  }

  const params = new URLSearchParams(value.includes('=') ? value : `${HASH_PREFIX}${value}`);
  if (params.has('g')) {
    return params.get('g') ?? '';
  }

  // Legacy / bare encoded payload without a key.
  if (/^[A-Za-z0-9_-]+$/.test(value)) {
    return value;
  }
  return null;
}

export function buildShareHash(movesText) {
  const encoded = encodeMovetext(movesText);
  if (!encoded) {
    return '';
  }
  return `#${HASH_PREFIX}${encoded}`;
}

export function buildShareUrl(movesText, { origin = window.location.origin, pathname = window.location.pathname, search = window.location.search } = {}) {
  return `${origin}${pathname}${search}${buildShareHash(movesText)}`;
}

export function writeShareHash(movesText, { replace = true } = {}) {
  const nextHash = buildShareHash(movesText);
  const url = `${window.location.pathname}${window.location.search}${nextHash}`;
  if (replace) {
    window.history.replaceState(null, '', url);
  } else {
    window.history.pushState(null, '', url);
  }
}
