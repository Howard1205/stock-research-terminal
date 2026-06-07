from __future__ import annotations

import re
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError
from datetime import datetime
from pathlib import Path
from typing import Any, Callable

import akshare as ak
import pandas as pd

from app.services.cache import JsonCache
from app.services.stock_service import StockDataError, iso_now


class MarketNewsService:
    CACHE_TTL = 5 * 60
    BOARD_LIMIT = 6

    def __init__(self) -> None:
        cache_directory = Path(__file__).resolve().parents[2] / "cache"
        self.cache = JsonCache(cache_directory)

    def get_news(self, force_refresh: bool = False) -> dict[str, Any]:
        cache_key = "market_news_v3"
        if not force_refresh:
            cached = self.cache.get(cache_key, self.CACHE_TTL)
            if cached:
                return cached

        providers: list[
            tuple[str, str, Callable[[], pd.DataFrame]]
        ] = [
            ("东方财富", "https://kuaixun.eastmoney.com/7_24.html", ak.stock_info_global_em),
            ("同花顺", "https://news.10jqka.com.cn/realtimenews.html", ak.stock_info_global_ths),
            ("富途资讯", "https://news.futunn.com/main/live", ak.stock_info_global_futu),
            ("新浪财经", "https://finance.sina.com.cn/7x24", ak.stock_info_global_sina),
        ]
        items: list[dict[str, Any]] = []
        warnings: list[str] = []
        for source, source_url, provider in providers:
            try:
                frame = self._with_timeout(provider, timeout=8)
                items.extend(self._normalize_frame(frame, source, source_url))
            except Exception:
                warnings.append(f"{source}：暂时不可用")

        deduplicated: list[dict[str, Any]] = []
        seen: set[str] = set()
        for item in sorted(items, key=lambda row: row["published_at"], reverse=True):
            key = re.sub(r"\W+", "", item["title"]).lower()[:80]
            if not key or key in seen:
                continue
            seen.add(key)
            deduplicated.append(item)
        deduplicated = deduplicated[:160]
        hot_sectors, sector_warnings = self._get_hot_sectors(deduplicated)
        warnings.extend(sector_warnings)
        updated_at = iso_now()
        result = {
            "items": deduplicated,
            "daily_summary": self._build_daily_summary(deduplicated),
            "hot_sectors": hot_sectors,
            "warnings": warnings,
            "updated_at": updated_at,
            "source": {
                "name": "多源公开财经快讯",
                "dataset": "stock_info_global_em/ths/futu/sina",
                "updated_at": updated_at,
            },
        }
        self.cache.set(cache_key, result)
        return result

    def _get_hot_sectors(
        self, news_items: list[dict[str, Any]]
    ) -> tuple[list[dict[str, Any]], list[str]]:
        board_sources = [
            ("行业", ak.stock_board_industry_name_em, ak.stock_board_industry_cons_em),
            ("概念", ak.stock_board_concept_name_em, ak.stock_board_concept_cons_em),
        ]
        boards: list[tuple[str, pd.Series, Callable[..., pd.DataFrame]]] = []
        warnings: list[str] = []
        for board_type, board_provider, constituents_provider in board_sources:
            try:
                frame = self._with_timeout(board_provider, timeout=8)
                if frame is None or frame.empty:
                    raise ValueError("接口返回空数据")
                change_column = self._column(frame, ["涨跌幅", "涨幅"])
                if not change_column:
                    raise ValueError("接口缺少涨跌幅字段")
                ranked = frame.copy()
                ranked[change_column] = pd.to_numeric(
                    ranked[change_column], errors="coerce"
                )
                ranked = ranked.dropna(subset=[change_column]).sort_values(
                    change_column, ascending=False
                )
                boards.extend(
                    (board_type, row, constituents_provider)
                    for _, row in ranked.head(self.BOARD_LIMIT).iterrows()
                )
            except Exception:
                warnings.append(f"{board_type}板块：暂时不可用")

        if not boards:
            return [], warnings

        results: list[dict[str, Any]] = []
        with ThreadPoolExecutor(max_workers=6) as executor:
            futures = [
                executor.submit(
                    self._build_sector,
                    board_type,
                    row,
                    constituents_provider,
                    news_items,
                )
                for board_type, row, constituents_provider in boards
            ]
            for future in futures:
                try:
                    sector = future.result(timeout=8)
                    if sector:
                        results.append(sector)
                except Exception:
                    warnings.append("部分板块成分股：暂时不可用")
        results.sort(key=lambda item: item["change_percent"], reverse=True)
        return results[:10], warnings

    def _build_sector(
        self,
        board_type: str,
        row: pd.Series,
        constituents_provider: Callable[..., pd.DataFrame],
        news_items: list[dict[str, Any]],
    ) -> dict[str, Any] | None:
        name = self._pick(row, ["板块名称", "名称"])
        if not name:
            return None
        change = self._number(row, ["涨跌幅", "涨幅"])
        if change is None:
            return None
        stocks: list[dict[str, Any]] = []
        try:
            constituents = constituents_provider(symbol=name)
            if constituents is not None and not constituents.empty:
                stock_change_column = self._column(
                    constituents, ["涨跌幅", "涨幅"]
                )
                ranked = constituents.copy()
                if stock_change_column:
                    ranked[stock_change_column] = pd.to_numeric(
                        ranked[stock_change_column], errors="coerce"
                    )
                    ranked = ranked.sort_values(
                        stock_change_column, ascending=False
                    )
                for _, stock in ranked.head(4).iterrows():
                    stock_name = self._pick(stock, ["名称", "股票名称"])
                    stock_code = self._pick(stock, ["代码", "股票代码"])
                    if stock_name:
                        stocks.append(
                            {
                                "name": stock_name,
                                "symbol": stock_code,
                                "change_percent": self._number(
                                    stock, ["涨跌幅", "涨幅"]
                                ),
                            }
                        )
        except Exception:
            stocks = []

        evidence = self._sector_evidence(name, news_items)
        rising = self._number(row, ["上涨家数"])
        falling = self._number(row, ["下跌家数"])
        total = (rising or 0) + (falling or 0)
        heat = round((rising or 0) / total * 100) if total else None
        return {
            "name": name,
            "type": board_type,
            "change_percent": change,
            "heat": heat,
            "stocks": stocks,
            "reason": (
                evidence["summary"]
                if evidence
                else "暂未找到与该板块直接对应的可靠公开事件"
            ),
            "source": evidence["source"] if evidence else "东方财富板块行情",
            "source_url": (
                evidence["url"]
                if evidence
                else "https://quote.eastmoney.com/center/boardlist.html"
            ),
        }

    @staticmethod
    def _sector_evidence(
        sector_name: str, news_items: list[dict[str, Any]]
    ) -> dict[str, str] | None:
        aliases = {
            "光模块": ["光模块", "CPO", "光通信"],
            "半导体": ["半导体", "芯片", "晶圆"],
            "机器人": ["机器人", "人形机器人"],
            "存储": ["存储", "DRAM", "NAND", "HBM"],
            "人工智能": ["人工智能", "AI", "算力", "大模型"],
        }
        keywords = [sector_name, *aliases.get(sector_name, [])]
        for item in news_items[:80]:
            text = f'{item["title"]} {item["summary"]}'
            if any(keyword.lower() in text.lower() for keyword in keywords):
                return {
                    "summary": item["summary"],
                    "source": item["source"],
                    "url": item["url"],
                }
        return None

    @staticmethod
    def _column(frame: pd.DataFrame, names: list[str]) -> str:
        return next((name for name in names if name in frame.columns), "")

    @staticmethod
    def _number(row: pd.Series, names: list[str]) -> float | None:
        for name in names:
            if name not in row or pd.isna(row[name]):
                continue
            try:
                return float(str(row[name]).replace("%", "").replace(",", ""))
            except ValueError:
                continue
        return None

    @staticmethod
    def _with_timeout(operation: Callable[[], Any], timeout: int) -> Any:
        executor = ThreadPoolExecutor(max_workers=1)
        future = executor.submit(operation)
        try:
            return future.result(timeout=timeout)
        except FutureTimeoutError as exc:
            future.cancel()
            raise TimeoutError(f"超过 {timeout} 秒未响应") from exc
        finally:
            executor.shutdown(wait=False, cancel_futures=True)

    def _normalize_frame(
        self, frame: pd.DataFrame, source: str, source_url: str
    ) -> list[dict[str, Any]]:
        if frame is None or frame.empty:
            raise ValueError("接口返回空数据")
        records: list[dict[str, Any]] = []
        for _, row in frame.head(80).iterrows():
            title = self._pick(row, ["标题", "title"])
            content = self._pick(row, ["摘要", "内容", "content", "digest"])
            if not title:
                title = content[:60]
            if not title:
                continue
            published_at = self._normalize_time(
                self._pick(row, ["发布时间", "时间", "发布日期", "time"])
            )
            url = self._pick(row, ["链接", "url", "detailUrl"]) or source_url
            combined = f"{title} {content}"
            markets, sectors = self._classify_topics(combined)
            impact = self._classify_impact(combined, markets, sectors)
            records.append(
                {
                    "id": f"{source}-{published_at}-{abs(hash(title))}",
                    "title": self._clean_text(title, 120),
                    "summary": self._clean_text(content or title, 100),
                    "published_at": published_at,
                    "source": source,
                    "url": url,
                    "markets": markets,
                    "sectors": sectors,
                    "impact": impact,
                    "importance": self._importance(combined, source),
                }
            )
        return records

    @staticmethod
    def _importance(text: str, source: str) -> str:
        high_priority = [
            "央行",
            "证监会",
            "美联储",
            "业绩预告",
            "重大合同",
            "中标",
            "停牌",
            "退市",
            "制裁",
            "降息",
            "加息",
        ]
        if any(keyword in text for keyword in high_priority):
            return "高"
        if source in {"东方财富", "同花顺"}:
            return "中"
        return "普通"

    @staticmethod
    def _pick(row: pd.Series, names: list[str]) -> str:
        for name in names:
            if name in row and not pd.isna(row[name]):
                value = str(row[name]).strip()
                if value and value.lower() != "nan":
                    return value
        return ""

    @staticmethod
    def _normalize_time(value: str) -> str:
        if not value:
            return iso_now()
        parsed = pd.to_datetime(value, errors="coerce")
        if pd.isna(parsed):
            return value
        if getattr(parsed, "tzinfo", None) is not None:
            parsed = parsed.tz_convert("Asia/Shanghai")
        return parsed.strftime("%Y-%m-%d %H:%M:%S")

    @staticmethod
    def _clean_text(value: str, limit: int) -> str:
        text = re.sub(r"<[^>]+>", "", value)
        text = re.sub(r"\s+", " ", text).strip()
        return text[:limit] + ("…" if len(text) > limit else "")

    @staticmethod
    def _classify_topics(text: str) -> tuple[list[str], list[str]]:
        rules = {
            "A股": ["A股", "沪指", "深成指", "创业板", "上证", "证监会"],
            "美股": ["美股", "纳指", "标普", "道指", "华尔街", "美联储"],
            "港股": ["港股", "恒生", "港交所"],
            "宏观": ["利率", "汇率", "通胀", "就业", "非农", "GDP", "央行", "降息", "加息"],
        }
        sector_rules = {
            "AI": ["人工智能", "AI", "大模型"],
            "AI算力": ["算力", "GPU", "数据中心", "英伟达"],
            "半导体": ["半导体", "芯片", "晶圆"],
            "存储": ["存储", "DRAM", "NAND", "HBM"],
            "光模块": ["光模块", "CPO", "光通信"],
            "机器人": ["机器人", "人形机器人"],
            "新能源": ["新能源", "锂电", "光伏", "风电"],
            "消费": ["消费", "白酒", "零售"],
            "金融": ["银行", "保险", "券商", "金融"],
            "美股科技": ["苹果", "微软", "谷歌", "亚马逊", "Meta", "特斯拉"],
        }
        markets = [
            label for label, keywords in rules.items() if any(key in text for key in keywords)
        ]
        sectors = [
            label
            for label, keywords in sector_rules.items()
            if any(key.lower() in text.lower() for key in keywords)
        ]
        return markets or ["全球"], sectors

    @staticmethod
    def _classify_impact(
        text: str, markets: list[str], sectors: list[str]
    ) -> str:
        positive = ["上涨", "增长", "突破", "中标", "降息", "回购", "超预期", "利好"]
        negative = ["下跌", "下滑", "风险", "制裁", "加息", "亏损", "不及预期", "利空"]
        score = sum(word in text for word in positive) - sum(
            word in text for word in negative
        )
        if score == 0:
            return "中性" if not any(word in text for word in ["或", "可能", "预计"]) else "不确定"
        prefix = "利好" if score > 0 else "利空"
        if "AI算力" in sectors:
            return f"{prefix}AI算力"
        if any(sector in sectors for sector in ["AI", "半导体", "存储", "光模块", "美股科技"]):
            return f"{prefix}科技股"
        if "美股" in markets:
            return f"{prefix}美股"
        if "A股" in markets:
            return f"{prefix}A股"
        return "不确定"

    @staticmethod
    def _build_daily_summary(items: list[dict[str, Any]]) -> dict[str, Any]:
        top = items[:5]
        impacts = [item["impact"] for item in items[:30]]
        risks = [
            item["title"]
            for item in items[:30]
            if item["impact"].startswith("利空")
        ][:3]
        return {
            "top_items": [
                {
                    "title": item["title"],
                    "impact": item["impact"],
                    "url": item["url"],
                }
                for item in top
            ],
            "a_share": MarketNewsService._impact_summary(impacts, "A股"),
            "us_share": MarketNewsService._impact_summary(impacts, "美股"),
            "technology": MarketNewsService._impact_summary(impacts, "科技"),
            "risks": risks,
        }

    @staticmethod
    def _impact_summary(impacts: list[str], keyword: str) -> str:
        positive = sum(impact.startswith("利好") and keyword in impact for impact in impacts)
        negative = sum(impact.startswith("利空") and keyword in impact for impact in impacts)
        if positive > negative:
            return "近期快讯中正向催化相对更多，仍需结合市场价格验证。"
        if negative > positive:
            return "近期快讯中风险信息相对更多，需关注后续确认。"
        return "公开快讯暂未形成明确单边方向。"


market_news_service = MarketNewsService()
