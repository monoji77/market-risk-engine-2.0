############################
#
# [1] IMPORT LIBRARY
#
############################
import json

import pandas as pd

from utils.utils import (
    ARTIFACTS_PATH,
    FRONTEND_PUBLIC_PATH,
    DATE,
    TICKERS,
    convert_to_long_records,
    get_all_close_prices,
    get_all_returns
)


############################
#
# [2] GLOBAL VARIABLES
#
############################
RECORDS = "records"
SHORT_TERM_VOLATILITY = "daily_short_term_volatility"
OTHER_RISK_MEASURES_PATH = ARTIFACTS_PATH / "other_risk_measures.json"
FRONTEND_OTHER_RISK_MEASURES_PATH = FRONTEND_PUBLIC_PATH / "other_risk_measures.json"

############################
#
# [3] HELPER FUNCTIONS
#
############################
def calculate_short_term_volatility(returns: pd.DataFrame) -> pd.DataFrame:
    """
    Calculate short-term rolling volatility for each ticker.

    Volatility is calculated as the standard deviation of returns over a rolling window of 30 days.
    """
    volatility = returns.rolling(window=30).std()

    return volatility



def build_frontend_records(df: pd.DataFrame, metric: str) -> pd.DataFrame:
    return convert_to_long_records(df, metric).rename(columns={DATE: "date"})


def write_json_output(output: dict, output_path) -> None:
    with output_path.open("w", encoding="utf-8") as file:
        json.dump(output, file, indent=2)




def save_other_risk_measures(short_term_volatility: pd.DataFrame) -> None:
    frontend_records = build_frontend_records(
        short_term_volatility,
        SHORT_TERM_VOLATILITY,
    )
    valid_short_term_volatility = short_term_volatility.dropna(how="all")

    output = {
        "tickers": TICKERS,
        "metrics": [SHORT_TERM_VOLATILITY],
        "start_date": valid_short_term_volatility.index.min().strftime("%Y-%m-%d"),
        "end_date": valid_short_term_volatility.index.max().strftime("%Y-%m-%d"),
        "data": frontend_records.to_dict(orient=RECORDS),
    }

    ARTIFACTS_PATH.mkdir(parents=True, exist_ok=True)
    FRONTEND_PUBLIC_PATH.mkdir(parents=True, exist_ok=True)

    write_json_output(output, OTHER_RISK_MEASURES_PATH)

    print(f"Saved other risk measures to: {OTHER_RISK_MEASURES_PATH}")

    try:
        write_json_output(output, FRONTEND_OTHER_RISK_MEASURES_PATH)
        print(
            "Saved frontend other risk measures to: "
            f"{FRONTEND_OTHER_RISK_MEASURES_PATH}"
        )
    except PermissionError:
        print(
            "Warning: unable to write frontend other risk measures to "
            f"{FRONTEND_OTHER_RISK_MEASURES_PATH}. Copy "
            f"{OTHER_RISK_MEASURES_PATH} manually if needed."
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
    returns = get_all_returns(close_prices)
    short_term_volatility = calculate_short_term_volatility(returns)
    save_other_risk_measures(short_term_volatility)
############################
#
# [5] RUN MAIN FUNCTION
#
############################

if __name__ == "__main__":
    main()
