from __future__ import annotations

import math

import pandas as pd


MARKET_PROXY_TICKER = "^GSPC"
DRAWDOWN_LOOKBACK_DAYS = 30
EWMA_LAMBDA = 0.94
SHORT_TERM_VOLATILITY = "daily_short_term_volatility"
GARCH_1_1_VOLATILITY = "garch_1_1_volatility"
EWMA_VOLATILITY = "ewma_volatility"
RISK_CLASSIFICATIONS = ("Low", "Moderate", "High", "Very High", "Extreme")
RISK_SEVERITY = {
    classification: index
    for index, classification in enumerate(RISK_CLASSIFICATIONS)
}


def calculate_short_term_volatility(returns: pd.DataFrame) -> pd.DataFrame:
    return returns.rolling(window=30).std()


def build_ewma_volatility_series(
    returns: pd.Series,
    lambda_value: float = EWMA_LAMBDA,
) -> pd.Series:
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


def build_risk_assessment_map(
    close_prices: pd.DataFrame,
    returns: pd.DataFrame,
    garch_volatility: pd.DataFrame,
    tickers: list[str],
    *,
    benchmark_ticker: str = MARKET_PROXY_TICKER,
    drawdown_lookback_days: int = DRAWDOWN_LOOKBACK_DAYS,
    ewma_lambda: float = EWMA_LAMBDA,
) -> dict[str, dict | None]:
    short_term_volatility = calculate_short_term_volatility(returns)
    risk_assessments_by_ticker: dict[str, dict | None] = {}

    for ticker in tickers:
        risk_assessments_by_ticker[ticker] = build_ticker_risk_assessment(
            ticker=ticker,
            close_prices=close_prices,
            returns=returns,
            short_term_volatility=short_term_volatility,
            garch_volatility=garch_volatility,
            benchmark_ticker=benchmark_ticker,
            drawdown_lookback_days=drawdown_lookback_days,
            ewma_lambda=ewma_lambda,
        )

    return risk_assessments_by_ticker


def build_ticker_risk_assessment(
    ticker: str,
    close_prices: pd.DataFrame,
    returns: pd.DataFrame,
    short_term_volatility: pd.DataFrame,
    garch_volatility: pd.DataFrame,
    *,
    benchmark_ticker: str = MARKET_PROXY_TICKER,
    drawdown_lookback_days: int = DRAWDOWN_LOOKBACK_DAYS,
    ewma_lambda: float = EWMA_LAMBDA,
) -> dict | None:
    asset_close_series = get_numeric_series(close_prices, ticker)

    if asset_close_series.empty:
        return None

    drawdown_window_end = asset_close_series.index.max()
    drawdown_window_start = drawdown_window_end - pd.Timedelta(
        days=drawdown_lookback_days
    )
    asset_close_window = filter_series_to_window(
        asset_close_series,
        drawdown_window_start,
        drawdown_window_end,
    )
    asset_max_drawdown_pct = calculate_max_drawdown_pct(asset_close_window)
    drawdown_classification = classify_drawdown_pct(asset_max_drawdown_pct)

    asset_returns = get_numeric_series(returns, ticker)
    benchmark_returns = get_numeric_series(returns, benchmark_ticker)
    asset_short_term_volatility = get_numeric_series(short_term_volatility, ticker)
    benchmark_short_term_volatility = get_numeric_series(
        short_term_volatility,
        benchmark_ticker,
    )
    asset_garch_volatility = get_numeric_series(garch_volatility, ticker)
    benchmark_garch_volatility = get_numeric_series(garch_volatility, benchmark_ticker)
    asset_ewma_volatility = build_ewma_volatility_series(asset_returns, ewma_lambda)
    benchmark_ewma_volatility = build_ewma_volatility_series(
        benchmark_returns,
        ewma_lambda,
    )
    volatility_reference_date = resolve_reference_date(
        asset_short_term_volatility,
        benchmark_short_term_volatility,
        asset_garch_volatility,
        benchmark_garch_volatility,
        asset_ewma_volatility,
        benchmark_ewma_volatility,
    )
    asset_volatility_metrics = build_latest_metric_values(
        asset_short_term_volatility,
        asset_garch_volatility,
        asset_ewma_volatility,
        volatility_reference_date,
    )
    benchmark_volatility_metrics = build_latest_metric_values(
        benchmark_short_term_volatility,
        benchmark_garch_volatility,
        benchmark_ewma_volatility,
        volatility_reference_date,
    )
    asset_max_volatility = build_max_value(asset_volatility_metrics.values())
    benchmark_max_volatility = build_max_value(benchmark_volatility_metrics.values())
    relative_max_volatility = build_ratio(
        asset_max_volatility,
        benchmark_max_volatility,
    )
    volatility_classification = classify_relative_max_volatility(
        relative_max_volatility
    )
    overall_classification = build_overall_classification(
        volatility_classification,
        drawdown_classification,
    )

    return {
        "benchmark_ticker": benchmark_ticker,
        "drawdown": {
            "asset_max_drawdown_pct": asset_max_drawdown_pct,
            "benchmark_max_drawdown_pct": None,
            "classification": drawdown_classification,
            "lookback_days": drawdown_lookback_days,
            "relative_drawdown_ratio": None,
            "window_end_date": drawdown_window_end.strftime("%Y-%m-%d"),
            "window_start_date": drawdown_window_start.strftime("%Y-%m-%d"),
        },
        "overall": {
            "classification": overall_classification,
            "label": (
                f"{overall_classification} risk"
                if overall_classification
                else None
            ),
        },
        "volatility": {
            "asset_latest_metrics": asset_volatility_metrics,
            "asset_max": asset_max_volatility,
            "benchmark_latest_metrics": benchmark_volatility_metrics,
            "benchmark_max": benchmark_max_volatility,
            "classification": volatility_classification,
            "latest_date": (
                volatility_reference_date.strftime("%Y-%m-%d")
                if volatility_reference_date is not None
                else ""
            ),
            "relative_max_volatility": relative_max_volatility,
        },
    }


def get_numeric_series(frame: pd.DataFrame, ticker: str) -> pd.Series:
    if ticker not in frame.columns:
        return pd.Series(dtype=float)

    return pd.to_numeric(frame[ticker], errors="coerce").dropna()


def filter_series_to_window(
    series: pd.Series,
    start_date: pd.Timestamp,
    end_date: pd.Timestamp,
) -> pd.Series:
    if series.empty:
        return series

    return series.loc[(series.index >= start_date) & (series.index <= end_date)]


def calculate_max_drawdown_pct(close_series: pd.Series) -> float | None:
    if close_series.empty:
        return None

    rolling_peak = close_series.cummax()
    drawdown_pct = (close_series / rolling_peak) - 1.0
    numeric_drawdown = pd.to_numeric(drawdown_pct, errors="coerce").dropna()

    if numeric_drawdown.empty:
        return None

    return max(0.0, float((-numeric_drawdown).max() * 100))


def resolve_reference_date(*series_collection: pd.Series) -> pd.Timestamp | None:
    available_dates = [
        series.index.max()
        for series in series_collection
        if series is not None and not series.empty
    ]

    if not available_dates:
        return None

    return min(available_dates)


def build_latest_metric_values(
    short_term_volatility: pd.Series,
    garch_volatility: pd.Series,
    ewma_volatility: pd.Series,
    reference_date: pd.Timestamp | None,
) -> dict[str, float | None]:
    return {
        SHORT_TERM_VOLATILITY: get_series_value_on_or_before(
            short_term_volatility,
            reference_date,
        ),
        GARCH_1_1_VOLATILITY: get_series_value_on_or_before(
            garch_volatility,
            reference_date,
        ),
        EWMA_VOLATILITY: get_series_value_on_or_before(
            ewma_volatility,
            reference_date,
        ),
    }


def get_series_value_on_or_before(
    series: pd.Series,
    reference_date: pd.Timestamp | None,
) -> float | None:
    if reference_date is None or series.empty:
        return None

    eligible_values = series.loc[series.index <= reference_date]

    if eligible_values.empty:
        return None

    value = eligible_values.iloc[-1]

    if not pd.notna(value):
        return None

    numeric_value = float(value)

    if not math.isfinite(numeric_value):
        return None

    return numeric_value


def build_max_value(values) -> float | None:
    finite_values = [
        float(value)
        for value in values
        if value is not None and math.isfinite(float(value))
    ]

    if not finite_values:
        return None

    return max(finite_values)


def build_ratio(numerator: float | None, denominator: float | None) -> float | None:
    if numerator is None or denominator is None or denominator <= 0:
        return None

    return numerator / denominator


def classify_relative_max_volatility(ratio: float | None) -> str | None:
    if ratio is None:
        return None

    if ratio < 1.5:
        return "Low"

    if ratio <= 2.5:
        return "Moderate"

    if ratio <= 4.0:
        return "High"

    return "Very High"


def classify_drawdown_pct(drawdown_pct: float | None) -> str | None:
    if drawdown_pct is None:
        return None

    if drawdown_pct <= 10.0:
        return "Low"

    if drawdown_pct <= 20.0:
        return "Moderate"

    if drawdown_pct <= 35.0:
        return "High"

    if drawdown_pct <= 50.0:
        return "Very High"

    return "Extreme"


def build_overall_classification(*classifications: str | None) -> str | None:
    available_classifications = [
        classification
        for classification in classifications
        if classification in RISK_SEVERITY
    ]

    if not available_classifications:
        return None

    return max(available_classifications, key=RISK_SEVERITY.__getitem__)
