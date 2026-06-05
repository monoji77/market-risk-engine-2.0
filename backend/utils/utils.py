#####################
#
# [0] IMPORT LIBRARIES
#
#####################
from io import StringIO
from urllib.parse import quote

import pandas as pd
import requests

try:
    from backend.utils.storage import (
        list_available_tickers_from_storage,
        read_raw_price_csv,
        read_sp500_constituents_cache,
        write_sp500_constituents_cache,
    )
except ModuleNotFoundError:
    from utils.storage import (
        list_available_tickers_from_storage,
        read_raw_price_csv,
        read_sp500_constituents_cache,
        write_sp500_constituents_cache,
    )

#####################
#
# [1] GLOBAL VARIABLES
#
#####################
TICKER = "ticker"
VALUE = "value"
METRIC = "metric"
CLOSE = "close"
RETURNS = "returns"
LOG_RETURNS = "log_returns"
DATE = "Date"
CLOSE_PRICE_COLUMN = "Close"
#####################
#
# [2] SHARED FUNCTIONS
#
#####################
def normalize_sp500_constituents(sp500_df: pd.DataFrame) -> pd.DataFrame:
    normalized_df = sp500_df.copy()

    if "Symbol" in normalized_df.columns and "yf_symbol" not in normalized_df.columns:
        normalized_df["yf_symbol"] = normalized_df["Symbol"].str.replace(
            ".",
            "-",
            regex=False,
        )

    return normalized_df


def load_cached_sp500_constituents() -> pd.DataFrame | None:
    cached_df = read_sp500_constituents_cache()

    if cached_df is None:
        return None

    return normalize_sp500_constituents(cached_df)


def get_sp500_constituents():
    url = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"

    headers = {
        "User-Agent": (
            "MarketRiskEngine/2.0 "
            "(https://github.com/Monoji77/market-risk-engine-2.0; contact: your-email@example.com)"
        )
    }

    try:
        response = requests.get(url, headers=headers, timeout=20)
        response.raise_for_status()

        sp500_df = normalize_sp500_constituents(pd.read_html(
            StringIO(response.text),
            attrs={"id": "constituents"}
        )[0])

        write_sp500_constituents_cache(sp500_df)

        return sp500_df
    except (requests.RequestException, ValueError):
        cached_df = load_cached_sp500_constituents()

        if cached_df is not None:
            return cached_df

        local_tickers = list_available_tickers_from_storage()

        if not local_tickers:
            raise

        return pd.DataFrame({"yf_symbol": local_tickers})
    
def get_all_close_prices(tickers: list[str] | None = None) -> pd.DataFrame:
    """
    Load close prices for all tickers and return a wide DataFrame.

    Output shape:
    Date        AAPL     MSFT     GOOGL    AMZN     TSLA     SPY
    2001-01-02  0.22     ...      ...      ...      ...      ...
    """

    def load_close_prices(ticker: str) -> pd.Series:
        ticker_data = read_raw_price_csv(ticker)

        close = ticker_data[CLOSE_PRICE_COLUMN].copy()
        close.name = ticker
        close.index.name = DATE

        return close

    selected_tickers = tickers or SP500_TICKERS
    combined_data = [load_close_prices(ticker) for ticker in selected_tickers]

    close_prices = (
        pd.concat(combined_data, axis=1)
        .sort_index()
    )

    close_prices.index.name = DATE

    return close_prices

def get_all_returns(close_prices: pd.DataFrame) -> pd.DataFrame:
    """
    Load close prices for all tickers, calculate returns, and return a wide DataFrame.

    Output shape:
    Date        AAPL     MSFT     GOOGL    AMZN     TSLA     SPY
    2001-01-02  0.0023   ...      ...      ...      ...      ...
    """

    return close_prices.pct_change()

def convert_to_long_records(df: pd.DataFrame, metric: str) -> pd.DataFrame:
    """
    Convert wide DataFrame into long records.
    """

    long_df = (
        df.copy()
        .rename_axis(index=DATE, columns=TICKER)
        .stack()
        .rename(VALUE)
        .reset_index()
    )

    numeric_values = pd.to_numeric(long_df[VALUE], errors="coerce")
    finite_mask = numeric_values.notna() & ~numeric_values.isin([float("inf"), float("-inf")])
    long_df = long_df.loc[finite_mask].copy()
    long_df[VALUE] = numeric_values.loc[finite_mask]

    long_df[DATE] = long_df[DATE].dt.strftime("%Y-%m-%d")
    long_df[METRIC] = metric

    return long_df[[DATE, TICKER, METRIC, VALUE]]


def convert_series_to_point_records(series: pd.Series) -> list[dict[str, str | float]]:
    numeric_values = pd.to_numeric(series, errors="coerce")
    finite_mask = numeric_values.notna() & ~numeric_values.isin(
        [float("inf"), float("-inf")]
    )
    filtered_series = numeric_values.loc[finite_mask]

    return [
        {
            "date": index.strftime("%Y-%m-%d"),
            "value": float(value),
        }
        for index, value in filtered_series.items()
    ]


def get_available_tickers() -> list[str]:
    return list_available_tickers_from_storage()


def ticker_to_filename(ticker: str) -> str:
    return f"{quote(ticker, safe='')}.json"


#####################
#
# [1] SHARED VARIABLES
#
#####################
_cached_sp500_df = load_cached_sp500_constituents()
SP500_DF = _cached_sp500_df if _cached_sp500_df is not None else get_sp500_constituents()
SP500_TICKERS = SP500_DF["yf_symbol"].tolist()
if "^GSPC" not in SP500_TICKERS:
    SP500_TICKERS.append("^GSPC")
