import pandas as pd

from app.services.market_news_service import MarketNewsService


class MemoryCache:
    def get(self, key: str, ttl: int):
        return None

    def set(self, key: str, value):
        self.value = value


def test_market_news_returns_empty_payload_when_all_sources_fail(monkeypatch) -> None:
    service = MarketNewsService()
    service.cache = MemoryCache()
    monkeypatch.setattr(
        service,
        "_with_timeout",
        lambda operation, timeout: (_ for _ in ()).throw(RuntimeError("不可用")),
    )

    result = service.get_news()

    assert result["items"] == []
    assert result["hot_sectors"] == []
    assert result["daily_summary"]["top_items"] == []
    assert result["warnings"]


def test_market_news_item_contains_importance() -> None:
    service = MarketNewsService()
    frame = pd.DataFrame(
        [
            {
                "标题": "央行发布重要政策",
                "内容": "政策支持科技产业发展",
                "发布时间": "2026-06-07 10:00:00",
                "链接": "https://example.com/news",
            }
        ]
    )

    items = service._normalize_frame(
        frame, "东方财富", "https://kuaixun.eastmoney.com/"
    )

    assert items[0]["importance"] == "高"
    assert items[0]["url"] == "https://example.com/news"
