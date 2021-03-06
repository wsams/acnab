""" e.g. 1. Ka1b2 - The rules for game play.
    (1.) is the play number. Start from 1 and increment.
    (K) is the player - single letter uppercase: King(K), Queen(Q), Bishop(B), Knight(N), Rook(R), Pawn(P) [optional]
    (a1) the starting square
    (b2) the ending square
    For a check, append a plus: Qa2c4+
    For a take, place an x between the squares moved: Qa2xc4
    You can also combine the two, take and check: Qa2xc4+
    Checkmate with a pound sign, you can also combine with a take: Qd2d8#
"""

import re, sys
from curses.ascii import islower, isupper, isalpha, isblank

r8 = [ 'R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R' ]
r7 = [ 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P' ]
r6 = [ '', '', '', '', '', '', '', '' ]
r5 = [ '', '', '', '', '', '', '', '' ]
r4 = [ '', '', '', '', '', '', '', '' ]
r3 = [ '', '', '', '', '', '', '', '' ]
r2 = [ 'p', 'p', 'p', 'p', 'p', 'p', 'p', 'p' ]
r1 = [ 'r', 'n', 'b', 'q', 'k', 'b', 'n', 'r' ]
board = []
board.append(r1)
board.append(r2)
board.append(r3)
board.append(r4)
board.append(r5)
board.append(r6)
board.append(r7)
board.append(r8)

red = '\033[0;31m'
black = '\033[0;30m'
black_back = '\033[40m'
white = '\033[0;37m'
white_back = '\033[47m'
reset_color = '\033[00m'

def colval(letter: str):
    """chess columns are 1-indexed, subtract one to operate on 'board'"""
    return { "a": 0, "b": 1, "c": 2, "d": 3, "e": 4, "f": 5, "g": 6, "h": 7 }[letter]

def rowval(num: str):
    """chess rows are 1-indexed, subtract one to operate on 'board'"""
    return int(num) - 1

def render(board: list, moves: list):
    """ mutate the board, then render it """
    for p in moves:
        theplay = p[1]
        l = len(theplay)

        comp = re.compile('([KQBNRP])?([a-h][1-8])(x?)([a-h][1-8])([\+#]?)')
        mat = comp.match(theplay)
        grps = mat.groups(0);

        frm = grps[1]
        frm_col = colval(frm[0])
        frm_row = rowval(frm[1])

        to = grps[3]
        to_col = colval(to[0])
        to_row = rowval(to[1])

        frm_piece = board[frm_row][frm_col]
        to_piece = board[to_row][to_col]

        board[to_row][to_col] = board[frm_row][frm_col]
        board[frm_row][frm_col] = ''

    for row in board[::-1]:
        for cell in row:
            if len(cell) > 0:
                if islower(cell):
                    print(f" {white}{black_back}{cell}{reset_color}", end='')
                elif isupper(cell):
                    print(f" {red}{black_back}{cell}{reset_color}", end='')
            else:
                print(f" {black_back}-{reset_color}", end='')
        print('')

def parse_play(play: str):
    comp = re.compile('([1-9]+)\.\s+([KQBNRP]?[^ ]+)\s*')
    return comp.findall(play)

"""play = '1. Pf2f4 2. Nb8c6'"""
moves = parse_play(sys.argv[1])
render(board, moves)
