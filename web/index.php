<?php
/**
 * Local PHP entrypoint.
 * The interactive board is fully client-side (same as GitHub Pages).
 * Optional POST ?a=render still proxies to the Python CLI for parity checks.
 */
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
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
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

readfile(__DIR__ . '/index.html');
