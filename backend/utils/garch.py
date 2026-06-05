from __future__ import annotations

import math
import warnings
from collections.abc import Sequence

import pandas as pd
from arch import arch_model
from arch.univariate.base import ARCHModelResult


TICKER = "ticker"
DISTRIBUTION = "distribution"
AIC = "aic"
GARCH_1_1_VOLATILITY = "garch_1_1_volatility"
GARCH_1_1_DISTRIBUTION = "garch_1_1_distribution"
AR = "AR"
GARCH = "GARCH"
MINIMUM_GARCH_OBSERVATIONS = 60
CANDIDATE_DISTRIBUTIONS = [
    "normal",
    "studentst",
    "skewstudent",
    "generalized error",
]


def normalize_returns_series(returns: pd.Series) -> pd.Series:
    numeric_returns = pd.to_numeric(returns, errors="coerce")

    return (
        numeric_returns
        .replace([float("inf"), float("-inf")], pd.NA)
        .dropna()
    )


def fit_garch_1_1_model(
    returns: pd.Series,
    distribution: str,
) -> ARCHModelResult | None:
    clean_returns = normalize_returns_series(returns)

    if len(clean_returns) < MINIMUM_GARCH_OBSERVATIONS:
        return None

    model = arch_model(
        y=clean_returns,
        mean=AR,
        lags=1,
        dist=distribution,
        vol=GARCH,
        p=1,
        o=0,
        q=1,
        rescale=True,
    )

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            fit = model.fit(disp="off", show_warning=False)
    except Exception:
        return None

    if not math.isfinite(fit.aic):
        return None

    return fit


def collect_best_fit_distributions(
    returns_by_ticker: dict[str, pd.Series],
    tickers: Sequence[str] | None = None,
) -> pd.DataFrame:
    candidate_rows: list[dict[str, str | float]] = []
    selected_tickers = list(tickers) if tickers is not None else list(returns_by_ticker)

    for ticker in selected_tickers:
        ticker_returns = returns_by_ticker.get(ticker)

        if ticker_returns is None:
            continue

        for distribution in CANDIDATE_DISTRIBUTIONS:
            fit = fit_garch_1_1_model(ticker_returns, distribution)

            if fit is None:
                continue

            candidate_rows.append(
                {
                    TICKER: ticker,
                    DISTRIBUTION: distribution,
                    AIC: float(fit.aic),
                }
            )

    if not candidate_rows:
        return pd.DataFrame(columns=[TICKER, DISTRIBUTION, AIC])

    candidate_df = pd.DataFrame(candidate_rows)
    best_fit_indexes = candidate_df.groupby(TICKER, sort=False)[AIC].idxmin()

    return (
        candidate_df.loc[best_fit_indexes]
        .sort_values(TICKER)
        .reset_index(drop=True)
    )


def build_distribution_summary_statistics(
    best_fit_distributions: pd.DataFrame,
) -> pd.DataFrame:
    if best_fit_distributions.empty:
        return pd.DataFrame(columns=["Count", "Proportion"])

    summary_df = pd.concat(
        [
            best_fit_distributions[DISTRIBUTION].value_counts(),
            best_fit_distributions[DISTRIBUTION].value_counts(normalize=True),
        ],
        axis=1,
        keys=["Count", "Proportion"],
    )
    summary_df.index.name = DISTRIBUTION

    return summary_df


def calculate_garch_1_1_volatility(
    returns: pd.DataFrame,
    best_fit_distributions: pd.DataFrame,
    tickers: Sequence[str],
) -> pd.DataFrame:
    if best_fit_distributions.empty:
        return pd.DataFrame(index=returns.index)

    distribution_by_ticker = (
        best_fit_distributions
        .set_index(TICKER)[DISTRIBUTION]
        .to_dict()
    )
    volatility_series_by_ticker: dict[str, pd.Series] = {}

    for ticker in tickers:
        distribution = distribution_by_ticker.get(ticker)

        if distribution is None or ticker not in returns.columns:
            continue

        ticker_returns = returns[ticker]
        clean_returns = normalize_returns_series(ticker_returns)
        fit = fit_garch_1_1_model(ticker_returns, distribution)

        if fit is None:
            continue

        scale = fit.scale or 1.0
        conditional_volatility = pd.Series(
            fit.conditional_volatility / scale,
            name=ticker,
        )

        if not conditional_volatility.index.equals(clean_returns.index):
            conditional_volatility.index = clean_returns.index

        volatility_series_by_ticker[ticker] = conditional_volatility.reindex(
            returns.index
        )

    if not volatility_series_by_ticker:
        return pd.DataFrame(index=returns.index)

    return (
        pd.concat(volatility_series_by_ticker.values(), axis=1)
        .sort_index()
    )
