<?php
ini_set('display_errors', 1);

if (isset($_POST['a'])) {
	$a = $_POST['a'];
	if ($a === 'save') {
        $moves = preg_replace('/[^a-h1-9 \.]/', '', $_POST['moves']);
        file_put_contents('chess.game', $moves);
        $command = escapeshellcmd("./chess.py '{$moves}'");
        $board = shell_exec($command);
		die(json_encode(array('status' => 'ok', 'board' => $board)));
	}
	die(json_encode(array('status' => 'unknown')));
}

//$command = escapeshellcmd("./chess.py '1. a2a4 2. Ph7h5'");
$game = file_exists('chess.game') ? file_get_contents('chess.game') : '';
$command = escapeshellcmd("./chess.py '{$game}'");
$board = shell_exec($command);

$html = <<<eof
<!DOCTYPE HTML>
<html>
<head>
    <title>acnab frontend</title>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <link rel="stylesheet"
        href="https://maxcdn.bootstrapcdn.com/bootstrap/3.3.6/css/bootstrap.min.css"
        integrity="sha384-1q8mTJOASx8j1Au+a5WDVnPi2lkFfwwEAa8hDDdjZlpLegxhjVME1fgjWPGmkzs7"
        crossorigin="anonymous">
    <link rel="stylesheet"
        href="https://maxcdn.bootstrapcdn.com/bootstrap/3.3.6/css/bootstrap-theme.min.css"
        integrity="sha384-fLW2N01lMqjakBkx3l/M9EahuwpSfeNvV63J5ezn3uZzapT0u7EYsXMjQV+0En5r"
        crossorigin="anonymous">
    <link rel="icon" type="image/ico" href="favicon.ico">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <style type="text/css">
        .cell {
            font-family:monospace;
            width:3em;
            height:3em;
            padding:4px;
            margin:0;
            text-align:center;
            vertical-align:middle;
            border:1px solid gray;
            background-color:#ececec;
        }
        #moves {

        }
		body {
            margin-top:6px;
			background-color:white;
		}
        .cell-legend {
            font-family:monospace;
            width:3em;
            height:3em;
            padding:4px;
            margin:0;
            text-align:center;
            vertical-align:middle;
            border:0;
            font-weight:bold;
            color:black;
            background-color:silver;
        }
        .silver-black {
            color:silver;
        }
    </style>
</head>
<body>
    <div class="container">
        <table id="board">{$board}</table>
        <br>
        <textarea class="form-control" id="moves">{$game}</textarea>
        <br>
        <button id="play" class="btn btn-primary">Play</button>
        <br>
        <br>
        <pre>Rules
-----
Example move: 1. Ka1b2

Below is a break down of the single move above. The general format is: 1. move_1 2. move_2 3. move_3 ...

(1.) is the play number. Start from 1 and increment.
(K) is the player - single letter uppercase: King(K), Queen(Q), Bishop(B), Knight(N), Rook(R), Pawn(P) [optional]
(a1) the starting square
(b2) the ending square
For a check, append a plus: Qa2c4+
For a take, place an x between the squares moved: Qa2xc4
You can also combine the two, take and check: Qa2xc4+
Checkmate with a pound sign, you can also combine with a take: Qd2d8#</pre>
    </div>
    <script type="text/javascript"
        src="https://code.jquery.com/jquery-2.2.3.min.js"
        integrity="sha256-a23g1Nt4dtEYOj7bR+vTu7+T8VP13humZFBJNIYoEJo="
        crossorigin="anonymous"></script>
    <script type="text/javascript"
        src="https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.12.0/moment.min.js"
        crossorigin="anonymous"></script>
    <script type="text/javascript"
        src="https://cdnjs.cloudflare.com/ajax/libs/fastclick/1.0.6/fastclick.min.js" crossorigin="anonymous"></script>
    <script type="text/javascript"
        src="https://maxcdn.bootstrapcdn.com/bootstrap/3.3.6/js/bootstrap.min.js"
        integrity="sha384-0mSbJDEHialfmuBBQP6A4Qrprq5OVfW37PRR3j5ELqxss1yVqOtnepnHVP9aJ7xS"
        crossorigin="anonymous"></script>
    <script type="text/javascript">
        FastClick.attach(document.body);
		function debounce(func, wait, immediate) {
			let timeout;
			return function() {
				const context = this, args = arguments;
				const later = function() {
					timeout = null;
					if (!immediate) func.apply(context, args);
				};
				const callNow = immediate && !timeout;
				clearTimeout(timeout);
				timeout = setTimeout(later, wait);
				if (callNow) func.apply(context, args);
			};
		};
        $(function() {
			const moves = $('#moves').val();
            $('#moves').focus();
            $('#play').on('click', function() {
				$.ajax({
					type: 'POST',
					url: 'index.php',
					data: 'a=save&moves=' + encodeURIComponent($('#moves').val()),
					success: function(response) {
                        if (response.board !== null) {
                            $('#board').html(response.board);
                        }
					},
					dataType: 'json'
				});
			});
        });
    </script>
    </body>
</html>
eof;

print($html);

