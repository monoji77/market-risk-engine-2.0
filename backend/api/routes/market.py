from urllib.parse import quote

from azure.core.exceptions import ResourceNotFoundError
from fastapi import APIRouter, HTTPException

try:
    from utils.storage import (
        get_storage_mode_label,
        read_advanced_metric_payload_if_exists,
        read_market_catalog_payload,
        read_market_ticker_payload,
    )
except ModuleNotFoundError:
    from backend.utils.storage import (
        get_storage_mode_label,
        read_advanced_metric_payload_if_exists,
        read_market_catalog_payload,
        read_market_ticker_payload,
    )


router = APIRouter(prefix="/api/market", tags=["Market"])


def ticker_to_filename(ticker: str) -> str:
    return f"{quote(ticker, safe='')}.json"


@router.get("/catalog")
def get_market_catalog():
    try:
        return read_market_catalog_payload()
    except (FileNotFoundError, ResourceNotFoundError) as error:
        raise HTTPException(
            status_code=404,
            detail="market_catalog.json not found. Run the backend artifact script first.",
        ) from error


@router.get("/tickers/{ticker}")
def get_market_ticker_dataset(ticker: str):
    ticker_filename = ticker_to_filename(ticker)

    try:
        return read_market_ticker_payload(ticker_filename)
    except (FileNotFoundError, ResourceNotFoundError) as error:
        raise HTTPException(
            status_code=404,
            detail=f"Ticker payload not found for {ticker}.",
        ) from error


@router.get("/advanced-metrics/{ticker}")
def get_advanced_market_ticker_dataset(ticker: str):
    ticker_filename = ticker_to_filename(ticker)

    try:
        payload = read_advanced_metric_payload_if_exists(ticker_filename)
    except ResourceNotFoundError as error:
        raise HTTPException(
            status_code=404,
            detail=f"Advanced metrics payload not found for {ticker}.",
        ) from error

    if payload is None:
        raise HTTPException(
            status_code=404,
            detail=f"Advanced metrics payload not found for {ticker}.",
        )

    return payload


@router.get("/storage-mode")
def get_market_storage_mode():
    return {"mode": get_storage_mode_label()}
