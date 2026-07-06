from __future__ import annotations

import argparse
import html
import importlib
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def _import_python_chess():
    repo_root = Path(__file__).resolve().parent
    blocked_paths = {
        repo_root,
        repo_root / "web",
    }
    original_path = list(sys.path)

    existing = sys.modules.get("chess")
    if existing is not None:
        existing_file = getattr(existing, "__file__", "")
        if existing_file:
            try:
                if Path(existing_file).resolve().is_relative_to(repo_root):
                    sys.modules.pop("chess", None)
            except AttributeError:
                if str(Path(existing_file).resolve()).startswith(str(repo_root)):
                    sys.modules.pop("chess", None)

    def _path_allowed(entry: str) -> bool:
        candidate = Path(entry or ".").resolve()
        return candidate not in blocked_paths

    try:
        sys.path = [entry for entry in sys.path if _path_allowed(entry)]
        chess_module = importlib.import_module("chess")
    finally:
        sys.path = original_path

    return chess_module


chesslib = _import_python_chess()

FILES = "abcdefgh"
RANKS = "12345678"
RESULT_TOKENS = {"1-0", "0-1", "1/2-1/2", "*"}
MOVE_NUMBER_RE = re.compile(r"^\d+\.(?:\.\.)?")
FULL_MOVE_RE = re.compile(r"^\d+\.(?:\.\.)?$")
LEGACY_MOVE_RE = re.compile(r"^([KQRBNP])?([a-h][1-8])(x?)([a-h][1-8])([+#]?)$")
COMMENT_RE = re.compile(r"\{[^{}]*\}|;[^\n]*")
NAG_RE = re.compile(r"\$\d+")
VARIATION_RE = re.compile(r"\([^()]*\)")
ANSI_RESET = "\033[0m"
ANSI_LIGHT = "\033[48;5;250m"
ANSI_DARK = "\033[48;5;240m"
ANSI_WHITE_PIECE = "\033[38;5;231m"
ANSI_BLACK_PIECE = "\033[38;5;16m"
ANSI_LEGEND = "\033[38;5;244m"

PIECE_NAMES = {
    "p": "pawn",
    "n": "knight",
    "b": "bishop",
    "r": "rook",
    "q": "queen",
    "k": "king",
}


def default_storage_path() -> Path:
    base = Path(os.environ.get("XDG_STATE_HOME", Path.home() / ".local" / "state"))
    return base / "acnab" / "games.json"


def normalize_movetext(moves_text: str) -> str:
    normalized = moves_text.replace("\r\n", "\n").replace("\r", "\n")
    normalized = COMMENT_RE.sub(" ", normalized)
    normalized = NAG_RE.sub(" ", normalized)
    previous = None
    while previous != normalized:
        previous = normalized
        normalized = VARIATION_RE.sub(" ", normalized)
    return normalized.strip()


def tokenize_movetext(moves_text: str) -> list[str]:
    tokens: list[str] = []
    for raw_token in normalize_movetext(moves_text).split():
        token = MOVE_NUMBER_RE.sub("", raw_token)
        if FULL_MOVE_RE.fullmatch(raw_token) or not token or token in RESULT_TOKENS:
            continue
        tokens.append(token)
    return tokens


def _parse_legacy_move(board: Any, token: str):
    match = LEGACY_MOVE_RE.fullmatch(token)
    if not match:
        raise ValueError(f"Unsupported move: {token}")

    piece_letter, from_square, capture_marker, to_square, _suffix = match.groups()
    from_index = chesslib.parse_square(from_square)
    piece = board.piece_at(from_index)
    if piece is None:
        raise ValueError(f"No piece on {from_square} for move {token}")

    if piece_letter and piece.symbol().upper() != piece_letter:
        raise ValueError(f"Piece mismatch for move {token}")

    promotion = ""
    if piece.piece_type == chesslib.PAWN and to_square[1] in {"1", "8"}:
        promotion = "q"

    move = chesslib.Move.from_uci(f"{from_square}{to_square}{promotion}")
    if capture_marker and not board.is_capture(move):
        raise ValueError(f"Move {token} is not a capture")
    if move not in board.legal_moves:
        raise ValueError(f"Illegal move: {token}")
    return move


def apply_moves(moves_text: str):
    board = chesslib.Board()
    applied_san: list[str] = []

    for index, token in enumerate(tokenize_movetext(moves_text), start=1):
        try:
            move = board.parse_san(token)
        except ValueError:
            try:
                move = _parse_legacy_move(board, token)
            except ValueError as exc:
                raise ValueError(f"Move {index} ({token}) failed: {exc}") from exc
        san = board.san(move)
        board.push(move)
        applied_san.append(san)

    return board, applied_san


def _square_payload(board: Any, square_name: str) -> dict[str, Any]:
    square = chesslib.parse_square(square_name)
    piece = board.piece_at(square)
    is_light = (FILES.index(square_name[0]) + int(square_name[1])) % 2 == 1
    payload = {
        "square": square_name,
        "isLight": is_light,
        "piece": None,
    }
    if piece is None:
        return payload

    payload["piece"] = {
        "symbol": piece.symbol(),
        "name": PIECE_NAMES[piece.symbol().lower()],
        "color": "white" if piece.color == chesslib.WHITE else "black",
        "unicode": piece.unicode_symbol(),
    }
    return payload


def board_payload(board: Any) -> list[list[dict[str, Any]]]:
    rows: list[list[dict[str, Any]]] = []
    for rank in range(8, 0, -1):
        row: list[dict[str, Any]] = []
        for file_name in FILES:
            row.append(_square_payload(board, f"{file_name}{rank}"))
        rows.append(row)
    return rows


def game_status(board: Any) -> str:
    if board.is_checkmate():
        winner = "Black" if board.turn == chesslib.WHITE else "White"
        return f"Checkmate. {winner} wins."
    if board.is_stalemate():
        return "Stalemate."
    if board.is_insufficient_material():
        return "Draw by insufficient material."
    if board.can_claim_threefold_repetition():
        return "Threefold repetition can be claimed."
    if board.can_claim_fifty_moves():
        return "Fifty-move draw can be claimed."
    if board.is_check():
        side = "White" if board.turn == chesslib.WHITE else "Black"
        return f"{side} to move and currently in check."
    side = "White" if board.turn == chesslib.WHITE else "Black"
    return f"{side} to move."


def _piece_display(piece: dict[str, Any] | None, unicode_pieces: bool) -> str:
    if not piece:
        return "·" if unicode_pieces else "."
    return piece["unicode"] if unicode_pieces else piece["symbol"]


def render_ascii(board: Any, *, color: bool = True, unicode_pieces: bool = True) -> str:
    lines: list[str] = []
    for offset, rank in enumerate(range(8, 0, -1)):
        row_cells = []
        for file_index, file_name in enumerate(FILES):
            square = _square_payload(board, f"{file_name}{rank}")
            display = _piece_display(square["piece"], unicode_pieces)
            if color:
                background = ANSI_LIGHT if square["isLight"] else ANSI_DARK
                foreground = ANSI_WHITE_PIECE
                if square["piece"] and square["piece"]["color"] == "black":
                    foreground = ANSI_BLACK_PIECE
                row_cells.append(f"{background}{foreground} {display} {ANSI_RESET}")
            else:
                row_cells.append(f" {display} ")
        legend = f"{ANSI_LEGEND}{rank}{ANSI_RESET} " if color else f"{rank} "
        lines.append(f"{legend}{''.join(row_cells)}")

    footer = "  " + " ".join(f" {file_name.upper()} " for file_name in FILES)
    lines.append(footer)
    return "\n".join(lines)


def render_html_fragment(board: Any) -> str:
    rows = []
    for rank in range(8, 0, -1):
        cells = [f"<td class=\"legend\">{rank}</td>"]
        for file_name in FILES:
            square = _square_payload(board, f"{file_name}{rank}")
            classes = ["board-square", "light" if square["isLight"] else "dark"]
            piece = square["piece"]
            if piece:
                classes.append(piece["color"])
                content = html.escape(piece["unicode"])
                label = f"{piece['color']} {piece['name']} on {square['square']}"
            else:
                content = ""
                label = f"empty square {square['square']}"
            cells.append(
                f"<td class=\"{' '.join(classes)}\" data-square=\"{square['square']}\" aria-label=\"{html.escape(label)}\">{content}</td>"
            )
        rows.append(f"<tr>{''.join(cells)}</tr>")

    footer = ["<tr><td class=\"legend\"></td>"]
    footer.extend(f"<td class=\"legend\">{file_name.upper()}</td>" for file_name in FILES)
    footer.append("</tr>")
    rows.append("".join(footer))
    return "".join(rows)


def render_payload(moves_text: str) -> dict[str, Any]:
    board, applied_san = apply_moves(moves_text)
    result = board.result(claim_draw=True) if board.is_game_over(claim_draw=True) else None
    return {
        "input": moves_text,
        "normalizedInput": normalize_movetext(moves_text),
        "appliedMoves": applied_san,
        "moveCount": len(applied_san),
        "fen": board.fen(),
        "turn": "white" if board.turn == chesslib.WHITE else "black",
        "isCheck": board.is_check(),
        "isGameOver": board.is_game_over(claim_draw=True),
        "result": result,
        "status": game_status(board),
        "board": board_payload(board),
        "html": render_html_fragment(board),
        "ascii": render_ascii(board),
    }


def _load_storage(storage_path: Path) -> dict[str, Any]:
    if not storage_path.exists():
        return {"version": 1, "games": {}}
    with storage_path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict) or "games" not in data:
        return {"version": 1, "games": {}}
    return data


def list_games(storage_path: Path | None = None) -> list[dict[str, Any]]:
    storage = _load_storage(storage_path or default_storage_path())
    items = []
    for name, game in sorted(storage["games"].items()):
        items.append(
            {
                "name": name,
                "moves": game["moves"],
                "moveCount": game["moveCount"],
                "fen": game["fen"],
                "updatedAt": game["updatedAt"],
            }
        )
    return items


def save_game(name: str, moves_text: str, storage_path: Path | None = None) -> dict[str, Any]:
    if not name.strip():
        raise ValueError("Saved games need a name")
    target = storage_path or default_storage_path()
    payload = render_payload(moves_text)
    target.parent.mkdir(parents=True, exist_ok=True)
    storage = _load_storage(target)
    timestamp = datetime.now(timezone.utc).isoformat()
    storage["games"][name] = {
        "name": name,
        "moves": moves_text,
        "moveCount": payload["moveCount"],
        "fen": payload["fen"],
        "appliedMoves": payload["appliedMoves"],
        "updatedAt": timestamp,
    }
    with target.open("w", encoding="utf-8") as handle:
        json.dump(storage, handle, indent=2)
        handle.write("\n")
    return storage["games"][name]


def load_game(name: str, storage_path: Path | None = None) -> dict[str, Any]:
    storage = _load_storage(storage_path or default_storage_path())
    try:
        return storage["games"][name]
    except KeyError as exc:
        raise ValueError(f"Unknown saved game: {name}") from exc


def delete_game(name: str, storage_path: Path | None = None) -> None:
    target = storage_path or default_storage_path()
    storage = _load_storage(target)
    if name not in storage["games"]:
        raise ValueError(f"Unknown saved game: {name}")
    del storage["games"][name]
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("w", encoding="utf-8") as handle:
        json.dump(storage, handle, indent=2)
        handle.write("\n")


def bash_completion_script() -> str:
    return """_acnab_completions() {
    local cur prev
    COMPREPLY=()
    cur=\"${COMP_WORDS[COMP_CWORD]}\"
    prev=\"${COMP_WORDS[COMP_CWORD-1]}\"

    case \"${prev}\" in
        --format)
            COMPREPLY=( $(compgen -W 'ascii html json' -- \"${cur}\") )
            return 0
            ;;
        --print-completion)
            COMPREPLY=( $(compgen -W 'bash fish' -- \"${cur}\") )
            return 0
            ;;
    esac

    COMPREPLY=( $(compgen -W '--moves --moves-file --format --plain --ascii --html --json --save --load --delete --list-games --storage --print-completion --no-unicode' -- \"${cur}\") )
    return 0
}
complete -F _acnab_completions chess.py
"""


def fish_completion_script() -> str:
    return """complete -c chess.py -l moves -d 'Moves to render'
complete -c chess.py -l moves-file -d 'Read moves from a file or stdin with -'
complete -c chess.py -l format -xa 'ascii html json' -d 'Output format'
complete -c chess.py -l plain -d 'Disable ANSI colors'
complete -c chess.py -l ascii -d 'Shortcut for --format ascii'
complete -c chess.py -l html -d 'Shortcut for --format html'
complete -c chess.py -l json -d 'Shortcut for --format json'
complete -c chess.py -l save -d 'Save a named game locally'
complete -c chess.py -l load -d 'Load a saved game'
complete -c chess.py -l delete -d 'Delete a saved game'
complete -c chess.py -l list-games -d 'List saved games'
complete -c chess.py -l storage -d 'Override local save path'
complete -c chess.py -l no-unicode -d 'Use ASCII symbols instead of Unicode pieces'
complete -c chess.py -l print-completion -xa 'bash fish' -d 'Print a shell completion script'
"""


def build_parser(default_format: str = "ascii") -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Render chess games from standard algebraic notation or legacy coordinate moves."
    )
    parser.add_argument("legacy_moves", nargs="?", help="Backward-compatible inline move string.")
    parser.add_argument("--moves", help="Inline move string to render.")
    parser.add_argument(
        "--moves-file",
        help="Read moves from a file. Use - to read from stdin.",
    )
    parser.add_argument("--format", choices=["ascii", "html", "json"], default=default_format)
    parser.add_argument("--ascii", action="store_true", help="Shortcut for --format ascii.")
    parser.add_argument("--html", action="store_true", help="Shortcut for --format html.")
    parser.add_argument("--json", action="store_true", help="Shortcut for --format json.")
    parser.add_argument("--plain", action="store_true", help="Disable ANSI colors for terminal output.")
    parser.add_argument(
        "--no-unicode",
        action="store_true",
        help="Use ASCII piece letters instead of Unicode symbols in terminal output.",
    )
    parser.add_argument("--save", metavar="NAME", help="Save the current game under a local name.")
    parser.add_argument("--load", metavar="NAME", help="Render a previously saved local game.")
    parser.add_argument("--delete", metavar="NAME", help="Delete a saved local game and exit.")
    parser.add_argument("--list-games", action="store_true", help="List locally saved games and exit.")
    parser.add_argument(
        "--storage",
        default=str(default_storage_path()),
        help="Local storage path for saved games.",
    )
    parser.add_argument(
        "--print-completion",
        choices=["bash", "fish"],
        help="Print a completion script for the selected shell and exit.",
    )
    return parser


def _moves_from_args(args: argparse.Namespace, storage_path: Path) -> str:
    if args.load:
        return load_game(args.load, storage_path)["moves"]
    if args.moves is not None:
        return args.moves
    if args.moves_file:
        if args.moves_file == "-":
            return sys.stdin.read()
        return Path(args.moves_file).read_text(encoding="utf-8")
    if args.legacy_moves is not None:
        return args.legacy_moves
    return ""


def _print_output(payload: dict[str, Any], output_format: str, *, plain: bool, no_unicode: bool) -> None:
    if output_format == "json":
        print(json.dumps(payload, indent=2))
        return
    if output_format == "html":
        print(payload["html"])
        return

    print(
        render_ascii(
            apply_moves(payload["input"])[0],
            color=not plain,
            unicode_pieces=not no_unicode,
        )
    )
    print(payload["status"])
    if payload["appliedMoves"]:
        print("Moves:", " ".join(payload["appliedMoves"]))


def main(default_format: str = "ascii") -> int:
    parser = build_parser(default_format=default_format)
    args = parser.parse_args()
    storage_path = Path(args.storage).expanduser()

    if args.print_completion:
        print(bash_completion_script() if args.print_completion == "bash" else fish_completion_script())
        return 0

    if args.ascii:
        args.format = "ascii"
    elif args.html:
        args.format = "html"
    elif args.json:
        args.format = "json"

    try:
        if args.list_games:
            print(json.dumps(list_games(storage_path), indent=2))
            return 0

        if args.delete:
            delete_game(args.delete, storage_path)
            print(f"Deleted saved game: {args.delete}")
            return 0

        moves_text = _moves_from_args(args, storage_path)
        payload = render_payload(moves_text)

        if args.save:
            saved = save_game(args.save, moves_text, storage_path)
            payload["savedGame"] = saved

        _print_output(payload, args.format, plain=args.plain, no_unicode=args.no_unicode)
        return 0
    except Exception as exc:  # pylint: disable=broad-except
        print(str(exc), file=sys.stderr)
        return 1
