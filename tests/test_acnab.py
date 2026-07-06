import json
import tempfile
import unittest
from pathlib import Path

from acnab_core import apply_moves, chesslib, list_games, load_game, render_payload, save_game


class AcnabCoreTests(unittest.TestCase):
    def test_standard_san_moves_render(self):
        payload = render_payload('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6')
        self.assertEqual(payload['moveCount'], 6)
        self.assertEqual(payload['board'][4][4]['piece']['symbol'], 'P')
        self.assertEqual(payload['appliedMoves'][-1], 'a6')

    def test_legacy_moves_still_work(self):
        board, applied = apply_moves('1. Pf2f4 2. Nb8c6')
        self.assertEqual(board.piece_at(chesslib.parse_square('f4')).symbol(), 'P')
        self.assertEqual(applied, ['f4', 'Nc6'])

    def test_local_save_round_trip(self):
        with tempfile.TemporaryDirectory() as tempdir:
            storage = Path(tempdir) / 'games.json'
            saved = save_game('demo', '1. d4 d5 2. c4', storage)
            self.assertEqual(saved['moveCount'], 3)
            loaded = load_game('demo', storage)
            self.assertEqual(loaded['moves'], '1. d4 d5 2. c4')
            listing = list_games(storage)
            self.assertEqual(listing[0]['name'], 'demo')
            self.assertEqual(json.loads(storage.read_text(encoding='utf-8'))['games']['demo']['fen'], loaded['fen'])


if __name__ == '__main__':
    unittest.main()
