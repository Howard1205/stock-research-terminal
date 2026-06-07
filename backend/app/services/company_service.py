from __future__ import annotations

from pathlib import Path
from typing import Any

import akshare as ak
import pandas as pd

from app.services.cache import JsonCache
from app.services.research_service import research_service
from app.services.stock_service import StockDataError, clean_number, iso_now


class CompanyService:
    PROFILE_TTL = 7 * 24 * 60 * 60
    REPORTS_TTL = 6 * 60 * 60
    INTRADAY_TTL = 30 * 60

    def __init__(self) -> None:
        cache_directory = Path(__file__).resolve().parents[2] / "cache"
        self.cache = JsonCache(cache_directory)

    @staticmethod
    def _clean_text(value: Any) -> str | None:
        if value is None or pd.isna(value):
            return None
        text = str(value).replace("\x7f", "").strip()
        return text or None

    def get_profile(self, symbol: str) -> dict[str, Any]:
        cache_key = f"company_profile_v2_{symbol}"
        cached = self.cache.get(cache_key, self.PROFILE_TTL)
        if cached:
            return cached

        try:
            frame = ak.stock_profile_cninfo(symbol)
            if frame.empty:
                raise ValueError("公司概况接口返回空数据")
            row = frame.iloc[0]
        except Exception as exc:
            raise StockDataError(
                "COMPANY_PROFILE_UNAVAILABLE",
                f"获取 {symbol} 公司资料失败：{exc}",
                "AkShare stock_profile_cninfo / 巨潮资讯",
            ) from exc

        updated_at = iso_now()
        result = {
            "symbol": symbol,
            "company_name": self._clean_text(row.get("公司名称")),
            "exchange": self._clean_text(row.get("所属市场")),
            "industry": self._clean_text(row.get("所属行业")),
            "listed_date": self._clean_text(row.get("上市日期")),
            "main_business": self._clean_text(row.get("主营业务")),
            "business_scope": self._clean_text(row.get("经营范围")),
            "main_products": (
                self._clean_text(row.get("主要产品"))
                or self._clean_text(row.get("主营产品"))
            ),
            "upstream_downstream": None,
            "upstream_industries": None,
            "midstream_segment": self._clean_text(row.get("主营业务")),
            "downstream_customers_applications": None,
            "website": self._clean_text(row.get("官方网站")),
            "updated_at": updated_at,
            "source": {
                "name": "AkShare / 巨潮资讯",
                "dataset": "stock_profile_cninfo",
                "updated_at": updated_at,
            },
        }
        self.cache.set(cache_key, result)
        return result

    def get_reports(self, symbol: str) -> dict[str, Any]:
        return research_service.get_reports(symbol)

    def get_intraday(
        self,
        symbol: str,
        trading_date: str,
        daily_bar: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        cache_key = f"intraday_v3_{symbol}_{trading_date}"
        cached = self.cache.get(cache_key, self.INTRADAY_TTL)
        if cached:
            return cached

        try:
            prefix = "sh" if symbol.startswith("6") else "sz"
            frame = ak.stock_zh_a_minute(
                symbol=f"{prefix}{symbol}",
                period="1",
                adjust="",
            )
            if frame.empty:
                raise ValueError("分钟接口返回空数据")
            frame = frame.copy()
            frame["day"] = pd.to_datetime(frame["day"])
            selected = frame.loc[
                frame["day"].dt.strftime("%Y-%m-%d") == trading_date
            ]
        except Exception as exc:
            raise StockDataError(
                "INTRADAY_UNAVAILABLE",
                f"获取 {symbol} 分时数据失败：{exc}",
                "AkShare stock_zh_a_minute / 新浪财经",
            ) from exc

        updated_at = iso_now()
        if selected.empty:
            result = {
                "symbol": symbol,
                "date": trading_date,
                "available": False,
                "message": "当前数据源暂不支持该日历史分时数据",
                "daily": daily_bar,
                "points": [],
                "updated_at": updated_at,
                "source": {
                    "name": "AkShare / 新浪财经",
                    "dataset": "stock_zh_a_minute",
                    "updated_at": updated_at,
                },
            }
        else:
            points = []
            cumulative_volume = 0.0
            cumulative_amount = 0.0
            has_amount = "amount" in selected.columns or "成交额" in selected.columns
            for _, row in selected.iterrows():
                price = clean_number(row["close"])
                volume = clean_number(row["volume"])
                amount_value = row.get("amount", row.get("成交额"))
                amount = clean_number(amount_value)
                numeric_price = float(price or 0)
                numeric_volume = float(volume or 0)
                cumulative_volume += numeric_volume
                if amount is not None:
                    cumulative_amount += float(amount)
                else:
                    cumulative_amount += numeric_price * numeric_volume
                average_price = (
                    cumulative_amount / cumulative_volume
                    if cumulative_volume > 0
                    else numeric_price
                )
                points.append(
                    {
                        "time": row["day"].strftime("%Y-%m-%d %H:%M:%S"),
                        "price": price,
                        "volume": volume,
                        "amount": amount,
                        "average_price": clean_number(average_price),
                    }
                )
            result = {
                "symbol": symbol,
                "date": trading_date,
                "available": True,
                "message": None,
                "daily": daily_bar,
                "points": points,
                "average_estimated": not has_amount,
                "updated_at": updated_at,
                "source": {
                    "name": "AkShare / 新浪财经",
                    "dataset": "stock_zh_a_minute",
                    "updated_at": updated_at,
                },
            }
        self.cache.set(cache_key, result)
        return result


company_service = CompanyService()
