from __future__ import annotations

import math
import re
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError
from datetime import date, datetime, timedelta
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

import akshare as ak
import pandas as pd
import requests

from app.services.cache import JsonCache


SOURCE_NAME = "AkShare / 东方财富"
SYMBOL_PATTERN = re.compile(r"^\d{6}$")


class StockDataError(Exception):
    def __init__(self, code: str, message: str, source: str = SOURCE_NAME) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.source = source


def clean_number(value: Any) -> float | int | None:
    if value is None or pd.isna(value):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number):
        return None
    return int(number) if number.is_integer() else round(number, 4)


def iso_now() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


class StockService:
    STOCK_UNIVERSE_TTL = 24 * 60 * 60
    QUOTE_TTL = 30
    KLINE_TTL = 6 * 60 * 60
    FUND_FLOW_TTL = 30 * 60

    def __init__(self) -> None:
        cache_directory = Path(__file__).resolve().parents[2] / "cache"
        self.cache = JsonCache(cache_directory)
        self._universe: list[dict[str, str]] | None = None
        self.stock_universe_updated_at: str | None = None

    def _validate_symbol(self, symbol: str) -> str:
        normalized = symbol.strip()
        if not SYMBOL_PATTERN.match(normalized):
            raise StockDataError("INVALID_SYMBOL", "股票代码必须是 6 位数字。")
        return normalized

    @staticmethod
    def _call_with_retries(operation: Any, attempts: int = 3) -> Any:
        last_error: Exception | None = None
        for attempt in range(attempts):
            try:
                return operation()
            except Exception as exc:
                last_error = exc
                if attempt < attempts - 1:
                    time.sleep(0.8 * (attempt + 1))
        if last_error is None:
            raise RuntimeError("外部数据调用未执行")
        raise last_error

    def _load_universe(self) -> list[dict[str, str]]:
        if self._universe is not None:
            return self._universe

        cached = self.cache.get("stock_universe", self.STOCK_UNIVERSE_TTL)
        if cached:
            self._universe = cached["stocks"]
            self.stock_universe_updated_at = cached["updated_at"]
            return self._universe

        try:
            frame = self._call_with_retries(ak.stock_info_a_code_name)
            if frame.empty or "code" not in frame or "name" not in frame:
                raise ValueError("返回的股票池为空或字段不完整")
            stocks = [
                {
                    "symbol": str(row["code"]).zfill(6),
                    "name": str(row["name"]).strip(),
                }
                for _, row in frame.iterrows()
            ]
        except Exception as exc:
            raise StockDataError(
                "STOCK_UNIVERSE_UNAVAILABLE",
                f"获取 A 股股票池失败：{exc}",
                "AkShare stock_info_a_code_name",
            ) from exc

        updated_at = iso_now()
        payload = {"stocks": stocks, "updated_at": updated_at}
        self.cache.set("stock_universe", payload)
        self._universe = stocks
        self.stock_universe_updated_at = updated_at
        return stocks

    def _stock_name(self, symbol: str) -> str:
        for stock in self._load_universe():
            if stock["symbol"] == symbol:
                return stock["name"]
        raise StockDataError("STOCK_NOT_FOUND", f"股票池中找不到代码 {symbol}。")

    @staticmethod
    def _market_prefix(symbol: str) -> str:
        if symbol.startswith("6"):
            return "sh"
        if symbol.startswith(("4", "8", "9")):
            return "bj"
        return "sz"

    def _get_sina_quote(self, symbol: str) -> dict[str, Any]:
        universe = sorted(
            self._load_universe(),
            key=lambda stock: self._market_prefix(stock["symbol"]) + stock["symbol"],
        )
        stock_index = next(
            index
            for index, stock in enumerate(universe)
            if stock["symbol"] == symbol
        )
        page = stock_index // 80 + 1
        response = requests.get(
            "http://vip.stock.finance.sina.com.cn/quotes_service/api/"
            "json_v2.php/Market_Center.getHQNodeData",
            params={
                "page": str(page),
                "num": "80",
                "sort": "symbol",
                "asc": "1",
                "node": "hs_a",
                "symbol": "",
                "_s_r_a": "page",
            },
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=15,
        )
        response.raise_for_status()
        quote = next(
            item for item in response.json() if str(item.get("code")) == symbol
        )
        return {
            "symbol": symbol,
            "name": str(quote["name"]),
            "price": clean_number(quote.get("trade")),
            "change_percent": clean_number(quote.get("changepercent")),
            "volume": clean_number(quote.get("volume")),
            # Sina's market-cap fields are reported in CNY 10,000.
            "market_cap": clean_number(float(quote["mktcap"]) * 10_000)
            if quote.get("mktcap") is not None
            else None,
            "pe": clean_number(quote.get("per")),
            "pb": clean_number(quote.get("pb")),
            "circulating_market_cap": clean_number(float(quote["nmc"]) * 10_000)
            if quote.get("nmc") is not None
            else None,
            "turnover_rate": clean_number(quote.get("turnoverratio")),
            "amplitude": (
                clean_number(
                    (float(quote["high"]) - float(quote["low"]))
                    / float(quote["settlement"])
                    * 100
                )
                if quote.get("settlement") not in (None, "0", 0)
                else None
            ),
            "volume_ratio": None,
            "limit_up": None,
            "limit_down": None,
            "industry": None,
            "concepts": [],
            "source_name": "AkShare 数据口径 / 新浪财经",
            "source_dataset": "Sina Market_Center.getHQNodeData",
        }

    def _get_eastmoney_quote(self, symbol: str, fallback_name: str) -> dict[str, Any]:
        market_code = 1 if symbol.startswith("6") else 0
        response = requests.get(
            "https://push2delay.eastmoney.com/api/qt/stock/get",
            params={
                "fltt": "2",
                "invt": "2",
                "fields": (
                    "f43,f44,f45,f46,f47,f50,f51,f52,f57,f58,f60,"
                    "f116,f117,f127,f129,f162,f167,f168,f170,f171"
                ),
                "secid": f"{market_code}.{symbol}",
            },
            headers={
                "User-Agent": "Mozilla/5.0",
                "Referer": "https://quote.eastmoney.com/",
            },
            timeout=15,
        )
        response.raise_for_status()
        row = response.json().get("data")
        if not row:
            raise ValueError("实时行情结果中没有该股票")
        return {
            "symbol": symbol,
            "name": str(row.get("f58") or fallback_name),
            "price": clean_number(row.get("f43")),
            "change_percent": clean_number(row.get("f170")),
            "volume": clean_number(float(row["f47"]) * 100)
            if row.get("f47") is not None
            else None,
            "market_cap": clean_number(row.get("f116")),
            "circulating_market_cap": clean_number(row.get("f117")),
            "pe": clean_number(row.get("f162")),
            "pb": clean_number(row.get("f167")),
            "turnover_rate": clean_number(row.get("f168")),
            "amplitude": clean_number(row.get("f171")),
            "volume_ratio": clean_number(row.get("f50")),
            "limit_up": clean_number(row.get("f51")),
            "limit_down": clean_number(row.get("f52")),
            "industry": str(row.get("f127")) if row.get("f127") else None,
            "concepts": [
                item.strip()
                for item in str(row.get("f129") or "").split(",")
                if item.strip()
            ],
            "source_name": "AkShare / 东方财富",
            "source_dataset": "Eastmoney stock/get",
        }

    def search(self, q: str, limit: int) -> list[dict[str, str]]:
        query = q.strip().lower()
        if not query:
            return []

        matches: list[tuple[float, dict[str, str]]] = []
        for stock in self._load_universe():
            symbol = stock["symbol"]
            name = stock["name"]
            lowered_name = name.lower()

            score = 0.0
            if query == symbol or query == lowered_name:
                score = 100
            elif symbol.startswith(query):
                score = 90
            elif lowered_name.startswith(query):
                score = 85
            elif query in symbol:
                score = 75
            elif query in lowered_name:
                score = 70
            else:
                similarity = SequenceMatcher(None, query, lowered_name).ratio()
                if similarity >= 0.45:
                    score = similarity * 50

            if score:
                matches.append((score, stock))

        matches.sort(key=lambda item: (-item[0], item[1]["symbol"]))
        return [stock for _, stock in matches[:limit]]

    def get_stock_detail(self, raw_symbol: str) -> dict[str, Any]:
        symbol = self._validate_symbol(raw_symbol)
        name = self._stock_name(symbol)
        cache_key = f"quote_{symbol}"
        cached = self.cache.get(cache_key, self.QUOTE_TTL)
        if cached:
            return cached

        try:
            quote = self._get_eastmoney_quote(symbol, name)
        except Exception as eastmoney_error:
            try:
                quote = self._call_with_retries(
                    lambda: self._get_sina_quote(symbol)
                )
            except Exception as sina_error:
                raise StockDataError(
                    "QUOTE_UNAVAILABLE",
                    (
                        f"获取 {symbol} 实时行情失败。"
                        f"东方财富：{eastmoney_error}；新浪财经：{sina_error}"
                    ),
                    "AkShare / 东方财富 / 新浪财经",
                ) from sina_error

        updated_at = iso_now()
        result = {
            "symbol": quote["symbol"],
            "name": quote["name"],
            "price": quote["price"],
            "change_percent": quote["change_percent"],
            "volume": quote["volume"],
            "market_cap": quote["market_cap"],
            "pe": quote["pe"],
            "pb": quote["pb"],
            "circulating_market_cap": quote["circulating_market_cap"],
            "turnover_rate": quote["turnover_rate"],
            "amplitude": quote["amplitude"],
            "volume_ratio": quote["volume_ratio"],
            "limit_up": quote["limit_up"],
            "limit_down": quote["limit_down"],
            "industry": quote["industry"],
            "concepts": quote["concepts"],
            "updated_at": updated_at,
            "source": {
                "name": quote["source_name"],
                "dataset": quote["source_dataset"],
                "updated_at": updated_at,
            },
        }
        self.cache.set(cache_key, result)
        return result

    def get_kline(
        self,
        raw_symbol: str,
        period: str = "daily",
        range_key: str = "1y",
    ) -> dict[str, Any]:
        symbol = self._validate_symbol(raw_symbol)
        self._stock_name(symbol)
        period_rules = {
            "daily": {"resample": None, "buffer_days": 120},
            "weekly": {"resample": "W-FRI", "buffer_days": 500},
            "monthly": {"resample": "ME", "buffer_days": 2200},
            "yearly": {"resample": "YE", "buffer_days": 15000},
        }
        range_days = {
            "1y": 365,
            "3y": 365 * 3,
            "5y": 365 * 5,
            "10y": 365 * 10,
            "all": None,
        }
        if period not in period_rules:
            raise StockDataError("INVALID_PERIOD", "K 线周期参数无效。")
        if range_key not in range_days:
            raise StockDataError("INVALID_RANGE", "K 线时间范围参数无效。")

        cache_key = f"kline_v4_{symbol}_{period}_{range_key}"
        cached = self.cache.get(cache_key, self.KLINE_TTL)
        if cached:
            return cached

        end_date = date.today()
        visible_start = (
            end_date - timedelta(days=range_days[range_key])
            if range_days[range_key]
            else date(1990, 1, 1)
        )
        calculation_start = visible_start - timedelta(
            days=period_rules[period]["buffer_days"]
        )
        calculation_start = max(calculation_start, date(1990, 1, 1))

        kline_source = {
            "name": "AkShare / 东方财富",
            "dataset": "stock_zh_a_hist",
        }
        volume_multiplier = 100
        try:
            frame = self._call_with_retries(
                lambda: ak.stock_zh_a_hist(
                    symbol=symbol,
                    period="daily",
                    start_date=calculation_start.strftime("%Y%m%d"),
                    end_date=end_date.strftime("%Y%m%d"),
                    adjust="qfq",
                ),
                attempts=2,
            )
        except Exception as eastmoney_error:
            try:
                frame = self._call_with_retries(
                    lambda: ak.stock_zh_a_daily(
                        symbol=f"{self._market_prefix(symbol)}{symbol}",
                        start_date=calculation_start.strftime("%Y%m%d"),
                        end_date=end_date.strftime("%Y%m%d"),
                        adjust="qfq",
                    ),
                    attempts=2,
                ).rename(
                    columns={
                        "date": "日期",
                        "open": "开盘",
                        "close": "收盘",
                        "high": "最高",
                        "low": "最低",
                        "volume": "成交量",
                    }
                )
                kline_source = {
                    "name": "AkShare / 新浪财经",
                    "dataset": "stock_zh_a_daily",
                }
                volume_multiplier = 1
            except Exception as sina_error:
                raise StockDataError(
                    "KLINE_UNAVAILABLE",
                    (
                        f"获取 {symbol} K 线失败。"
                        f"东方财富：{eastmoney_error}；新浪财经：{sina_error}"
                    ),
                    "AkShare / 东方财富 / 新浪财经",
                ) from sina_error

        try:
            if frame.empty:
                raise ValueError("K 线接口返回空数据")
            required = {"日期", "开盘", "收盘", "最高", "最低", "成交量"}
            missing = required.difference(frame.columns)
            if missing:
                raise ValueError(f"K 线缺少字段：{', '.join(sorted(missing))}")
        except Exception as exc:
            raise StockDataError(
                "KLINE_UNAVAILABLE",
                f"处理 {symbol} K 线失败：{exc}",
                kline_source["name"],
            ) from exc

        frame = frame.copy()
        frame["日期"] = pd.to_datetime(frame["日期"])
        for column in ["开盘", "收盘", "最高", "最低", "成交量", "换手率"]:
            if column not in frame.columns:
                frame[column] = None
            frame[column] = pd.to_numeric(frame[column], errors="coerce")
        frame["成交量"] = frame["成交量"] * volume_multiplier
        frame["换手率估算"] = False
        if frame["换手率"].isna().all():
            try:
                detail = self.get_stock_detail(symbol)
                float_cap = detail.get("circulating_market_cap")
                current_price = detail.get("price")
                float_shares = (
                    float(float_cap) / float(current_price)
                    if float_cap and current_price
                    else None
                )
                if float_shares and float_shares > 0:
                    frame["换手率"] = frame["成交量"] / float_shares * 100
                    frame["换手率估算"] = True
            except (StockDataError, TypeError, ValueError, ZeroDivisionError):
                pass
        frame = frame.dropna(subset=["日期", "开盘", "收盘", "最高", "最低"])
        frame = frame.sort_values("日期")

        resample_rule = period_rules[period]["resample"]
        if resample_rule:
            frame["实际日期"] = frame["日期"]
            frame = (
                frame.set_index("日期")
                .resample(resample_rule)
                .agg(
                    {
                        "实际日期": "max",
                        "开盘": "first",
                        "最高": "max",
                        "最低": "min",
                        "收盘": "last",
                        "成交量": "sum",
                        "换手率": "sum",
                        "换手率估算": "max",
                    }
                )
                .dropna(subset=["开盘", "收盘"])
                .reset_index()
            )
            frame["日期"] = frame["实际日期"]
            frame = frame.drop(columns=["实际日期"])

        previous_close = frame["收盘"].shift(1)
        frame["涨跌幅"] = (frame["收盘"] / previous_close - 1) * 100
        frame["振幅"] = (frame["最高"] - frame["最低"]) / previous_close * 100
        frame["MA5"] = frame["收盘"].rolling(5).mean()
        frame["MA10"] = frame["收盘"].rolling(10).mean()
        frame["MA20"] = frame["收盘"].rolling(20).mean()
        frame["MA60"] = frame["收盘"].rolling(60).mean()
        frame["BBI"] = (
            frame["收盘"].rolling(3).mean()
            + frame["收盘"].rolling(6).mean()
            + frame["收盘"].rolling(12).mean()
            + frame["收盘"].rolling(24).mean()
        ) / 4
        frame = frame.loc[frame["日期"].dt.date >= visible_start]

        bars = []
        for _, row in frame.iterrows():
            bars.append(
                {
                    "time": row["日期"].strftime("%Y-%m-%d"),
                    "open": clean_number(row["开盘"]),
                    "high": clean_number(row["最高"]),
                    "low": clean_number(row["最低"]),
                    "close": clean_number(row["收盘"]),
                    "volume": clean_number(row["成交量"]),
                    "change_percent": clean_number(row["涨跌幅"]),
                    "amplitude": clean_number(row["振幅"]),
                    "turnover_rate": clean_number(row["换手率"]),
                    "turnover_estimated": bool(row["换手率估算"]),
                    "ma5": clean_number(row["MA5"]),
                    "ma10": clean_number(row["MA10"]),
                    "ma20": clean_number(row["MA20"]),
                    "ma60": clean_number(row["MA60"]),
                    "bbi": clean_number(row["BBI"]),
                }
            )

        updated_at = iso_now()
        result = {
            "symbol": symbol,
            "period": period,
            "range": range_key,
            "adjust": "qfq",
            "bars": bars,
            "updated_at": updated_at,
            "source": {
                "name": kline_source["name"],
                "dataset": kline_source["dataset"],
                "updated_at": updated_at,
            },
        }
        self.cache.set(cache_key, result)
        return result

    def get_fund_flow(self, raw_symbol: str) -> dict[str, Any]:
        symbol = self._validate_symbol(raw_symbol)
        self._stock_name(symbol)
        cache_key = f"fund_flow_v2_{symbol}"
        cached = self.cache.get(cache_key, self.FUND_FLOW_TTL)
        if cached:
            return cached

        errors: list[str] = []
        providers = [
            self._get_eastmoney_fund_flow,
            self._get_ths_individual_fund_flow,
            self._get_ths_big_deal_fund_flow,
        ]
        for provider in providers:
            try:
                items, source_name, dataset = self._call_with_timeout(
                    lambda: provider(symbol),
                    timeout=8,
                )
                if not items:
                    raise ValueError("接口未返回该股票的有效资金流记录")
                updated_at = iso_now()
                result = {
                    "symbol": symbol,
                    "items": items,
                    "updated_at": updated_at,
                    "source": {
                        "name": source_name,
                        "dataset": dataset,
                        "updated_at": updated_at,
                    },
                }
                self.cache.set(cache_key, result)
                return result
            except Exception as exc:
                errors.append(f"{provider.__name__}: {exc}")

        raise StockDataError(
            "FUND_FLOW_UNAVAILABLE",
            f"获取 {symbol} 资金流失败；已尝试东方财富和同花顺公开接口。"
            f" {' | '.join(errors)}",
            "AkShare / 东方财富 / 同花顺",
        )

    @staticmethod
    def _call_with_timeout(operation: Any, timeout: int) -> Any:
        executor = ThreadPoolExecutor(max_workers=1)
        future = executor.submit(operation)
        try:
            return future.result(timeout=timeout)
        except FutureTimeoutError as exc:
            future.cancel()
            raise TimeoutError(f"数据源超过 {timeout} 秒未响应") from exc
        finally:
            executor.shutdown(wait=False, cancel_futures=True)

    def _get_eastmoney_fund_flow(
        self, symbol: str
    ) -> tuple[list[dict[str, Any]], str, str]:
        frame = self._call_with_retries(
            lambda: ak.stock_individual_fund_flow(
                stock=symbol,
                market=self._market_prefix(symbol),
            ),
            attempts=2,
        )
        if frame.empty or "日期" not in frame.columns:
            raise ValueError("资金流接口返回空数据或缺少日期字段")
        columns = {
            "main": "主力净流入-净额",
            "super_large": "超大单净流入-净额",
            "large": "大单净流入-净额",
            "medium": "中单净流入-净额",
            "small": "小单净流入-净额",
        }
        frame = frame.copy()
        frame["日期"] = pd.to_datetime(frame["日期"], errors="coerce")
        for column in columns.values():
            if column not in frame.columns:
                frame[column] = None
            frame[column] = pd.to_numeric(frame[column], errors="coerce")
        frame = frame.dropna(subset=["日期"]).sort_values("日期").tail(500)
        items = [
            self._fund_flow_item(
                row["日期"].strftime("%Y-%m-%d"),
                {
                    key: clean_number(row[column])
                    for key, column in columns.items()
                },
            )
            for _, row in frame.iterrows()
        ]
        return items, "AkShare / 东方财富", "stock_individual_fund_flow"

    def _get_ths_individual_fund_flow(
        self, symbol: str
    ) -> tuple[list[dict[str, Any]], str, str]:
        frame = self._call_with_retries(
            lambda: ak.stock_fund_flow_individual(symbol="即时"),
            attempts=2,
        )
        code_column = "股票代码"
        if frame.empty or code_column not in frame.columns:
            raise ValueError("同花顺个股资金流接口返回空数据")
        matched = frame[
            frame[code_column].astype(str).str.zfill(6).eq(symbol)
        ]
        if matched.empty:
            raise ValueError("同花顺个股资金流中未找到该股票")
        row = matched.iloc[0]
        inflow = self._parse_money_value(row.get("流入资金"))
        outflow = self._parse_money_value(row.get("流出资金"))
        net = self._parse_money_value(row.get("净额"))
        if net is None and inflow is not None and outflow is not None:
            net = inflow - outflow
        item = self._fund_flow_item(
            date.today().isoformat(),
            {"main": net, "super_large": None, "large": None, "medium": None, "small": None},
        )
        item["main_inflow"] = clean_number(inflow)
        item["main_outflow"] = clean_number(outflow)
        return [item], "AkShare / 同花顺", "stock_fund_flow_individual"

    def _get_ths_big_deal_fund_flow(
        self, symbol: str
    ) -> tuple[list[dict[str, Any]], str, str]:
        frame = self._call_with_retries(ak.stock_fund_flow_big_deal, attempts=2)
        if frame.empty or "股票代码" not in frame.columns:
            raise ValueError("同花顺大单追踪接口返回空数据")
        matched = frame[
            frame["股票代码"].astype(str).str.zfill(6).eq(symbol)
        ]
        if matched.empty:
            raise ValueError("同花顺大单追踪中未找到该股票")
        inflow = 0.0
        outflow = 0.0
        for _, row in matched.iterrows():
            amount = self._parse_money_value(row.get("成交额"))
            if amount is None:
                continue
            nature = str(row.get("大单性质", ""))
            if "买" in nature:
                inflow += amount
            elif "卖" in nature:
                outflow += amount
        if inflow == 0 and outflow == 0:
            raise ValueError("同花顺大单追踪缺少可汇总的买卖金额")
        item = self._fund_flow_item(
            date.today().isoformat(),
            {
                "main": inflow - outflow,
                "super_large": None,
                "large": inflow - outflow,
                "medium": None,
                "small": None,
            },
        )
        item["main_inflow"] = clean_number(inflow)
        item["main_outflow"] = clean_number(outflow)
        item["large_inflow"] = clean_number(inflow)
        item["large_outflow"] = clean_number(outflow)
        return [item], "AkShare / 同花顺", "stock_fund_flow_big_deal"

    @staticmethod
    def _fund_flow_item(
        flow_date: str, nets: dict[str, float | int | None]
    ) -> dict[str, Any]:
        item: dict[str, Any] = {"date": flow_date}
        for key in ("main", "super_large", "large", "medium", "small"):
            net = clean_number(nets.get(key))
            numeric = float(net) if net is not None else None
            item[f"{key}_net"] = net
            item[f"{key}_inflow"] = (
                clean_number(max(numeric, 0)) if numeric is not None else None
            )
            item[f"{key}_outflow"] = (
                clean_number(abs(min(numeric, 0))) if numeric is not None else None
            )
        return item

    @staticmethod
    def _parse_money_value(value: Any) -> float | None:
        if value is None or pd.isna(value):
            return None
        if isinstance(value, (int, float)):
            return float(value)
        text = str(value).strip().replace(",", "")
        match = re.search(r"-?\d+(?:\.\d+)?", text)
        if not match:
            return None
        number = float(match.group())
        if "亿" in text:
            number *= 100_000_000
        elif "万" in text:
            number *= 10_000
        return number


stock_service = StockService()
