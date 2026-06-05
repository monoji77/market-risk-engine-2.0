############################
#
# [1] IMPORT LIBRARY
#
############################
import numpy as np
import pandas as pd
from tqdm.auto import tqdm

from backend.utils.storage import (
    get_storage_mode_label,
    write_market_catalog_payload,
    write_market_ticker_payload,
)
from backend.utils.utils import (
    CLOSE,
    LOG_RETURNS,
    RETURNS,
    SP500_DF,
    SP500_TICKERS,
    convert_series_to_point_records,
    get_all_close_prices,
    get_available_tickers,
    ticker_to_filename,
)


############################
#
# [2] GLOBAL VARIABLES
#
############################


DEFAULT_TICKER = "AAPL"
DRAWDOWN = "drawdown"

############################
#
# [3] HELPER FUNCTIONS
#
############################

def get_market_catalog_entries(available_tickers: list[str]) -> list[dict]:
    metadata_map: dict[str, dict] = {}

    if "yf_symbol" in SP500_DF.columns:
        for _, row in SP500_DF.iterrows():
            ticker = str(row.get("yf_symbol", "")).strip()

            if not ticker:
                continue

            security = row.get("Security")
            sector = row.get("GICS Sector")

            metadata_map[ticker] = {
                "ticker": ticker,
                "security": None if pd.isna(security) else str(security),
                "name": None if pd.isna(security) else str(security),
                "sector": None if pd.isna(sector) else str(sector),
            }

    metadata_map["^GSPC"] = {
        "ticker": "^GSPC",
        "security": "S&P 500 Index",
        "name": "S&P 500 Index",
        "sector": "Index",
    }

    entries = []

    for ticker in available_tickers:
        entries.append(
            metadata_map.get(
                ticker,
                {
                    "ticker": ticker,
                    "security": None,
                    "name": None,
                    "sector": None,
                },
            )
        )

    return entries


def build_market_catalog(available_tickers: list[str]) -> dict:
    default_ticker = (
        DEFAULT_TICKER if DEFAULT_TICKER in available_tickers else available_tickers[0]
    )

    return {
        "default_ticker": default_ticker,
        "metrics": [CLOSE, RETURNS, LOG_RETURNS],
        "tickers": get_market_catalog_entries(available_tickers),
    }


def build_ticker_market_payload(ticker: str, close_prices: pd.DataFrame) -> dict:
    close_series = close_prices[ticker].dropna()
    returns_series = close_series.pct_change()
    log_returns_series = np.log(close_series / close_series.shift(1))
    drawdown_series = close_series - close_series.cummax()

    return {
        "ticker": ticker,
        "metrics": [CLOSE, RETURNS, LOG_RETURNS],
        "start_date": close_series.index.min().strftime("%Y-%m-%d"),
        "end_date": close_series.index.max().strftime("%Y-%m-%d"),
        "series": {
            CLOSE: convert_series_to_point_records(close_series),
            RETURNS: convert_series_to_point_records(returns_series),
            LOG_RETURNS: convert_series_to_point_records(log_returns_series),
        },
        "drawdown_series": convert_series_to_point_records(drawdown_series),
    }


def write_market_ticker_payloads(
    close_prices: pd.DataFrame,
    available_tickers: list[str],
) -> None:
    for ticker in tqdm(
        available_tickers,
        desc="Writing market ticker files",
        unit="ticker",
    ):
        payload = build_ticker_market_payload(ticker, close_prices)
        ticker_filename = ticker_to_filename(ticker)

        write_market_ticker_payload(ticker_filename, payload)


def build_and_write_market_visualizations(
    close_prices: pd.DataFrame,
    available_tickers: list[str],
) -> None:
    market_catalog = build_market_catalog(available_tickers)
    write_market_catalog_payload(market_catalog)
    write_market_ticker_payloads(close_prices, available_tickers)


############################
#
# [4] MAIN FUNCTION
#
############################


def main() -> None:
    available_ticker_set = set(get_available_tickers())
    available_tickers = [
        ticker
        for ticker in SP500_TICKERS
        if ticker in available_ticker_set
    ]

    with tqdm(total=3, desc="02_build_market_visualizations", unit="step") as progress:
        progress.set_postfix_str("loading close prices")
        close_prices = get_all_close_prices(available_tickers)
        progress.update()

        progress.set_postfix_str("writing market catalog")
        market_catalog = build_market_catalog(available_tickers)
        write_market_catalog_payload(market_catalog)
        progress.update()

        progress.set_postfix_str("writing per-ticker market payloads")
        write_market_ticker_payloads(close_prices, available_tickers)
        progress.update()

    print(f"Saved market catalog and ticker payloads to storage mode: {get_storage_mode_label()}")
    print(f"Number of tickers: {len(available_tickers)}")


############################
#
# [5] RUN MAIN FUNCTION
#
############################


if __name__ == "__main__":
    main()
