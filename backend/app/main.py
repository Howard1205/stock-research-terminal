from __future__ import annotations

from typing import Optional

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.services.stock_service import StockDataError, stock_service
from app.services.financial_service import financial_service
from app.services.company_service import company_service
from app.services.research_service import research_service
from app.services.market_news_service import market_news_service


class ReportSummaryRequest(BaseModel):
    symbol: str
    report_id: str
    title: str
    published_at: str
    pdf_url: Optional[str] = None
    url: str


app = FastAPI(
    title="个人版股票 F10 研究终端 API",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "https://stock-research-web.onrender.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def error_response(error: StockDataError) -> dict:
    return {
        "status": "error",
        "data": None,
        "error": {
            "code": error.code,
            "message": error.message,
            "source": error.source,
        },
    }


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/search-stocks")
def search_stocks(
    q: str = Query(default="", max_length=50),
    limit: int = Query(default=20, ge=1, le=50),
) -> dict:
    try:
        return {
            "status": "ok",
            "data": stock_service.search(q=q, limit=limit),
            "source": {
                "name": "AkShare",
                "dataset": "stock_info_a_code_name",
                "updated_at": stock_service.stock_universe_updated_at,
            },
        }
    except StockDataError as error:
        return error_response(error)


@app.get("/api/stock-detail")
def stock_detail(symbol: str = Query(min_length=6, max_length=6)) -> dict:
    try:
        return {
            "status": "ok",
            "data": stock_service.get_stock_detail(symbol),
        }
    except StockDataError as error:
        return error_response(error)


@app.get("/api/kline")
def stock_kline(
    symbol: str = Query(min_length=6, max_length=6),
    period: str = Query(default="daily"),
    range: str = Query(default="1y"),
) -> dict:
    try:
        return {
            "status": "ok",
            "data": stock_service.get_kline(symbol, period=period, range_key=range),
        }
    except StockDataError as error:
        return error_response(error)


@app.get("/api/fund-flow")
def stock_fund_flow(symbol: str = Query(min_length=6, max_length=6)) -> dict:
    try:
        return {
            "status": "ok",
            "data": stock_service.get_fund_flow(symbol),
        }
    except StockDataError as error:
        return error_response(error)


@app.get("/api/financial-performance")
def financial_performance(
    symbol: str = Query(min_length=6, max_length=6),
    mode: str = Query(default="annual"),
) -> dict:
    try:
        return {
            "status": "ok",
            "data": financial_service.get_financials(symbol, mode=mode),
        }
    except StockDataError as error:
        return error_response(error)


@app.get("/api/company-profile")
def company_profile(symbol: str = Query(min_length=6, max_length=6)) -> dict:
    try:
        return {"status": "ok", "data": company_service.get_profile(symbol)}
    except StockDataError as error:
        return error_response(error)


@app.get("/api/company-reports")
def company_reports(symbol: str = Query(min_length=6, max_length=6)) -> dict:
    try:
        return {"status": "ok", "data": company_service.get_reports(symbol)}
    except StockDataError as error:
        return error_response(error)


@app.get("/api/intraday")
def intraday(
    symbol: str = Query(min_length=6, max_length=6),
    date: str = Query(min_length=10, max_length=10),
) -> dict:
    try:
        kline = stock_service.get_kline(symbol, period="daily", range_key="1y")
        daily_bar = next(
            (bar for bar in kline["bars"] if bar["time"] == date),
            None,
        )
        return {
            "status": "ok",
            "data": company_service.get_intraday(symbol, date, daily_bar),
        }
    except StockDataError as error:
        return error_response(error)


@app.post("/api/report-summary")
def report_summary(request: ReportSummaryRequest) -> dict:
    try:
        return {
            "status": "ok",
            "data": research_service.summarize_report(
                request.symbol,
                request.report_id,
                request.title,
                request.published_at,
                request.pdf_url,
                request.url,
            ),
        }
    except StockDataError as error:
        return error_response(error)


@app.get("/api/move-analysis")
def move_analysis(
    symbol: str = Query(min_length=6, max_length=6),
    date: str = Query(min_length=10, max_length=10),
) -> dict:
    try:
        kline = stock_service.get_kline(symbol, period="daily", range_key="10y")
        daily_bar = next((bar for bar in kline["bars"] if bar["time"] == date), None)
        return {
            "status": "ok",
            "data": research_service.analyze_move(symbol, date, daily_bar),
        }
    except (StockDataError, ValueError) as error:
        if isinstance(error, StockDataError):
            return error_response(error)
        return error_response(
            StockDataError("INVALID_DATE", f"日期参数无效：{error}")
        )


@app.get("/api/market-focus")
def market_focus(symbol: str = Query(min_length=6, max_length=6)) -> dict:
    try:
        try:
            profile = company_service.get_profile(symbol)
        except StockDataError:
            profile = None
        try:
            quote = stock_service.get_stock_detail(symbol)
        except StockDataError:
            quote = None
        return {
            "status": "ok",
            "data": research_service.get_market_focus(symbol, profile, quote),
        }
    except StockDataError as error:
        return error_response(error)


@app.get("/api/event-feed")
def event_feed(symbol: str = Query(min_length=6, max_length=6)) -> dict:
    try:
        return {"status": "ok", "data": research_service.get_event_feed(symbol)}
    except StockDataError as error:
        return error_response(error)


@app.get("/api/investor-qa")
def investor_qa(symbol: str = Query(min_length=6, max_length=6)) -> dict:
    try:
        return {"status": "ok", "data": research_service.get_investor_qa(symbol)}
    except StockDataError as error:
        return error_response(error)


@app.get("/api/market-news")
def market_news(refresh: bool = Query(default=False)) -> dict:
    try:
        return {
            "status": "ok",
            "data": market_news_service.get_news(force_refresh=refresh),
        }
    except StockDataError as error:
        return error_response(error)
