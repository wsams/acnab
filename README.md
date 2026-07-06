# acnab

acnab renders chess positions from standard chess notation in the terminal and in the browser.
It now understands SAN/PGN-style moves, keeps legacy coordinate moves for compatibility,
and ships with a modernized web UI plus local save workflows.

## CLI usage

Render a game directly:

```bash
python3 chess.py --moves '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6'
```

Use stdin when quoting is inconvenient in bash or fish:

```bash
printf '1. d4 d5 2. c4' | python3 chess.py --moves-file -
```

Print shell completion helpers:

```bash
python3 chess.py --print-completion bash
python3 chess.py --print-completion fish
```

Save and reload games locally:

```bash
python3 chess.py --moves '1. e4 e5 2. Nf3 Nc6' --save demo
python3 chess.py --load demo
python3 chess.py --list-games
```

### Supported notation

- Standard SAN/PGN style moves such as `e4`, `Nf3`, `Qxd5+`, `O-O`, and `c8=Q#`
- Legacy coordinate-style moves such as `Pf2f4` and `Nb8c6`

## Web usage

Serve the `web` directory with PHP and open `web/index.php`.

The web app now includes:

- live board updates while typing
- a lighter modern UI with no CDN dependencies
- browser localStorage saves for drafts and named games
- theme switching and FEN/status summaries

## Development notes

Install Python dependencies and run the lightweight checks:

```bash
python3 -m pip install -r requirements.txt
python3 -m unittest discover -s tests
python3 -m py_compile chess.py web/chess.py acnab_core.py
php -l web/index.php
```
