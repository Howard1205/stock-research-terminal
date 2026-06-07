from __future__ import annotations

import json
import re
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import akshare as ak
import pandas as pd
import requests
from bs4 import BeautifulSoup
from pypdf import PdfReader

from app.services.cache import JsonCache
from app.services.stock_service import StockDataError, clean_number, iso_now


class ResearchService:
    CACHE_TTL = 6 * 60 * 60
    REPORT_SUMMARY_TTL = 30 * 24 * 60 * 60
    CNINFO_BASE = "http://www.cninfo.com.cn"
    CNINFO_STATIC = "https://static.cninfo.com.cn"
    HEADERS = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 Chrome/124.0 Safari/537.36"
        ),
        "Referer": "http://www.cninfo.com.cn/",
    }

    CATEGORY_KEYWORDS = {
        "主营业务": ("主营业务", "主要业务", "公司主要从事", "核心业务"),
        "主要产品": ("主要产品", "产品包括", "产品主要", "产品及服务"),
        "技术壁垒": ("技术壁垒", "核心技术", "技术优势", "技术门槛"),
        "新产品": ("新产品", "新品", "产品迭代", "推出"),
        "新订单/合同": ("在手订单", "新增订单", "重大合同", "中标", "订单"),
        "产能扩张": ("产能扩张", "扩产", "新增产能", "募投项目", "产能建设"),
        "毛利率变化原因": ("毛利率", "毛利变动", "毛利下降", "毛利提升"),
        "经营风险": ("风险因素", "经营风险", "可能面临的风险", "重大风险"),
        "管理层讨论与分析": ("管理层讨论与分析", "经营情况讨论与分析"),
    }
    THEME_KEYWORDS = {
        "AI算力": ("AI算力", "人工智能算力", "算力基础设施", "服务器"),
        "光模块/CPO": ("光模块", "CPO", "光电共封装", "硅光", "光通信"),
        "机器人": ("机器人", "人形机器人", "机器视觉"),
        "半导体": ("半导体", "先进封装", "芯片", "晶圆"),
        "锂电池": ("锂电", "锂电池", "新能源电池"),
        "苹果链/消费电子": ("苹果", "Apple", "消费电子"),
        "存储": ("存储芯片", "存储器", "HBM"),
        "PCB": ("PCB", "印制电路板", "覆铜板"),
        "低空经济": ("低空经济", "无人机", "eVTOL"),
        "数据中心": ("数据中心", "IDC", "液冷"),
    }
    CATALYST_KEYWORDS = {
        "订单/合同": ("订单", "合同", "中标", "框架协议"),
        "业绩": ("业绩预告", "业绩快报", "净利润", "扭亏", "预增"),
        "政策/行业": ("政策", "规划", "补贴", "行业景气", "需求增长"),
        "客户/合作": ("客户", "供应商", "合作", "送样", "认证"),
        "产能": ("产能", "扩产", "投产", "募投"),
        "技术/产品": ("新产品", "核心技术", "研发", "专利", "技术突破"),
        "风险/澄清": ("风险提示", "澄清", "传闻", "不确定性", "减持"),
    }
    EVENT_RULES = (
        (1, "电话会议/投资者交流", ("电话会议", "投资者关系活动", "投资者交流", "机构调研", "调研活动", "调研风向标")),
        (2, "澄清公告", ("澄清", "辟谣", "传闻", "风险提示")),
        (3, "业绩/定期报告", ("业绩预告", "业绩快报", "年度报告", "季度报告", "半年度报告", "一季报", "三季报")),
        (4, "重大订单/合同", ("重大合同", "中标", "订单", "框架协议", "项目合同")),
    )
    QA_KEYWORDS = {
        "订单": ("订单", "中标", "合同"),
        "客户": ("客户", "供应商", "合作伙伴"),
        "产能": ("产能", "扩产", "投产"),
        "技术壁垒": ("技术壁垒", "核心技术", "领先水平", "专利"),
        "新产品": ("新产品", "新品", "新型号"),
        "AI算力": ("AI算力", "算力", "AI服务器"),
        "光模块": ("光模块", "CPO", "硅光", "光通信"),
        "机器人": ("机器人", "具身智能", "机器视觉"),
        "半导体": ("半导体", "芯片", "晶圆", "先进封装"),
        "海外业务": ("海外", "出口", "国际市场", "境外"),
    }

    def __init__(self) -> None:
        cache_directory = Path(__file__).resolve().parents[2] / "cache"
        self.cache = JsonCache(cache_directory)
        self.report_directory = cache_directory / "reports"
        self.report_directory.mkdir(parents=True, exist_ok=True)
        self.session = requests.Session()
        self.session.headers.update(self.HEADERS)

    @staticmethod
    def _plain_text(value: Any) -> str:
        if value is None:
            return ""
        if not isinstance(value, (str, list, tuple, dict)):
            try:
                if pd.isna(value):
                    return ""
            except (TypeError, ValueError):
                pass
        return re.sub(r"\s+", " ", str(value)).strip()

    @staticmethod
    def _published_date(milliseconds: Any) -> str:
        try:
            return datetime.fromtimestamp(
                int(milliseconds) / 1000,
                tz=timezone.utc,
            ).astimezone().date().isoformat()
        except (TypeError, ValueError, OSError):
            return ""

    def _org_id(self, symbol: str) -> str:
        cached = self.cache.get("cninfo_stock_org_map", 7 * 24 * 60 * 60)
        if not cached:
            response = self.session.get(
                f"{self.CNINFO_BASE}/new/data/szse_stock.json",
                timeout=20,
            )
            response.raise_for_status()
            payload = response.json()
            cached = {
                item["code"]: item["orgId"]
                for item in payload.get("stockList", [])
                if item.get("code") and item.get("orgId")
            }
            self.cache.set("cninfo_stock_org_map", cached)
        if symbol not in cached:
            raise ValueError(f"巨潮股票列表中未找到 {symbol}")
        return str(cached[symbol])

    def get_cninfo_announcements(
        self,
        symbol: str,
        start_date: date,
        end_date: date,
        page_size: int = 30,
        category: str = "",
        keyword: str = "",
    ) -> list[dict[str, Any]]:
        org_id = self._org_id(symbol)
        payload = {
            "pageNum": "1",
            "pageSize": str(page_size),
            "column": "szse",
            "tabName": "fulltext",
            "plate": "",
            "stock": f"{symbol},{org_id}",
            "searchkey": keyword,
            "secid": "",
            "category": category,
            "trade": "",
            "seDate": f"{start_date.isoformat()}~{end_date.isoformat()}",
            "sortName": "",
            "sortType": "",
            "isHLtitle": "true",
        }
        response = self.session.post(
            f"{self.CNINFO_BASE}/new/hisAnnouncement/query",
            data=payload,
            timeout=25,
        )
        response.raise_for_status()
        rows = response.json().get("announcements") or []
        reports = []
        for row in rows:
            title = re.sub(r"<[^>]+>", "", self._plain_text(row.get("announcementTitle")))
            attachment = self._plain_text(row.get("adjunctUrl"))
            announcement_id = self._plain_text(row.get("announcementId"))
            detail_url = (
                f"{self.CNINFO_BASE}/new/disclosure/detail?"
                f"stockCode={symbol}&announcementId={announcement_id}&orgId={org_id}"
            )
            reports.append(
                {
                    "id": announcement_id,
                    "title": title,
                    "published_at": self._published_date(row.get("announcementTime")),
                    "url": detail_url,
                    "pdf_url": (
                        f"{self.CNINFO_STATIC}/{attachment}" if attachment else None
                    ),
                }
            )
        return reports

    def get_reports(self, symbol: str) -> dict[str, Any]:
        cache_key = f"research_reports_v2_{symbol}"
        cached = self.cache.get(cache_key, self.CACHE_TTL)
        if cached:
            return cached
        try:
            rows = self.get_cninfo_announcements(
                symbol,
                date.today() - timedelta(days=900),
                date.today(),
                page_size=30,
                category=(
                    "category_ndbg_szsh;category_bndbg_szsh;"
                    "category_yjdbg_szsh;category_sjdbg_szsh"
                ),
            )
        except Exception as exc:
            raise StockDataError(
                "REPORTS_UNAVAILABLE",
                f"获取 {symbol} 巨潮报告失败：{exc}",
                "巨潮资讯公告查询",
            ) from exc
        pattern = re.compile(
            r"年度报告|半年度报告|季度报告|一季报|三季报|重大合同|中标|风险提示"
        )
        reports = []
        for row in rows:
            if not pattern.search(row["title"]):
                continue
            reports.append(
                {
                    **row,
                    "summary_status": "not_generated",
                    "summary": None,
                    "page": None,
                    "section": None,
                }
            )
            if len(reports) >= 16:
                break
        updated_at = iso_now()
        result = {
            "symbol": symbol,
            "reports": reports,
            "updated_at": updated_at,
            "source": {
                "name": "巨潮资讯",
                "dataset": "hisAnnouncement/query",
                "updated_at": updated_at,
            },
        }
        self.cache.set(cache_key, result)
        return result

    def summarize_report(
        self,
        symbol: str,
        report_id: str,
        title: str,
        published_at: str,
        pdf_url: str | None,
        original_url: str,
    ) -> dict[str, Any]:
        if not pdf_url:
            raise StockDataError(
                "REPORT_PDF_MISSING",
                "该公告没有可下载的 PDF 附件链接。",
                "巨潮资讯",
            )
        cache_key = f"report_summary_{symbol}_{report_id}"
        cached = self.cache.get(cache_key, self.REPORT_SUMMARY_TTL)
        if cached:
            return cached
        safe_id = re.sub(r"[^0-9A-Za-z_-]", "", report_id) or "report"
        directory = self.report_directory / symbol
        directory.mkdir(parents=True, exist_ok=True)
        pdf_path = directory / f"{safe_id}.pdf"
        try:
            if not pdf_path.exists():
                response = self.session.get(pdf_url, timeout=60)
                response.raise_for_status()
                if not response.content.startswith(b"%PDF"):
                    raise ValueError("下载内容不是有效 PDF")
                pdf_path.write_bytes(response.content)
            reader = PdfReader(str(pdf_path))
            pages = []
            for index, page in enumerate(reader.pages):
                text = page.extract_text() or ""
                pages.append((index + 1, re.sub(r"\s+", " ", text).strip()))
        except Exception as exc:
            raise StockDataError(
                "REPORT_PARSE_FAILED",
                f"PDF 下载或解析失败：{type(exc).__name__}: {exc}",
                pdf_url,
            ) from exc
        if not any(text for _, text in pages):
            raise StockDataError(
                "REPORT_TEXT_EMPTY",
                "PDF 未提取到文本，文件可能是扫描件，需要 OCR。",
                pdf_url,
            )

        items = []
        for category, keywords in self.CATEGORY_KEYWORDS.items():
            matches = []
            for page_number, page_text in pages:
                for sentence in re.split(r"(?<=[。！？；])", page_text):
                    sentence = sentence.strip()
                    if 28 <= len(sentence) <= 420 and any(
                        keyword.lower() in sentence.lower() for keyword in keywords
                    ):
                        matches.append(
                            {
                                "category": category,
                                "content": sentence[:360],
                                "page": page_number,
                                "section": self._section_hint(page_text, sentence),
                                "source": {
                                    "title": title,
                                    "published_at": published_at,
                                    "url": pdf_url or original_url,
                                    "type": "定期报告PDF",
                                },
                            }
                        )
                    if len(matches) >= 2:
                        break
                if len(matches) >= 2:
                    break
            items.extend(matches)

        updated_at = iso_now()
        result = {
            "status": "available" if items else "unavailable",
            "message": (
                None if items else "PDF 已解析，但未找到可可靠归类的相关原文。"
            ),
            "items": items,
            "page_count": len(pages),
            "local_cache": str(pdf_path.relative_to(self.report_directory.parent)),
            "updated_at": updated_at,
        }
        self.cache.set(cache_key, result)
        return result

    @staticmethod
    def _section_hint(page_text: str, sentence: str) -> str | None:
        position = page_text.find(sentence)
        before = page_text[max(0, position - 180) : position] if position >= 0 else ""
        headings = re.findall(
            r"(?:第[一二三四五六七八九十\d]+[章节]\s*)?[\u4e00-\u9fff]{4,24}",
            before,
        )
        return headings[-1][-30:] if headings else None

    def analyze_move(
        self,
        symbol: str,
        trading_date: str,
        daily: dict[str, Any] | None,
    ) -> dict[str, Any]:
        cache_key = f"move_analysis_v3_{symbol}_{trading_date}"
        cached = self.cache.get(cache_key, self.CACHE_TTL)
        if cached:
            return cached
        target = date.fromisoformat(trading_date)
        start = target - timedelta(days=4)
        end = target + timedelta(days=4)
        evidence: list[dict[str, Any]] = []
        warnings = []

        try:
            for row in self.get_cninfo_announcements(symbol, start, end, 50):
                evidence.append(
                    self._evidence(
                        row["title"],
                        "公司公告",
                        row["published_at"],
                        row["url"],
                        row["title"],
                    )
                )
        except Exception as exc:
            warnings.append(f"公告：{exc}")

        try:
            frame = ak.stock_irm_cninfo(symbol)
            for _, row in frame.iterrows():
                item_date = str(row.get("更新时间", ""))[:10]
                if start.isoformat() <= item_date <= end.isoformat():
                    content = "问：" + self._plain_text(row.get("问题"))
                    answer = self._plain_text(row.get("回答内容"))
                    if answer:
                        content += " 答：" + answer
                    question_id = self._plain_text(row.get("问题编号"))
                    evidence.append(
                        self._evidence(
                            content[:500],
                            "互动易回复" if answer else "互动易提问（未回复）",
                            item_date,
                            f"https://irm.cninfo.com.cn/ircs/question/questionDetail?questionId={question_id}",
                            "互动易投资者问答",
                        )
                    )
        except Exception as exc:
            warnings.append(f"互动易：{exc}")

        try:
            for row in self._stock_news(symbol):
                item_date = row["published_at"]
                if start.isoformat() <= item_date <= end.isoformat():
                    evidence.append(
                        self._evidence(
                            row["content"][:500],
                            row["media"] or "财经媒体",
                            item_date,
                            row["url"],
                            row["title"],
                        )
                    )
        except Exception as exc:
            warnings.append(f"新闻：{exc}")

        try:
            for row in self._research_reports(symbol, start, end):
                evidence.append(
                    self._evidence(
                        row["title"],
                        "券商研报",
                        row["published_at"],
                        row["url"],
                        row["title"],
                    )
                )
        except Exception as exc:
            warnings.append(f"研报：{exc}")

        try:
            for row in self._lhb_records(symbol, start, end):
                content = (
                    f"{row['reason']}；{row['interpretation']}；"
                    f"龙虎榜净买额 {row['net_amount']}"
                )
                evidence.append(
                    self._evidence(
                        content,
                        "龙虎榜",
                        row["published_at"],
                        f"https://data.eastmoney.com/stock/lhb/{trading_date.replace('-', '')}.html",
                        "东方财富龙虎榜",
                    )
                )
        except Exception as exc:
            warnings.append(f"龙虎榜：{exc}")

        evidence = self._deduplicate(evidence)[:12]
        change = (daily or {}).get("change_percent")
        direction = "上涨" if change is not None and change > 0 else "下跌" if change is not None and change < 0 else "波动"
        limit_status = self._limit_status(symbol, change)
        themes = self._matched_labels(
            " ".join(item["title"] + " " + item["content"] for item in evidence),
            self.THEME_KEYWORDS,
        )
        catalysts = self._matched_labels(
            " ".join(item["title"] + " " + item["content"] for item in evidence),
            self.CATALYST_KEYWORDS,
        )
        if evidence:
            summary = (
                f"{trading_date} 股价{direction}"
                f"{'' if change is None else f' {abs(change):.2f}%'}。"
                "目标日前后找到下列公开信息，它们是可能催化因素，不能单独证明价格变动的唯一原因。"
            )
        else:
            summary = "未找到可靠公开原因"
        updated_at = iso_now()
        result = {
            "symbol": symbol,
            "date": trading_date,
            "reliable": bool(evidence),
            "summary": summary,
            "limit_status": limit_status,
            "themes": themes,
            "catalysts": catalysts,
            "evidence": evidence,
            "warnings": warnings,
            "updated_at": updated_at,
            "source": {
                "name": "巨潮资讯 / 互动易 / 东方财富",
                "dataset": "公告、问答、新闻、研报、龙虎榜",
                "updated_at": updated_at,
            },
        }
        self.cache.set(cache_key, result)
        return result

    def get_market_focus(
        self,
        symbol: str,
        profile: dict[str, Any] | None,
        quote: dict[str, Any] | None,
    ) -> dict[str, Any]:
        cache_key = f"market_focus_v8_{symbol}"
        cached = self.cache.get(cache_key, self.CACHE_TTL)
        if cached:
            return cached
        evidence = []
        warnings = []
        try:
            cutoff = (date.today() - timedelta(days=90)).isoformat()
            event_feed = self.get_event_feed(symbol)
            warnings.extend(event_feed.get("warnings") or [])
            for row in event_feed["events"]:
                if row["published_at"] < cutoff or row["relevance_score"] < 60:
                    continue
                evidence.append(
                    self._evidence(
                        row["summary"],
                        row["event_type"],
                        row["published_at"],
                        row["url"],
                        row["title"],
                    )
                )
        except StockDataError as exc:
            warnings.append(f"近期事件：{exc.message}")

        topics = []
        for label, keywords in self.THEME_KEYWORDS.items():
            matches = [
                item
                for item in evidence
                if any(
                    keyword.lower() in (item["title"] + item["content"]).lower()
                    for keyword in keywords
                )
            ]
            if matches:
                catalysts = self._matched_labels(
                    " ".join(item["content"] for item in matches),
                    self.CATALYST_KEYWORDS,
                )
                topics.append(
                    {
                        "topic": label,
                        "possible_catalyst": "、".join(catalysts) if catalysts else "公开信息关注度提升",
                        "evidence": matches[:3],
                    }
                )
        event_topics = {
            "机构近期关注": ("电话会议/投资者交流", "董秘回复"),
            "订单与业务进展": ("重大订单/合同",),
            "业绩变化": ("业绩/定期报告",),
            "澄清与风险": ("澄清公告",),
        }
        for topic, source_types in event_topics.items():
            matches = [
                item for item in evidence if item["source_type"] in source_types
            ]
            if matches and not any(item["topic"] == topic for item in topics):
                topics.append(
                    {
                        "topic": topic,
                        "possible_catalyst": "、".join(
                            self._matched_labels(
                                " ".join(item["content"] for item in matches),
                                self.CATALYST_KEYWORDS,
                            )
                        )
                        or "近期公开事件",
                        "evidence": matches[:3],
                    }
                )
        updated_at = iso_now()
        result = {
            "symbol": symbol,
            "traditional_business": (profile or {}).get("main_business"),
            "topics": topics[:8],
            "message": None if topics else "暂无可靠公开证据",
            "warnings": warnings,
            "updated_at": updated_at,
            "source": {
                "name": "巨潮资讯 / 互动易 / 东方财富公开信息",
                "dataset": "近90天高相关公开事件",
                "updated_at": updated_at,
            },
        }
        self.cache.set(cache_key, result)
        return result

    def get_investor_qa(self, symbol: str) -> dict[str, Any]:
        cache_key = f"investor_qa_v6_{symbol}"
        cached = self.cache.get(cache_key, self.CACHE_TTL)
        if cached:
            return cached
        cutoff = date.today() - timedelta(days=365)
        items = []
        if symbol.startswith("6"):
            try:
                items.extend(self._get_sse_qa(symbol, cutoff))
            except Exception:
                pass
        else:
            try:
                frame = ak.stock_irm_cninfo(symbol)
            except (KeyError, ValueError):
                frame = pd.DataFrame()
            except Exception as exc:
                raise StockDataError(
                    "INVESTOR_QA_UNAVAILABLE",
                    f"获取 {symbol} 董秘回复失败：{exc}",
                    "AkShare stock_irm_cninfo / 巨潮互动易",
                ) from exc
            for _, row in frame.iterrows():
                answer = self._plain_text(row.get("回答内容"))
                if not answer:
                    continue
                published_at = str(row.get("更新时间", ""))[:10]
                if not published_at or published_at < cutoff.isoformat():
                    continue
                question = self._plain_text(row.get("问题"))
                question_id = self._plain_text(row.get("问题编号"))
                combined = f"{question} {answer}"
                items.append(
                    {
                        "question": question,
                        "answer": answer,
                        "published_at": published_at,
                        "keywords": self._matched_labels(combined, self.QA_KEYWORDS),
                        "url": (
                            "https://irm.cninfo.com.cn/ircs/question/"
                            f"questionDetail?questionId={question_id}"
                        ),
                        "source": "巨潮互动易",
                    }
                )
        items.sort(key=lambda item: item["published_at"], reverse=True)
        if not items:
            try:
                records = self.get_cninfo_announcements(
                    symbol,
                    cutoff,
                    date.today(),
                    page_size=30,
                    keyword="投资者关系活动记录",
                )
                for row in records[:20]:
                    items.append(
                        {
                            "question": f"投资者关系活动记录：{row['title']}",
                            "answer": "公司已公开披露投资者关系活动记录，具体交流内容请查看原文。",
                            "published_at": row["published_at"],
                            "keywords": self._matched_labels(
                                row["title"], self.QA_KEYWORDS
                            ),
                            "url": row["url"],
                            "source": "巨潮资讯投资者关系活动记录",
                        }
                    )
            except Exception:
                pass
        updated_at = iso_now()
        platform = (
            "上证e互动 / 投资者关系活动记录"
            if symbol.startswith("6")
            else "北交所问答 / 投资者关系活动记录"
            if symbol.startswith(("4", "8", "9"))
            else "巨潮互动易 / 投资者关系活动记录"
        )
        result = {
            "symbol": symbol,
            "items": items[:100],
            "message": None if items else "暂无近一年公开董秘回复/投资者问答",
            "updated_at": updated_at,
            "source": {
                "name": platform,
                "dataset": "公开问答与投资者关系活动记录",
                "updated_at": updated_at,
            },
        }
        self.cache.set(cache_key, result)
        return result

    def _get_sse_qa(self, symbol: str, cutoff: date) -> list[dict[str, Any]]:
        base_url = "https://sns.sseinfo.com/"
        company_response = self.session.post(
            f"{base_url}ajax/getCompany.do",
            data={"data": symbol},
            timeout=15,
        )
        company_response.raise_for_status()
        company_id = company_response.text.strip()
        if not company_id:
            return []
        response = self.session.post(
            f"{base_url}getNewDataFullText.do",
            data={
                "sdate": cutoff.isoformat(),
                "edate": date.today().isoformat(),
                "keyword": "",
                "type": "1",
                "page": "1",
                "comId": company_id,
            },
            timeout=20,
        )
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        items = []
        for block in soup.select(".m_feed_item"):
            question_node = block.select_one(".m_qa_detail .m_feed_txt")
            answer_node = block.select_one(".m_qa .m_feed_txt")
            if not question_node or not answer_node:
                continue
            dates = [
                self._plain_text(node.get_text(" ", strip=True))
                for node in block.select(".m_feed_from span")
            ]
            published_at = ""
            if dates:
                matched = re.search(r"\d{4}年\d{2}月\d{2}日", dates[-1])
                if matched:
                    published_at = matched.group(0).replace("年", "-").replace(
                        "月", "-"
                    ).replace("日", "")
            question = re.sub(
                rf"^[:：]?[^()（）]*[（(]{symbol}[)）]",
                "",
                self._plain_text(question_node.get_text(" ", strip=True)),
            )
            answer = self._plain_text(answer_node.get_text(" ", strip=True))
            if not question or not answer or published_at < cutoff.isoformat():
                continue
            combined = f"{question} {answer}"
            items.append(
                {
                    "question": question,
                    "answer": answer,
                    "published_at": published_at,
                    "keywords": self._matched_labels(combined, self.QA_KEYWORDS),
                    "url": "https://sns.sseinfo.com/qa.do",
                    "source": "上证e互动",
                }
            )
        return items

    def get_event_feed(self, symbol: str) -> dict[str, Any]:
        cache_key = f"event_feed_v12_{symbol}"
        cached = self.cache.get(cache_key, self.CACHE_TTL)
        if cached:
            return cached
        today = date.today()
        company_name = self._company_name(symbol)
        events: list[dict[str, Any]] = []
        warnings = []

        try:
            announcements = self.get_cninfo_announcements(
                symbol,
                today - timedelta(days=240),
                today,
                page_size=100,
            )
            investor_events = self.get_cninfo_announcements(
                symbol,
                today - timedelta(days=240),
                today,
                page_size=50,
                keyword="投资者关系",
            )
            announcements.extend(investor_events)
            for row in announcements:
                if "英文版" in row["title"]:
                    continue
                priority, event_type = self._classify_announcement(row["title"])
                if priority > 4:
                    continue
                events.append(
                    self._event(
                        title=row["title"],
                        published_at=row["published_at"],
                        source="巨潮资讯",
                        event_type=event_type,
                        content=row["title"],
                        url=row["url"],
                        priority=priority,
                        relevance_score=100,
                    )
                )
        except Exception as exc:
            warnings.append(f"公告：{exc}")

        try:
            qa = self.get_investor_qa(symbol)
            for item in qa["items"][:30]:
                events.append(
                    self._event(
                        title=f"董秘回复：{item['question'][:45]}",
                        published_at=item["published_at"],
                        source=item["source"],
                        event_type="董秘回复",
                        content=f"投资者问：{item['question']} 公司回复：{item['answer']}",
                        url=item["url"],
                        priority=5,
                        relevance_score=95,
                    )
                )
        except StockDataError as exc:
            warnings.append(f"董秘回复：{exc.message}")

        try:
            for row in self._stock_news(symbol):
                if row["published_at"] < (today - timedelta(days=120)).isoformat():
                    continue
                if any(
                    marker in row["title"]
                    for marker in (
                        "家公司获机构调研",
                        "家公司获海外机构调研",
                        "家公司获调研",
                        "调研股名单",
                        "附名单",
                        "财闻联播",
                        "资金流出榜",
                        "主力资金净流",
                        "特大单净流",
                        "两融余额",
                        "只个股",
                        "只股",
                        "家公司",
                        "分红实施",
                        "即将实施分红",
                        "公告集锦",
                        "涨停复盘",
                        "龙虎榜单",
                    )
                ):
                    continue
                relevance_score = self._news_relevance(
                    symbol,
                    company_name,
                    row["title"],
                    row["content"],
                )
                if relevance_score < 60:
                    continue
                priority, event_type = self._classify_announcement(
                    row["title"]
                )
                if priority > 6:
                    priority, event_type = 6, "新闻/行业催化"
                events.append(
                    self._event(
                        title=row["title"],
                        published_at=row["published_at"],
                        source=row["media"] or "财经媒体",
                        event_type=event_type,
                        content=row["content"] or row["title"],
                        url=row["url"],
                        priority=priority,
                        relevance_score=relevance_score,
                    )
                )
        except Exception as exc:
            warnings.append(f"新闻：{exc}")

        try:
            for row in self._research_reports(
                symbol,
                today - timedelta(days=240),
                today,
            ):
                events.append(
                    self._event(
                        title=row["title"],
                        published_at=row["published_at"],
                        source="东方财富研报",
                        event_type="研报摘要",
                        content=row["title"],
                        url=row["url"],
                        priority=7,
                        relevance_score=75,
                    )
                )
        except Exception as exc:
            warnings.append(f"研报：{exc}")

        events = self._deduplicate_events(events)
        events.sort(
            key=lambda item: (
                item["priority"],
                -item["relevance_score"],
                -int(item["published_at"].replace("-", "") or "0"),
            )
        )
        updated_at = iso_now()
        result = {
            "symbol": symbol,
            "events": events[:18],
            "message": None if events else "暂无可靠公开数据",
            "warnings": warnings,
            "updated_at": updated_at,
            "source": {
                "name": "巨潮资讯 / 互动易 / 东方财富公开信息",
                "dataset": "事件驱动聚合",
                "updated_at": updated_at,
            },
        }
        self.cache.set(cache_key, result)
        return result

    def _event(
        self,
        title: str,
        published_at: str,
        source: str,
        event_type: str,
        content: str,
        url: str,
        priority: int,
        relevance_score: int,
    ) -> dict[str, Any]:
        clean_content = self._plain_text(content)
        summary = self._event_summary(title, clean_content, event_type)
        text = f"{title} {clean_content}"
        return {
            "title": title,
            "published_at": published_at,
            "source": source,
            "event_type": event_type,
            "summary": summary,
            "impact": self._impact_direction(text),
            "businesses": self._matched_labels(text, self.THEME_KEYWORDS),
            "url": url,
            "priority": priority,
            "relevance_score": relevance_score,
            "relevance_level": (
                "高相关" if relevance_score >= 80 else "中相关"
            ),
        }

    def _company_name(self, symbol: str) -> str:
        cached = self.cache.get("stock_universe", 30 * 24 * 60 * 60) or {}
        for stock in cached.get("stocks", []):
            if stock.get("symbol") == symbol:
                return self._plain_text(stock.get("name"))
        return ""

    @staticmethod
    def _news_relevance(
        symbol: str,
        company_name: str,
        title: str,
        content: str,
    ) -> int:
        generic = (
            r"\d+\s*(?:只|家|股).*(?:分红|减持|公告|调研|涨停|融资|资金)"
            r"|多只|多股|多家|名单|一览|汇总|盘后公告集锦|板块上涨|板块下跌"
        )
        if re.search(generic, title):
            return 20
        title_mentions = title.count(symbol)
        content_mentions = content.count(symbol)
        if company_name:
            title_mentions += title.count(company_name)
            content_mentions += content.count(company_name)
        strong_keywords = (
            "业绩预告", "业绩快报", "中标", "合同", "订单", "调研",
            "电话会议", "投资者关系", "澄清", "风险提示", "董秘",
        )
        if title_mentions > 0:
            return 90 if any(word in title for word in strong_keywords) else 82
        if content_mentions >= 4 and any(
            word in title + content for word in strong_keywords
        ):
            return 65
        if content_mentions >= 4:
            return 60
        return 30

    @staticmethod
    def _event_summary(title: str, content: str, event_type: str) -> str:
        if content and content != title and len(content) >= 40:
            return content[:200]
        return (
            f"公司近期公开披露“{title}”，事件类型为{event_type}。"
            "该卡片仅依据公开标题归类，具体业务影响、金额及执行进度需以原文为准，"
            "不把标题信息扩展为未经证实的经营结论。"
        )[:200]

    def _classify_announcement(self, title: str) -> tuple[int, str]:
        for priority, label, keywords in self.EVENT_RULES:
            if any(keyword in title for keyword in keywords):
                return priority, label
        return 9, "公告"

    @staticmethod
    def _impact_direction(text: str) -> str:
        if "澄清" in text or "传闻" in text or "辟谣" in text:
            return "不确定"
        negative = ("下修", "亏损", "下降", "减持", "终止", "风险", "处罚", "诉讼", "澄清")
        positive = ("预增", "增长", "中标", "签订", "回购", "增持", "突破", "投产")
        if any(keyword in text for keyword in negative):
            return "利空" if "澄清" not in text else "不确定"
        if any(keyword in text for keyword in positive):
            return "利好"
        return "中性" if len(text) > 0 else "不确定"

    @staticmethod
    def _deduplicate_events(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
        result = []
        seen = set()
        for item in items:
            key = (item["title"], item["published_at"], item["event_type"])
            if key not in seen and item["url"]:
                seen.add(key)
                result.append(item)
        return result

    def _research_reports(
        self,
        symbol: str,
        start: date,
        end: date,
    ) -> list[dict[str, str]]:
        response = self.session.get(
            "https://reportapi.eastmoney.com/report/list",
            params={
                "industryCode": "*",
                "pageSize": "50",
                "industry": "*",
                "rating": "*",
                "ratingChange": "*",
                "beginTime": start.isoformat(),
                "endTime": end.isoformat(),
                "pageNo": "1",
                "qType": "0",
                "code": symbol,
            },
            timeout=15,
        )
        response.raise_for_status()
        rows = response.json().get("data") or []
        return [
            {
                "title": self._plain_text(row.get("title")),
                "published_at": self._plain_text(row.get("publishDate"))[:10],
                "url": (
                    f"https://pdf.dfcfw.com/pdf/H3_{row.get('infoCode')}_1.pdf"
                    if row.get("infoCode")
                    else ""
                ),
            }
            for row in rows
        ]

    def _stock_news(self, symbol: str) -> list[dict[str, str]]:
        callback = "jQuery3510875346244069884_1668256937995"
        query = {
            "uid": "",
            "keyword": symbol,
            "type": ["cmsArticleWebOld"],
            "client": "web",
            "clientType": "web",
            "clientVersion": "curr",
            "param": {
                "cmsArticleWebOld": {
                    "searchScope": "default",
                    "sort": "default",
                    "pageIndex": 1,
                    "pageSize": 100,
                    "preTag": "<em>",
                    "postTag": "</em>",
                }
            },
        }
        response = self.session.get(
            "https://search-api-web.eastmoney.com/search/jsonp",
            params={"cb": callback, "param": json.dumps(query, ensure_ascii=False)},
            timeout=15,
        )
        response.raise_for_status()
        match = re.search(r"^[^(]+\((.*)\)\s*;?$", response.text, re.S)
        if not match:
            raise ValueError("新闻接口返回格式异常")
        rows = (
            json.loads(match.group(1))
            .get("result", {})
            .get("cmsArticleWebOld", [])
        )
        return [
            {
                "title": re.sub(r"<[^>]+>", "", self._plain_text(row.get("title"))),
                "content": re.sub(
                    r"<[^>]+>",
                    "",
                    self._plain_text(row.get("content")),
                ),
                "published_at": self._plain_text(row.get("date"))[:10],
                "media": self._plain_text(row.get("mediaName")),
                "url": self._plain_text(row.get("url")),
            }
            for row in rows
        ]

    def _lhb_records(
        self,
        symbol: str,
        start: date,
        end: date,
    ) -> list[dict[str, Any]]:
        response = self.session.get(
            "https://datacenter-web.eastmoney.com/api/data/v1/get",
            params={
                "sortColumns": "TRADE_DATE",
                "sortTypes": "-1",
                "pageSize": "50",
                "pageNumber": "1",
                "reportName": "RPT_DAILYBILLBOARD_DETAILSNEW",
                "columns": (
                    "SECURITY_CODE,TRADE_DATE,EXPLAIN,EXPLANATION,"
                    "BILLBOARD_NET_AMT,CHANGE_RATE"
                ),
                "source": "WEB",
                "client": "WEB",
                "filter": (
                    f"(SECURITY_CODE=\"{symbol}\")"
                    f"(TRADE_DATE<='{end.isoformat()}')"
                    f"(TRADE_DATE>='{start.isoformat()}')"
                ),
            },
            timeout=15,
        )
        response.raise_for_status()
        rows = ((response.json().get("result") or {}).get("data") or [])
        return [
            {
                "published_at": self._plain_text(row.get("TRADE_DATE"))[:10],
                "reason": self._plain_text(row.get("EXPLANATION")),
                "interpretation": self._plain_text(row.get("EXPLAIN")),
                "net_amount": clean_number(row.get("BILLBOARD_NET_AMT")),
            }
            for row in rows
        ]

    @staticmethod
    def _evidence(
        content: str,
        source_type: str,
        published_at: str,
        url: str,
        title: str,
    ) -> dict[str, Any]:
        return {
            "title": title or source_type,
            "content": content or title,
            "source_type": source_type,
            "published_at": published_at,
            "url": url,
        }

    @staticmethod
    def _deduplicate(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
        result = []
        seen = set()
        for item in sorted(items, key=lambda value: value["published_at"], reverse=True):
            key = (item["title"], item["published_at"], item["source_type"])
            if key not in seen:
                seen.add(key)
                result.append(item)
        return result

    @staticmethod
    def _matched_labels(text: str, mapping: dict[str, tuple[str, ...]]) -> list[str]:
        lowered = text.lower()
        return [
            label
            for label, keywords in mapping.items()
            if any(keyword.lower() in lowered for keyword in keywords)
        ]

    @staticmethod
    def _limit_status(symbol: str, change: float | None) -> str:
        if change is None:
            return "暂无数据"
        threshold = 19.5 if symbol.startswith(("3", "68")) else 9.5
        if change >= threshold:
            return "可能涨停（按涨幅推断，未校验当日价格笼子）"
        if change <= -threshold:
            return "可能跌停（按跌幅推断，未校验当日价格笼子）"
        return "未达到常规涨跌停幅度"


research_service = ResearchService()
