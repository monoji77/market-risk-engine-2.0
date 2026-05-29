import json
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException, Query


router = APIRouter(prefix="/api/market", tags=["Market"])

BACKEND_DIR = Path(__file__).resolve().parents[2]
MARKET_VISUALIZATION_CANDIDATES = [
    BACKEND_DIR / "artifacts" / "market_visualizations.json.tmp",
    BACKEND_DIR / "artifacts" / "market_visualizations.json",
]
OTHER_RISK_MEASURES_PATH = BACKEND_DIR / "artifacts" / "other_risk_measures.json"


def resolve_market_visualizations_path():
    for path in MARKET_VISUALIZATION_CANDIDATES:
        if path.exists():
            return path

    return None


@router.get("/visualizations")
def get_market_visualizations():
    market_visualizations_path = resolve_market_visualizations_path()

    if market_visualizations_path is None:
        raise HTTPException(
            status_code=404,
            detail="market_visualizations.json not found. Run the backend artifact script first.",
        )

    with market_visualizations_path.open("r", encoding="utf-8") as file:
        return json.load(file)


@router.get("/series")
def get_market_series(
    ticker: str = Query("AAPL"),
    metric: Literal["close", "returns", "log_returns"] = Query("close"),
):
    market_visualizations_path = resolve_market_visualizations_path()

    if market_visualizations_path is None:
        raise HTTPException(
            status_code=404,
            detail="market_visualizations.json not found.",
        )

    with market_visualizations_path.open("r", encoding="utf-8") as file:
        payload = json.load(file)

    if ticker not in payload["tickers"]:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid ticker: {ticker}. Valid tickers: {payload['tickers']}",
        )

    filtered_data = [
        row
        for row in payload["data"]
        if row["ticker"] == ticker and row["metric"] == metric
    ]

    return {
        "ticker": ticker,
        "metric": metric,
        "start_date": payload["start_date"],
        "end_date": payload["end_date"],
        "data": filtered_data,
    }


@router.get("/advanced-metrics")
def get_advanced_market_metrics():
    if not OTHER_RISK_MEASURES_PATH.exists():
        raise HTTPException(
            status_code=404,
            detail="other_risk_measures.json not found. Run the backend risk measures script first.",
        )

    with OTHER_RISK_MEASURES_PATH.open("r", encoding="utf-8") as file:
        return json.load(file)
