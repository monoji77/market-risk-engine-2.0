############################
#
# [1] IMPORT LIBRARY
#
############################
import json

import pandas as pd
from tqdm.auto import tqdm

from backend.utils.utils import (
    ARTIFACTS_PATH,
    FRONTEND_PUBLIC_PATH,
    SP500_TICKERS,
    convert_series_to_point_records,
    get_all_close_prices,
    get_all_returns,
    get_available_tickers,
    ticker_to_filename,
)


############################
#
# [2] GLOBAL VARIABLES
#
############################
SHORT_TERM_VOLATILITY = "daily_short_term_volatility"
ADVANCED_METRICS_PATH = ARTIFACTS_PATH / "advanced_metrics"
FRONTEND_ADVANCED_METRICS_PATH = FRONTEND_PUBLIC_PATH / "advanced_metrics"


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


# recall that GARCH(1, 1) model is defined as...
# sigma_t^2 = gamma * Var_{long run} + alpha * sigma_{t-1}^2 + beta * R_{t-1}^2
#   where:
#       (1) gamma + alpha + beta = 1
#       (2) sigma_{t-1}^2 and R_{t-1}^2 are known variables (not random)
#       (3) GARCH(1, 1) volatility is the square root of sigma_t^2
#
# NOTE: we need to estimate the parameters (gamma, alpha, beta) using historical data


def calculate_garch_1_1_volatility(returns: pd.DataFrame) -> pd.DataFrame:


    pass


def write_json_output(output: dict, output_path) -> None:
    temp_output_path = output_path.with_suffix(f"{output_path.suffix}.tmp")

    with temp_output_path.open("w", encoding="utf-8") as file:
        json.dump(output, file, indent=2, allow_nan=False)

    temp_output_path.replace(output_path)


def build_advanced_metric_payload(ticker: str, short_term_volatility: pd.DataFrame) -> dict:
    volatility_series = short_term_volatility[ticker]
    point_records = convert_series_to_point_records(volatility_series)

    return {
        "ticker": ticker,
        "metrics": [SHORT_TERM_VOLATILITY],
        "start_date": point_records[0]["date"],
        "end_date": point_records[-1]["date"],
        "series": {
            SHORT_TERM_VOLATILITY: point_records,
        },
    }


def write_advanced_metric_payloads(
    short_term_volatility: pd.DataFrame,
    available_tickers: list[str],
) -> None:
    ARTIFACTS_PATH.mkdir(parents=True, exist_ok=True)
    FRONTEND_PUBLIC_PATH.mkdir(parents=True, exist_ok=True)
    ADVANCED_METRICS_PATH.mkdir(parents=True, exist_ok=True)
    FRONTEND_ADVANCED_METRICS_PATH.mkdir(parents=True, exist_ok=True)

    for ticker in tqdm(
        available_tickers,
        desc="Writing advanced metric files",
        unit="ticker",
    ):
        payload = build_advanced_metric_payload(ticker, short_term_volatility)
        ticker_filename = ticker_to_filename(ticker)

        write_json_output(payload, ADVANCED_METRICS_PATH / ticker_filename)
        write_json_output(payload, FRONTEND_ADVANCED_METRICS_PATH / ticker_filename)


############################
#
# [4] MAIN FUNCTION
#
############################


def main() -> None:
    available_ticker_set = set(get_available_tickers())
    available_tickers = [
        ticker for ticker in SP500_TICKERS if ticker in available_ticker_set
    ]

    with tqdm(total=4, desc="03_calculate_other_risk_measures", unit="step") as progress:
        progress.set_postfix_str("loading close prices")
        close_prices = get_all_close_prices(available_tickers)
        progress.update()

        progress.set_postfix_str("calculating returns")
        returns = get_all_returns(close_prices)
        progress.update()

        progress.set_postfix_str("calculating short-term volatility")
        short_term_volatility = calculate_short_term_volatility(returns)
        progress.update()

        progress.set_postfix_str("writing per-ticker advanced metrics")
        write_advanced_metric_payloads(short_term_volatility, available_tickers)
        progress.update()

    print(f"Saved advanced metric payloads to: {ADVANCED_METRICS_PATH}")
    print(f"Saved frontend advanced metric payloads to: {FRONTEND_ADVANCED_METRICS_PATH}")
    print(f"Number of tickers: {len(available_tickers)}")


############################
#
# [5] RUN MAIN FUNCTION
#
############################


if __name__ == "__main__":
    main()
