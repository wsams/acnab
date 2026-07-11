#!/usr/bin/env node
import { cpSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const source = join(root, 'web');
const dest = join(root, '_site');
const destWeb = join(dest, 'web');

rmSync(dest, { recursive: true, force: true });
mkdirSync(destWeb, { recursive: true });

const skip = new Set(['index.php', 'chess.py']);

cpSync(source, destWeb, {
  recursive: true,
  filter: (src) => {
    const base = src.split('/').pop();
    return !skip.has(base);
  },
});

writeFileSync(join(dest, '.nojekyll'), '');
writeFileSync(
  join(dest, 'index.html'),
  `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="refresh" content="0; url=web/" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>acnab</title>
  <link rel="canonical" href="web/" />
</head>
<body>
  <p><a href="web/">Open acnab</a></p>
</body>
</html>
`,
);

if (!existsSync(join(destWeb, 'index.html'))) {
  console.error('Build failed: index.html missing from _site/web');
  process.exit(1);
}

console.log('Built static site into _site/ (app at web/)');
