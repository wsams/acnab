<?php
ini_set('display_errors', '1');

function read_moves_payload(): string {
    $moves = $_POST['moves'] ?? '';
    if ($moves === '') {
        $raw = file_get_contents('php://input');
        if ($raw !== false && $raw !== '') {
            $decoded = json_decode($raw, true);
            if (is_array($decoded) && isset($decoded['moves']) && is_string($decoded['moves'])) {
                $moves = $decoded['moves'];
            }
        }
    }

    return trim(str_replace("\0", '', $moves));
}

function render_game(string $moves): array {
    $command = 'python3 ' . escapeshellarg(__DIR__ . '/../chess.py') . ' --format json --moves-file -';
    $descriptors = [
        0 => ['pipe', 'w'],
        1 => ['pipe', 'r'],
        2 => ['pipe', 'r'],
    ];

    $process = proc_open($command, $descriptors, $pipes, __DIR__);
    if (!is_resource($process)) {
        throw new RuntimeException('Unable to start the chess renderer.');
    }

    fwrite($pipes[0], $moves);
    fclose($pipes[0]);

    $stdout = stream_get_contents($pipes[1]);
    fclose($pipes[1]);

    $stderr = stream_get_contents($pipes[2]);
    fclose($pipes[2]);

    $exitCode = proc_close($process);
    if ($exitCode !== 0) {
        throw new RuntimeException(trim($stderr) ?: 'The chess renderer returned an error.');
    }

    $decoded = json_decode($stdout, true);
    if (!is_array($decoded)) {
        throw new RuntimeException('The chess renderer returned invalid JSON.');
    }

    return $decoded;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    header('Content-Type: application/json; charset=utf-8');
    try {
        if (($_POST['a'] ?? '') !== 'render') {
            throw new RuntimeException('Unknown action requested.');
        }

        $game = render_game(read_moves_payload());
        echo json_encode(['status' => 'ok', 'game' => $game], JSON_UNESCAPED_UNICODE);
    } catch (Throwable $exception) {
        http_response_code(422);
        echo json_encode([
            'status' => 'error',
            'message' => $exception->getMessage(),
        ], JSON_UNESCAPED_UNICODE);
    }
    exit;
}

$initialGame = render_game('');
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>acnab</title>
    <link rel="stylesheet" href="app.css" />
</head>
<body>
    <main class="app-shell">
        <section class="panel panel-board">
            <div class="panel-heading">
                <div>
                    <p class="eyebrow">acnab</p>
                    <h1>Interactive chess notation board</h1>
                </div>
                <div class="toolbar">
                    <label class="field compact-field">
                        <span>Theme</span>
                        <select id="theme-select">
                            <option value="classic">Classic</option>
                            <option value="midnight">Midnight</option>
                            <option value="forest">Forest</option>
                        </select>
                    </label>
                    <button id="new-game" type="button" class="button ghost">New board</button>
                </div>
            </div>
            <div id="status" class="status-card"></div>
            <div class="board-summary">
                <div>
                    <span class="summary-label">FEN</span>
                    <code id="fen"></code>
                </div>
                <div>
                    <span class="summary-label">Moves</span>
                    <span id="move-count">0</span>
                </div>
            </div>
            <div id="board" class="board" aria-live="polite"></div>
            <ol id="moves-list" class="moves-list"></ol>
        </section>

        <section class="panel panel-controls">
            <div class="panel-heading">
                <div>
                    <p class="eyebrow">Notation</p>
                    <h2>Work with standard chess notation</h2>
                </div>
            </div>
            <form id="render-form" class="controls-stack">
                <label class="field">
                    <span>Moves</span>
                    <textarea id="moves" name="moves" rows="10" spellcheck="false" placeholder="1. e4 e5 2. Nf3 Nc6 3. Bb5 a6"></textarea>
                </label>
                <div class="actions">
                    <button type="submit" class="button primary">Render board</button>
                    <button type="button" id="copy-pgn" class="button ghost">Copy notation</button>
                </div>
                <div id="feedback" class="feedback" role="status" aria-live="polite"></div>
            </form>

            <div class="storage-panel">
                <div class="storage-header">
                    <h3>Local browser saves</h3>
                    <p>Your saved games stay in this browser via localStorage.</p>
                </div>
                <div class="storage-controls">
                    <label class="field">
                        <span>Save name</span>
                        <input id="save-name" type="text" placeholder="Ruy Lopez demo" />
                    </label>
                    <button id="save-game" type="button" class="button primary">Save locally</button>
                </div>
                <div id="saved-games" class="saved-games"></div>
            </div>

            <details class="help-card">
                <summary>Supported notation and tips</summary>
                <ul>
                    <li>Standard SAN/PGN is supported: <code>e4</code>, <code>Nf3</code>, <code>O-O</code>, <code>Qxd5+</code>, <code>c8=Q#</code>.</li>
                    <li>Legacy coordinate moves still work for compatibility: <code>Pf2f4</code>, <code>Nb8c6</code>.</li>
                    <li>The board updates as you type, and the current draft is restored automatically.</li>
                    <li>Use the CLI for shell completions: <code>python3 chess.py --print-completion bash</code> or <code>fish</code>.</li>
                </ul>
            </details>
        </section>
    </main>

    <script>
        window.__ACNAB__ = <?php echo json_encode($initialGame, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); ?>;
    </script>
    <script type="module" src="app.js"></script>
</body>
</html>
