############################
#
# [1] IMPORT LIBRARY
#
############################
import pandas as pd
from tqdm.auto import tqdm

from backend.utils.storage import (
    get_storage_mode_label,
    write_advanced_metric_payload,
)
from backend.utils.utils import (
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


def build_advanced_metric_payload(ticker: str, short_term_volatility: pd.DataFrame) -> dict:
    volatility_series = short_term_volatility[ticker]
    point_records = convert_series_to_point_records(volatility_series)
    has_index = len(volatility_series.index) > 0

    if point_records:
        start_date = point_records[0]["date"]
        end_date = point_records[-1]["date"]
    elif has_index:
        start_date = volatility_series.index.min().strftime("%Y-%m-%d")
        end_date = volatility_series.index.max().strftime("%Y-%m-%d")
    else:
        start_date = ""
        end_date = ""

    return {
        "ticker": ticker,
        "metrics": [SHORT_TERM_VOLATILITY],
        "start_date": start_date,
        "end_date": end_date,
        "series": {
            SHORT_TERM_VOLATILITY: point_records,
        },
    }


def build_advanced_metric_payloads(
    short_term_volatility: pd.DataFrame,
    available_tickers: list[str],
) -> dict[str, dict]:
    payloads_by_ticker: dict[str, dict] = {}

    for ticker in available_tickers:
        payloads_by_ticker[ticker] = build_advanced_metric_payload(
            ticker,
            short_term_volatility,
        )

    return payloads_by_ticker


def write_advanced_metric_payload_map(payloads_by_ticker: dict[str, dict]) -> int:
    written_count = 0

    for ticker, payload in tqdm(
        payloads_by_ticker.items(),
        desc="Writing advanced metric files",
        unit="ticker",
    ):
        ticker_filename = ticker_to_filename(ticker)
        write_advanced_metric_payload(ticker_filename, payload)
        written_count += 1

    return written_count


def write_advanced_metric_payloads(
    short_term_volatility: pd.DataFrame,
    available_tickers: list[str],
) -> int:
    payloads_by_ticker = build_advanced_metric_payloads(
        short_term_volatility,
        available_tickers,
    )

    return write_advanced_metric_payload_map(payloads_by_ticker)


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
        written_count = write_advanced_metric_payloads(
            short_term_volatility,
            available_tickers,
        )
        progress.update()

    print(f"Saved advanced metric payloads to storage mode: {get_storage_mode_label()}")
    print(f"Number of tickers: {len(available_tickers)}")
    print(f"Number of advanced metric payloads written: {written_count}")


############################
#
# [5] RUN MAIN FUNCTION
#
############################


if __name__ == "__main__":
    main()
