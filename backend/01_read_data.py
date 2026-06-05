############################
#
# [1] IMPORT LIBRARY
#
############################
import pandas as pd
import yfinance as yf
from tqdm.auto import tqdm

from backend.utils.storage import get_storage_mode_label, write_raw_price_csv
from backend.utils.utils import SP500_TICKERS

RAW_PRICE = "raw_price"
START_DATE = "2001-01-01"
############################
#
# [2] MAIN FUNCTION
#
############################


def download_price_history(tickers: list[str] | None = None) -> pd.DataFrame:
    selected_tickers = tickers or SP500_TICKERS
    end_date = (
        pd.Timestamp.now(tz="Asia/Singapore") + pd.Timedelta(days=1)
    ).strftime("%Y-%m-%d")

    return yf.download(
        selected_tickers,
        start=START_DATE,
        end=end_date,
        progress=False,
    )


def get_ticker_price_data(rich_data: pd.DataFrame, ticker: str) -> pd.DataFrame:
    ticker_data = rich_data.xs(ticker, axis=1, level=1)

    return ticker_data.dropna()


def write_raw_price_csvs(
    rich_data: pd.DataFrame,
    tickers: list[str] | None = None,
) -> list[str]:
    selected_tickers = tickers or SP500_TICKERS
    available_tickers: list[str] = []

    for ticker in tqdm(selected_tickers, desc="Saving ticker CSVs", unit="ticker"):
        ticker_data = get_ticker_price_data(rich_data, ticker)

        if not ticker_data.empty:
            available_tickers.append(ticker)

        write_raw_price_csv(ticker, ticker_data)

    return available_tickers


def build_close_prices_from_download(
    rich_data: pd.DataFrame,
    tickers: list[str] | None = None,
) -> pd.DataFrame:
    selected_tickers = tickers or SP500_TICKERS
    close_series_by_ticker: list[pd.Series] = []

    for ticker in selected_tickers:
        ticker_data = get_ticker_price_data(rich_data, ticker)

        if ticker_data.empty:
            continue

        close_series = ticker_data["Close"].copy()
        close_series.name = ticker
        close_series_by_ticker.append(close_series)

    if not close_series_by_ticker:
        return pd.DataFrame()

    close_prices = pd.concat(close_series_by_ticker, axis=1).sort_index()
    close_prices.index.name = "Date"

    return close_prices

def main() -> None:
    """
    Main function to download historical stock data for specified tickers and save them as CSV files.
    """
    with tqdm(total=2, desc="01_read_data", unit="stage") as progress:
        progress.set_postfix_str("downloading price history")
        rich_data = download_price_history(SP500_TICKERS)
        progress.update()

        progress.set_postfix_str("saving ticker csv files")
        write_raw_price_csvs(rich_data, SP500_TICKERS)
        progress.update()

    print(f"All tickers saved to storage mode: {get_storage_mode_label()} ({RAW_PRICE})")
############################
#
# [3] RUN MAIN FUNCTION
#
############################
if __name__ == "__main__":
    main()
