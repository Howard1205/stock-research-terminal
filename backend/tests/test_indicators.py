import pandas as pd


def test_bbi_formula() -> None:
    close = pd.Series(range(1, 31), dtype=float)
    bbi = (
        close.rolling(3).mean()
        + close.rolling(6).mean()
        + close.rolling(12).mean()
        + close.rolling(24).mean()
    ) / 4

    expected = ((29 + 30 + 28) / 3 + sum(range(25, 31)) / 6 + sum(range(19, 31)) / 12 + sum(range(7, 31)) / 24) / 4
    assert bbi.iloc[-1] == expected

