############################
#
# [1] IMPORT LIBRARY
#
############################

import json

import numpy as np
import pandas as pd

from utils.utils import PARENT_DIR, DATA_PATH, TICKERS


############################
#
# [2] GLOBAL VARIABLES
#
############################

ARTIFACTS_PATH = PARENT_DIR / "artifacts"
ARTIFACTS_PATH.mkdir(parents=True, exist_ok=True)

MARKET_PATH = ARTIFACTS_PATH / "market_visualizations.json"

CLOSE = "Close"
DATE = "Date"


############################
#
# [3] HELPER FUNCTIONS
#
############################

def get_all_close_prices() -> pd.DataFrame:
    """
    Load close prices for all tickers and return a wide DataFrame.

    Output shape:
    Date        AAPL     MSFT     GOOGL    AMZN     TSLA     SPY
    2001-01-02  0.22     ...      ...      ...      ...      ...
    """

    def load_close_prices(ticker: str) -> pd.Series:
        file_path = DATA_PATH / f"{ticker}.csv"

        ticker_data = pd.read_csv(
            file_path,
            index_col=0,
            parse_dates=True
        )

        close = ticker_data[CLOSE].copy()
        close.name = ticker
        close.index.name = DATE

        return close

    combined_data = [load_close_prices(ticker) for ticker in TICKERS]

    close_prices = (
        pd.concat(combined_data, axis=1)
        .sort_index()
    )

    close_prices.index.name = DATE

    return close_prices


def convert_to_long_records(df: pd.DataFrame, metric: str) -> list[dict]:
    """
    Convert wide DataFrame into frontend-friendly long records.

    Output record:
    {
        "date": "2001-01-02",
        "ticker": "AAPL",
        "metric": "close",
        "value": 0.2226
    }
    """

    long_df = (
        df.reset_index()
        .melt(
            id_vars=DATE,
            var_name="ticker",
            value_name="value"
        )
        .dropna(subset=["value"])
    )

    long_df["date"] = long_df[DATE].dt.strftime("%Y-%m-%d")
    long_df["metric"] = metric

    return long_df[["date", "ticker", "metric", "value"]].to_dict(
        orient="records"
    )


def convert_to_frontend_json(close_prices: pd.DataFrame) -> None:
    close_returns = close_prices.pct_change()
    close_log_returns = np.log(close_prices / close_prices.shift(1))

    output = {
        "tickers": TICKERS,
        "metrics": ["close", "returns", "log_returns"],
        "start_date": close_prices.index.min().strftime("%Y-%m-%d"),
        "end_date": close_prices.index.max().strftime("%Y-%m-%d"),
        "data": (
            convert_to_long_records(close_prices, "close")
            + convert_to_long_records(close_returns, "returns")
            + convert_to_long_records(close_log_returns, "log_returns")
        ),
    }

    with MARKET_PATH.open("w", encoding="utf-8") as file:
        json.dump(output, file, indent=2)

    print(f"Saved market visualizations to: {MARKET_PATH}")
    print(f"Start date: {output['start_date']}")
    print(f"End date: {output['end_date']}")
    print(f"Number of records: {len(output['data'])}")


############################
#
# [4] MAIN FUNCTION
#
############################

def main() -> None:
    close_prices = get_all_close_prices()
    convert_to_frontend_json(close_prices)


############################
#
# [5] RUN MAIN FUNCTION
#
############################

if __name__ == "__main__":
    main()