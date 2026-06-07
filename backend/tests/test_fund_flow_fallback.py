import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.stock_service import StockService


class MemoryCache:
    def get(self, key: str, ttl: int):
        return None

    def set(self, key: str, value):
        self.value = value


def test_fund_flow_uses_next_provider_after_failure() -> None:
    service = StockService.__new__(StockService)
    service.cache = MemoryCache()
    service._stock_name = lambda symbol: "测试股票"
    service._call_with_timeout = lambda operation, timeout: operation()
    service._get_eastmoney_fund_flow = lambda symbol: (_ for _ in ()).throw(
        RuntimeError("东方财富不可用")
    )
    service._get_ths_individual_fund_flow = lambda symbol: (
        [
            service._fund_flow_item(
                "2026-06-05",
                {
                    "main": 100,
                    "super_large": None,
                    "large": 40,
                    "medium": None,
                    "small": None,
                },
            )
        ],
        "AkShare / 同花顺",
        "stock_fund_flow_individual",
    )
    service._get_ths_big_deal_fund_flow = lambda symbol: (_ for _ in ()).throw(
        AssertionError("不应继续调用第三来源")
    )

    result = service.get_fund_flow("000001")

    assert result["source"]["name"] == "AkShare / 同花顺"
    assert result["items"][0]["main_net"] == 100
