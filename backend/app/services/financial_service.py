from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any

import akshare as ak
import pandas as pd

from app.services.cache import JsonCache
from app.services.stock_service import StockDataError, clean_number, iso_now


FLOW_METRICS = {
    "revenue": "营业总收入",
    "revenue_cost": "营业成本",
    "parent_net_profit": "归母净利润",
    "net_profit": "净利润",
    "deducted_net_profit": "扣非净利润",
    "operating_cash_flow": "经营现金流量净额",
    "eps": "基本每股收益",
}
POINT_METRICS = {
    "gross_margin": "毛利率",
    "net_margin": "销售净利率",
    "debt_ratio": "资产负债率",
}


class FinancialService:
    CACHE_TTL = 12 * 60 * 60

    def __init__(self) -> None:
        cache_directory = Path(__file__).resolve().parents[2] / "cache"
        self.cache = JsonCache(cache_directory)

    @staticmethod
    def _value_map(frame: pd.DataFrame) -> dict[str, dict[str, float | None]]:
        result: dict[str, dict[str, float | None]] = {}
        for metric_name in set(FLOW_METRICS.values()) | set(POINT_METRICS.values()):
            rows = frame.loc[frame["指标"] == metric_name]
            if rows.empty:
                result[metric_name] = {}
                continue
            row = rows.iloc[0]
            result[metric_name] = {
                str(column): clean_number(row[column])
                for column in frame.columns[2:]
            }
        return result

    @staticmethod
    def _growth(current: float | None, previous: float | None) -> float | None:
        if current is None or previous in (None, 0):
            return None
        return clean_number((current - previous) / abs(previous) * 100)

    @staticmethod
    def _subtract(
        current: float | None,
        previous: float | None,
    ) -> float | None:
        if current is None:
            return None
        if previous is None:
            return current
        return clean_number(current - previous)

    @staticmethod
    def _prior_quarter_key(period: str) -> str | None:
        year = int(period[:4])
        month_day = period[4:]
        prior_map = {
            "0331": None,
            "0630": f"{year}0331",
            "0930": f"{year}0630",
            "1231": f"{year}0930",
        }
        return prior_map.get(month_day)

    @staticmethod
    def _label(period: str, mode: str, latest_period: str) -> str:
        year = period[:4]
        month_day = period[4:]
        if mode == "annual":
            return f"{year}年报" if month_day == "1231" else f"{year}最新报告期"
        quarter_names = {
            "0331": "Q1",
            "0630": "Q2",
            "0930": "Q3",
            "1231": "Q4",
        }
        suffix = quarter_names.get(month_day, period[4:])
        return f"{year}{suffix}" + ("（最新）" if period == latest_period else "")

    def _select_periods(self, all_periods: list[str], mode: str) -> list[str]:
        sorted_periods = sorted(all_periods, reverse=True)
        if mode == "quarterly":
            return sorted(sorted_periods[:8])

        year_ends = [period for period in sorted_periods if period.endswith("1231")]
        latest = sorted_periods[0]
        selected = year_ends[:5]
        if not latest.endswith("1231"):
            selected = [latest, *year_ends[:4]]
        return sorted(set(selected))

    def _flow_value(
        self,
        values: dict[str, dict[str, float | None]],
        metric_name: str,
        period: str,
        mode: str,
    ) -> float | None:
        current = values.get(metric_name, {}).get(period)
        if mode != "quarterly":
            return current
        prior_key = self._prior_quarter_key(period)
        prior = values.get(metric_name, {}).get(prior_key) if prior_key else None
        return self._subtract(current, prior)

    def _build_period(
        self,
        values: dict[str, dict[str, float | None]],
        period: str,
        mode: str,
        latest_period: str,
    ) -> dict[str, Any]:
        flow = {
            key: self._flow_value(values, source_name, period, mode)
            for key, source_name in FLOW_METRICS.items()
        }
        revenue = flow["revenue"]
        revenue_cost = flow["revenue_cost"]
        net_profit = flow["net_profit"]

        if mode == "quarterly":
            cumulative_revenue = values.get("营业总收入", {}).get(period)
            cumulative_gross_margin = values.get("毛利率", {}).get(period)
            prior_key = self._prior_quarter_key(period)
            prior_revenue = (
                values.get("营业总收入", {}).get(prior_key) if prior_key else None
            )
            prior_gross_margin = (
                values.get("毛利率", {}).get(prior_key) if prior_key else None
            )
            cumulative_gross_profit = (
                cumulative_revenue * cumulative_gross_margin / 100
                if cumulative_revenue is not None
                and cumulative_gross_margin is not None
                else None
            )
            prior_gross_profit = (
                prior_revenue * prior_gross_margin / 100
                if prior_revenue is not None and prior_gross_margin is not None
                else None
            )
            quarter_gross_profit = self._subtract(
                cumulative_gross_profit,
                prior_gross_profit,
            )
            gross_margin = (
                clean_number(quarter_gross_profit / revenue * 100)
                if revenue not in (None, 0) and quarter_gross_profit is not None
                else None
            )
            net_margin = (
                clean_number(net_profit / revenue * 100)
                if revenue not in (None, 0) and net_profit is not None
                else None
            )
        else:
            gross_margin = values.get("毛利率", {}).get(period)
            net_margin = values.get("销售净利率", {}).get(period)

        previous_period = f"{int(period[:4]) - 1}{period[4:]}"
        previous_flow = {
            key: self._flow_value(values, source_name, previous_period, mode)
            for key, source_name in FLOW_METRICS.items()
        }

        return {
            "period": period,
            "label": self._label(period, mode, latest_period),
            "report_date": datetime.strptime(period, "%Y%m%d").date().isoformat(),
            "revenue": flow["revenue"],
            "revenue_yoy": self._growth(flow["revenue"], previous_flow["revenue"]),
            "parent_net_profit": flow["parent_net_profit"],
            "parent_net_profit_yoy": self._growth(
                flow["parent_net_profit"],
                previous_flow["parent_net_profit"],
            ),
            "deducted_net_profit": flow["deducted_net_profit"],
            "operating_cash_flow": flow["operating_cash_flow"],
            "operating_cash_flow_yoy": self._growth(
                flow["operating_cash_flow"],
                previous_flow["operating_cash_flow"],
            ),
            "gross_margin": gross_margin,
            "net_margin": net_margin,
            "eps": flow["eps"],
            "debt_ratio": values.get("资产负债率", {}).get(period),
        }

    @staticmethod
    def _trend_text(
        label: str,
        first: float | None,
        last: float | None,
    ) -> str | None:
        if first is None or last is None:
            return None
        if abs(last - first) <= max(abs(first), 1) * 0.03:
            return f"{label}整体较为平稳"
        return f"{label}整体{'上升' if last > first else '下降'}"

    def _summaries(
        self,
        periods: list[dict[str, Any]],
        mode: str,
    ) -> list[str]:
        if not periods:
            return ["暂无足够数据生成财务变化摘要"]
        trend_periods = (
            [period for period in periods if period["label"].endswith("年报")]
            if mode == "annual"
            else periods
        )
        if not trend_periods:
            trend_periods = periods
        first = trend_periods[0]
        trend_latest = trend_periods[-1]
        latest = periods[-1]
        summaries = [
            self._trend_text(
                "近几年营收",
                first["revenue"],
                trend_latest["revenue"],
            ),
            (
                f"最新报告期归母净利润同比"
                f"{'增长' if latest['parent_net_profit_yoy'] >= 0 else '下滑'}"
                f"{abs(latest['parent_net_profit_yoy']):.2f}%"
                if latest["parent_net_profit_yoy"] is not None
                else None
            ),
            (
                f"经营现金流同比"
                f"{'改善' if latest['operating_cash_flow_yoy'] >= 0 else '恶化'}"
                f"{abs(latest['operating_cash_flow_yoy']):.2f}%"
                if latest["operating_cash_flow_yoy"] is not None
                else None
            ),
            (
                f"毛利率较首期"
                f"{'提升' if trend_latest['gross_margin'] >= first['gross_margin'] else '下降'}"
                f"{abs(trend_latest['gross_margin'] - first['gross_margin']):.2f}个百分点"
                if trend_latest["gross_margin"] is not None
                and first["gross_margin"] is not None
                else None
            ),
        ]

        revenue_growth = latest.get("revenue_yoy")
        profit_growth = latest.get("parent_net_profit_yoy")
        if revenue_growth is not None and profit_growth is not None:
            summaries.append(
                "利润增长快于营收增长"
                if profit_growth > revenue_growth
                else "利润增长未快于营收增长"
            )

        cash_flow = latest.get("operating_cash_flow")
        profit = latest.get("parent_net_profit")
        if cash_flow is not None and profit not in (None, 0):
            ratio = cash_flow / profit
            if ratio >= 0.8:
                summaries.append("经营现金流与归母净利润匹配度较好")
            elif ratio >= 0:
                summaries.append("经营现金流低于归母净利润，需关注利润含现量")
            else:
                summaries.append("经营现金流为负，与归母净利润不匹配")
        return [summary for summary in summaries if summary]

    def get_financials(self, symbol: str, mode: str = "annual") -> dict[str, Any]:
        if mode not in {"annual", "quarterly"}:
            raise StockDataError("INVALID_FINANCIAL_MODE", "财务报告类型无效。")
        cache_key = f"financials_{symbol}_{mode}"
        cached = self.cache.get(cache_key, self.CACHE_TTL)
        if cached:
            return cached

        try:
            frame = ak.stock_financial_abstract(symbol)
            if frame.empty or "指标" not in frame:
                raise ValueError("财务摘要接口返回空数据或字段不完整")
        except Exception as exc:
            raise StockDataError(
                "FINANCIALS_UNAVAILABLE",
                f"获取 {symbol} 财务数据失败：{exc}",
                "AkShare stock_financial_abstract / 新浪财经",
            ) from exc

        all_periods = [
            str(column)
            for column in frame.columns[2:]
            if str(column).isdigit() and len(str(column)) == 8
        ]
        if not all_periods:
            raise StockDataError(
                "FINANCIALS_UNAVAILABLE",
                f"{symbol} 暂无可识别的财务报告期。",
                "AkShare stock_financial_abstract / 新浪财经",
            )

        values = self._value_map(frame)
        selected_periods = self._select_periods(all_periods, mode)
        latest_period = max(all_periods)
        periods = [
            self._build_period(values, period, mode, latest_period)
            for period in selected_periods
        ]
        updated_at = iso_now()
        result = {
            "symbol": symbol,
            "mode": mode,
            "currency": "CNY",
            "amount_unit": "亿元",
            "periods": periods,
            "summaries": self._summaries(periods, mode),
            "updated_at": updated_at,
            "source": {
                "name": "AkShare / 新浪财经",
                "dataset": "stock_financial_abstract",
                "updated_at": updated_at,
            },
        }
        self.cache.set(cache_key, result)
        return result


financial_service = FinancialService()
