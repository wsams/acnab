#!/usr/bin/env node
import { cpSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const source = join(root, 'web');
const dest = join(root, '_site');

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });

const skip = new Set(['index.php', 'chess.py']);

cpSync(source, dest, {
  recursive: true,
  filter: (src) => {
    const base = src.split('/').pop();
    return !skip.has(base);
  },
});

writeFileSync(join(dest, '.nojekyll'), '');

if (!existsSync(join(dest, 'index.html'))) {
  console.error('Build failed: index.html missing from _site');
  process.exit(1);
}

console.log('Built static site into _site/');
