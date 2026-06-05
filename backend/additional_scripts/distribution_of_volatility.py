from __future__ import annotations

from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from backend.utils.storage import read_advanced_metric_payload_if_exists
from backend.utils.utils import get_all_close_prices, get_available_tickers, ticker_to_filename


DRAWNDOWN_BAND_SIZE_PCT = 3.0
EWMA_LAMBDA = 0.94
MARKET_PROXY_TICKER = "^GSPC"
SHORT_TERM_VOLATILITY = "daily_short_term_volatility"
GARCH_1_1_VOLATILITY = "garch_1_1_volatility"
TEMP_DIR = Path(__file__).resolve().parents[1] / "temp"


def build_ewma_volatility_series(returns: pd.Series, lambda_value: float) -> pd.Series:
    clean_returns = pd.to_numeric(returns, errors="coerce").dropna()

    if clean_returns.empty:
        return pd.Series(dtype=float)

    normalized_lambda = min(0.99, max(0.01, lambda_value))
    ewma_values: list[float] = []
    previous_variance = float(clean_returns.iloc[0] ** 2)
    ewma_values.append(previous_variance ** 0.5)

    for index in range(1, len(clean_returns)):
        previous_return = float(clean_returns.iloc[index - 1])
        previous_variance = (
            normalized_lambda * previous_variance
            + (1 - normalized_lambda) * (previous_return ** 2)
        )
        ewma_values.append(max(previous_variance, 0.0) ** 0.5)

    return pd.Series(ewma_values, index=clean_returns.index, name=returns.name)


def extract_metric_series(payload: dict | None, metric_name: str) -> pd.Series:
    if not payload:
        return pd.Series(dtype=float)

    rows = payload.get("series", {}).get(metric_name, [])

    if not rows:
        return pd.Series(dtype=float)

    series = pd.Series(
        data=[float(row["value"]) for row in rows],
        index=pd.to_datetime([row["date"] for row in rows]),
        name=metric_name,
    )
    series.index.name = "Date"

    return series.sort_index()


def build_average_drawdown_distribution(close_prices: pd.DataFrame) -> pd.Series:
    average_drawdown_pct_by_ticker: dict[str, float] = {}

    for ticker in close_prices.columns:
        close_series = pd.to_numeric(close_prices[ticker], errors="coerce").dropna()

        if close_series.empty:
            continue

        rolling_peak = close_series.cummax()
        drawdown_pct = (close_series / rolling_peak) - 1.0
        average_drawdown_pct = float((-drawdown_pct).mean() * 100)
        average_drawdown_pct_by_ticker[ticker] = average_drawdown_pct

    return pd.Series(average_drawdown_pct_by_ticker, name="average_drawdown_pct").sort_values()


def build_volatility_ratio_distribution(
    close_prices: pd.DataFrame,
    tickers: list[str],
) -> pd.Series:
    returns = close_prices.pct_change()
    max_volatility_by_ticker: dict[str, float] = {}

    for ticker in tickers:
        if ticker not in returns.columns:
            continue

        advanced_payload = read_advanced_metric_payload_if_exists(
            ticker_to_filename(ticker)
        )
        short_term_series = extract_metric_series(
            advanced_payload,
            SHORT_TERM_VOLATILITY,
        )
        garch_series = extract_metric_series(
            advanced_payload,
            GARCH_1_1_VOLATILITY,
        )
        ewma_series = build_ewma_volatility_series(returns[ticker], EWMA_LAMBDA)

        maxima = [
            series.max()
            for series in (short_term_series, garch_series, ewma_series)
            if not series.empty
        ]

        if not maxima:
            continue

        max_volatility_by_ticker[ticker] = float(max(maxima))

    market_proxy_max = max_volatility_by_ticker.get(MARKET_PROXY_TICKER)

    if market_proxy_max is None or market_proxy_max <= 0:
        raise RuntimeError(
            f"Unable to derive a valid market proxy volatility baseline for {MARKET_PROXY_TICKER}."
        )

    ratio_by_ticker = {
        ticker: ticker_max / market_proxy_max
        for ticker, ticker_max in max_volatility_by_ticker.items()
        if ticker != MARKET_PROXY_TICKER
    }

    return pd.Series(ratio_by_ticker, name="volatility_ratio_to_market").sort_values()


def plot_average_drawdown_distribution(
    average_drawdown_distribution: pd.Series,
) -> Path:
    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    output_path = TEMP_DIR / "average_drawdown_distribution.png"

    max_drawdown_pct = average_drawdown_distribution.max()
    upper_bound = max(
        DRAWNDOWN_BAND_SIZE_PCT,
        np.ceil(max_drawdown_pct / DRAWNDOWN_BAND_SIZE_PCT) * DRAWNDOWN_BAND_SIZE_PCT,
    )
    bins = np.arange(0, upper_bound + DRAWNDOWN_BAND_SIZE_PCT, DRAWNDOWN_BAND_SIZE_PCT)

    figure, axis = plt.subplots(figsize=(12, 7))
    axis.hist(
        average_drawdown_distribution,
        bins=bins,
        color="#3f7f6b",
        edgecolor="#14332b",
        linewidth=1.1,
    )
    axis.set_title("Distribution of Average Drawdown by Ticker", fontsize=16)
    axis.set_xlabel("Average drawdown (%)")
    axis.set_ylabel("Ticker count")
    axis.grid(axis="y", alpha=0.25)

    figure.tight_layout()
    figure.savefig(output_path, dpi=180, bbox_inches="tight")
    plt.show()
    plt.close(figure)

    return output_path


def plot_volatility_ratio_distribution(volatility_ratio_distribution: pd.Series) -> Path:
    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    output_path = TEMP_DIR / "volatility_ratio_to_sp500_distribution.png"

    figure, axis = plt.subplots(figsize=(12, 7))
    axis.hist(
        volatility_ratio_distribution,
        bins=30,
        color="#a86e1c",
        edgecolor="#3a2810",
        linewidth=1.1,
    )
    axis.axvline(1.0, color="#b31e3a", linestyle="--", linewidth=1.5)
    axis.set_title(
        "Distribution of Max Volatility Relative to S&P 500 Proxy",
        fontsize=16,
    )
    axis.set_xlabel("Ticker max volatility / ^GSPC max volatility")
    axis.set_ylabel("Ticker count")
    axis.grid(axis="y", alpha=0.25)

    figure.tight_layout()
    figure.savefig(output_path, dpi=180, bbox_inches="tight")
    plt.show()
    plt.close(figure)

    return output_path


def main() -> None:
    available_ticker_set = set(get_available_tickers())
    tickers = sorted(available_ticker_set)

    if MARKET_PROXY_TICKER not in tickers:
        raise RuntimeError(
            f"{MARKET_PROXY_TICKER} is not available in Azure Blob raw price storage."
        )

    close_prices = get_all_close_prices(tickers)
    average_drawdown_distribution = build_average_drawdown_distribution(close_prices)
    volatility_ratio_distribution = build_volatility_ratio_distribution(
        close_prices,
        tickers,
    )

    drawdown_plot_path = plot_average_drawdown_distribution(
        average_drawdown_distribution
    )
    volatility_plot_path = plot_volatility_ratio_distribution(
        volatility_ratio_distribution
    )

    print(f"Saved drawdown distribution plot to: {drawdown_plot_path}")
    print(f"Saved volatility ratio distribution plot to: {volatility_plot_path}")
    print(
        "Assumption: '^GSCP' in the request refers to '^GSPC', the S&P 500 market proxy."
    )


if __name__ == "__main__":
    main()
