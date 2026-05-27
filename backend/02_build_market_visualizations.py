############################
#
# [1] IMPORT LIBRARY
#
############################

import json

import numpy as np
import pandas as pd

from utils.utils import (
    ARTIFACTS_PATH,
    FRONTEND_PUBLIC_PATH,
    LOG_RETURNS,
    RETURNS,
    TICKERS,
    convert_to_long_records,
    get_all_close_prices,
)


############################
#
# [2] GLOBAL VARIABLES
#
############################


RECORDS = "records"
MARKET_PATH = ARTIFACTS_PATH / "market_visualizations.json"
FRONTEND_MARKET_PATH = FRONTEND_PUBLIC_PATH / "market_visualizations.json"
CLOSE = "close"
DRAWDOWN = "drawdown"


############################
#
# [3] HELPER FUNCTIONS
#
############################


def build_frontend_records(df: pd.DataFrame, metric: str) -> pd.DataFrame:
    return convert_to_long_records(df, metric).rename(columns={"Date": "date"})


def write_json_output(output: dict, output_path) -> None:
    with output_path.open("w", encoding="utf-8") as file:
        json.dump(output, file, indent=2)


def convert_to_frontend_json(close_prices: pd.DataFrame) -> None:
    close_returns = close_prices.pct_change()
    close_log_returns = np.log(close_prices / close_prices.shift(1))
    close_drawdowns = close_prices - close_prices.cummax()

    output = {
        "tickers": TICKERS,
        "metrics": [CLOSE, RETURNS, LOG_RETURNS],
        "start_date": close_prices.index.min().strftime("%Y-%m-%d"),
        "end_date": close_prices.index.max().strftime("%Y-%m-%d"),
        "data": (
            build_frontend_records(close_prices, CLOSE).to_dict(orient=RECORDS)
            + build_frontend_records(close_returns, RETURNS).to_dict(orient=RECORDS)
            + build_frontend_records(close_log_returns, LOG_RETURNS).to_dict(orient=RECORDS)
        ),
        "drawdown_data": (
            build_frontend_records(close_drawdowns, DRAWDOWN)
            .drop(columns=["metric"])
            .to_dict(orient=RECORDS)
        ),
    }

    ARTIFACTS_PATH.mkdir(parents=True, exist_ok=True)
    FRONTEND_PUBLIC_PATH.mkdir(parents=True, exist_ok=True)

    write_json_output(output, MARKET_PATH)

    print(f"Saved market visualizations to: {MARKET_PATH}")

    try:
        write_json_output(output, FRONTEND_MARKET_PATH)
        print(f"Saved frontend market data to: {FRONTEND_MARKET_PATH}")
    except PermissionError:
        print(
            "Warning: unable to write frontend market data to "
            f"{FRONTEND_MARKET_PATH}. Copy {MARKET_PATH} manually if needed."
        )

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
