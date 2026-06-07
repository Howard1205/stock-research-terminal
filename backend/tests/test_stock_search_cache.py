from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.stock_service import StockDataError, StockService


class MemoryCache:
    def __init__(self, fresh=None, stale=None):
        self.fresh = fresh
        self.stale = stale

    def get(self, key: str, ttl: int):
        return self.fresh

    def get_stale(self, key: str):
        return self.stale

    def set(self, key: str, value):
        self.value = value


def make_service(cache: MemoryCache) -> StockService:
    service = StockService.__new__(StockService)
    service.cache = cache
    service._universe = None
    service.stock_universe_updated_at = None
    return service


def test_search_uses_fresh_cache_without_remote_call(monkeypatch) -> None:
    payload = {
        "stocks": [{"symbol": "000988", "name": "华工科技"}],
        "updated_at": "2026-06-07T10:00:00+08:00",
    }
    service = make_service(MemoryCache(fresh=payload))
    monkeypatch.setattr(
        "app.services.stock_service.ak.stock_info_a_code_name",
        lambda: (_ for _ in ()).throw(AssertionError("不应请求远端")),
    )

    assert service.search("华工", 20) == payload["stocks"]


def test_search_uses_stale_cache_without_remote_call(monkeypatch) -> None:
    payload = {
        "stocks": [{"symbol": "000988", "name": "华工科技"}],
        "updated_at": "2026-06-06T10:00:00+08:00",
    }
    service = make_service(MemoryCache(stale=payload))
    monkeypatch.setattr(
        "app.services.stock_service.ak.stock_info_a_code_name",
        lambda: (_ for _ in ()).throw(AssertionError("不应请求远端")),
    )

    assert service.search("000988", 20) == payload["stocks"]


def test_search_returns_friendly_error_without_any_cache(monkeypatch) -> None:
    service = make_service(MemoryCache())
    monkeypatch.setattr(
        service,
        "_call_with_retries",
        lambda operation: (_ for _ in ()).throw(ConnectionResetError(104, "reset")),
    )

    try:
        service.search("000988", 20)
    except StockDataError as error:
        assert error.message == "数据源暂时不可用，请稍后重试"
        assert "reset" not in error.message
    else:
        raise AssertionError("应返回友好错误")


def test_remote_call_retries_twice_with_expected_delays(monkeypatch) -> None:
    calls = 0
    delays: list[float] = []

    def operation():
        nonlocal calls
        calls += 1
        if calls < 3:
            raise ConnectionResetError(104, "reset")
        return "ok"

    monkeypatch.setattr(
        "app.services.stock_service.time.sleep", delays.append
    )

    assert StockService._call_with_retries(operation) == "ok"
    assert calls == 3
    assert delays == [1.0, 2.0]
