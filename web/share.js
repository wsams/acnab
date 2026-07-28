/** URL-safe base64 helpers for sharing movetext in the page URL. */

const HASH_KEY = 'g';

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
  // Accept both base64url and standard base64, and tolerate spaces from '+' mangling.
  const compact = raw.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (compact.length % 4)) % 4;
  const padded = compact + '='.repeat(padLength);
  return new TextDecoder().decode(base64ToBytes(padded));
}

function readEncodedParam(raw) {
  if (raw == null) {
    return null;
  }
  const value = String(raw).trim();
  if (!value) {
    return '';
  }
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Parse `#g=...` without URLSearchParams (avoids '+' → space mangling). */
export function parseShareHash(hash = window.location.hash) {
  const value = String(hash ?? '').replace(/^#/, '').trim();
  if (!value) {
    return null;
  }

  const match = /(?:^|&)g=([^&]*)/.exec(value);
  if (match) {
    return readEncodedParam(match[1]);
  }

  // Bare encoded payload without a key.
  if (/^[A-Za-z0-9_+/=-]+$/.test(value)) {
    return value;
  }
  return null;
}

/** Also accept `?g=` for clients/redirects that drop fragments. */
export function parseShareSearch(search = window.location.search) {
  const params = new URLSearchParams(String(search ?? ''));
  if (!params.has(HASH_KEY)) {
    return null;
  }
  return readEncodedParam(params.get(HASH_KEY));
}

export function parseShareLocation(location = window.location) {
  const fromHash = parseShareHash(location.hash);
  if (fromHash != null) {
    return fromHash;
  }
  return parseShareSearch(location.search);
}

export function buildShareHash(movesText) {
  const encoded = encodeMovetext(movesText);
  if (!encoded) {
    return '';
  }
  return `#${HASH_KEY}=${encoded}`;
}

function normalizeSharePath(pathname) {
  let path = String(pathname || '/');
  if (path.endsWith('/index.html')) {
    path = `${path.slice(0, -'/index.html'.length)}/`;
  } else if (path.endsWith('index.html')) {
    path = `${path.slice(0, -'index.html'.length)}` || '/';
  }
  if (!path.endsWith('/')) {
    // Prefer directory URLs on GitHub Pages so redirects keep the fragment.
    const leaf = path.split('/').pop() || '';
    if (!leaf.includes('.')) {
      path = `${path}/`;
    }
  }
  return path;
}

export function buildShareUrl(movesText, {
  origin = window.location.origin,
  pathname = window.location.pathname,
  search = '',
} = {}) {
  const path = normalizeSharePath(pathname);
  // Keep unrelated query params out of share links; payload lives in the hash.
  return `${origin}${path}${search}${buildShareHash(movesText)}`;
}

export function writeShareHash(movesText, { replace = true } = {}) {
  const nextHash = buildShareHash(movesText);
  const path = normalizeSharePath(window.location.pathname);
  // Drop a leftover ?g= so hash is the single source of truth after load.
  const url = `${path}${nextHash}`;
  if (replace) {
    window.history.replaceState(null, '', url || path);
  } else {
    window.history.pushState(null, '', url || path);
  }
}
