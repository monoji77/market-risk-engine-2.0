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
GARCH_REPORT_COLUMNS = [
    TICKER,
    "status",
    "stage",
    "reason",
    "observation_count",
    "selected_distribution",
    "selected_aic",
    "points_written",
    "candidate_attempts",
]


def normalize_returns_series(returns: pd.Series) -> pd.Series:
    numeric_returns = pd.to_numeric(returns, errors="coerce")

    return (
        numeric_returns
        .replace([float("inf"), float("-inf")], pd.NA)
        .dropna()
    )


def try_fit_garch_1_1_model(
    returns: pd.Series,
    distribution: str,
) -> tuple[ARCHModelResult | None, dict[str, str | float | int | None]]:
    clean_returns = normalize_returns_series(returns)
    observation_count = len(clean_returns)
    attempt = {
        DISTRIBUTION: distribution,
        "observation_count": observation_count,
        "status": "failed",
        "reason": None,
        AIC: None,
    }

    if observation_count < MINIMUM_GARCH_OBSERVATIONS:
        attempt["reason"] = "insufficient_observations"
        return None, attempt

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
    except Exception as exc:
        attempt["reason"] = f"fit_exception:{type(exc).__name__}"
        return None, attempt

    if not math.isfinite(fit.aic):
        attempt["reason"] = "non_finite_aic"
        return None, attempt

    attempt["status"] = "success"
    attempt["reason"] = "ok"
    attempt[AIC] = float(fit.aic)

    return fit, attempt


def fit_garch_1_1_model(
    returns: pd.Series,
    distribution: str,
) -> ARCHModelResult | None:
    fit, _ = try_fit_garch_1_1_model(returns, distribution)
    return fit


def collect_best_fit_distributions(
    returns_by_ticker: dict[str, pd.Series],
    tickers: Sequence[str] | None = None,
) -> pd.DataFrame:
    best_fit_distributions, _ = collect_best_fit_distribution_models(
        returns_by_ticker=returns_by_ticker,
        tickers=tickers,
    )

    return best_fit_distributions


def collect_best_fit_distribution_models(
    returns_by_ticker: dict[str, pd.Series],
    tickers: Sequence[str] | None = None,
) -> tuple[pd.DataFrame, dict[str, ARCHModelResult]]:
    best_fit_distributions, fits_by_ticker, _ = (
        collect_best_fit_distribution_models_with_report(
            returns_by_ticker=returns_by_ticker,
            tickers=tickers,
        )
    )

    return best_fit_distributions, fits_by_ticker


def collect_best_fit_distribution_models_with_report(
    returns_by_ticker: dict[str, pd.Series],
    tickers: Sequence[str] | None = None,
) -> tuple[pd.DataFrame, dict[str, ARCHModelResult], pd.DataFrame]:
    best_fit_rows: list[dict[str, str | float]] = []
    fits_by_ticker: dict[str, ARCHModelResult] = {}
    report_rows: list[dict[str, str | float | int | None]] = []
    selected_tickers = list(tickers) if tickers is not None else list(returns_by_ticker)

    for ticker in selected_tickers:
        ticker_returns = returns_by_ticker.get(ticker)

        if ticker_returns is None:
            report_rows.append(
                {
                    TICKER: ticker,
                    "status": "failed",
                    "stage": "distribution_selection",
                    "reason": "missing_returns_series",
                    "observation_count": 0,
                    "selected_distribution": None,
                    "selected_aic": None,
                    "points_written": 0,
                    "candidate_attempts": "",
                }
            )
            continue

        best_fit: ARCHModelResult | None = None
        best_row: dict[str, str | float] | None = None
        clean_returns = normalize_returns_series(ticker_returns)
        candidate_attempts: list[dict[str, str | float | int | None]] = []

        for distribution in CANDIDATE_DISTRIBUTIONS:
            fit, attempt = try_fit_garch_1_1_model(ticker_returns, distribution)
            candidate_attempts.append(attempt)

            if fit is None:
                continue

            candidate_row = {
                TICKER: ticker,
                DISTRIBUTION: distribution,
                AIC: float(fit.aic),
            }

            if best_row is None or candidate_row[AIC] < best_row[AIC]:
                best_row = candidate_row
                best_fit = fit

        if best_row is None or best_fit is None:
            report_rows.append(
                {
                    TICKER: ticker,
                    "status": "failed",
                    "stage": "distribution_selection",
                    "reason": derive_candidate_failure_reason(candidate_attempts),
                    "observation_count": len(clean_returns),
                    "selected_distribution": None,
                    "selected_aic": None,
                    "points_written": 0,
                    "candidate_attempts": format_candidate_attempts(candidate_attempts),
                }
            )
            continue

        best_fit_rows.append(best_row)
        fits_by_ticker[ticker] = best_fit
        report_rows.append(
            {
                TICKER: ticker,
                "status": "selected",
                "stage": "distribution_selection",
                "reason": "selected_best_fit_distribution",
                "observation_count": len(clean_returns),
                "selected_distribution": best_row[DISTRIBUTION],
                "selected_aic": float(best_row[AIC]),
                "points_written": 0,
                "candidate_attempts": format_candidate_attempts(candidate_attempts),
            }
        )

    if not best_fit_rows:
        return (
            pd.DataFrame(columns=[TICKER, DISTRIBUTION, AIC]),
            {},
            pd.DataFrame(report_rows, columns=GARCH_REPORT_COLUMNS),
        )

    return (
        pd.DataFrame(best_fit_rows)
        .sort_values(TICKER)
        .reset_index(drop=True),
        fits_by_ticker,
        pd.DataFrame(report_rows, columns=GARCH_REPORT_COLUMNS).sort_values(TICKER),
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
    fits_by_ticker: dict[str, ARCHModelResult] | None = None,
) -> pd.DataFrame:
    garch_volatility, _ = calculate_garch_1_1_volatility_with_report(
        returns=returns,
        best_fit_distributions=best_fit_distributions,
        tickers=tickers,
        fits_by_ticker=fits_by_ticker,
    )

    return garch_volatility


def calculate_garch_1_1_volatility_with_report(
    returns: pd.DataFrame,
    best_fit_distributions: pd.DataFrame,
    tickers: Sequence[str],
    fits_by_ticker: dict[str, ARCHModelResult] | None = None,
    distribution_selection_report: pd.DataFrame | None = None,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    if best_fit_distributions.empty:
        empty_report = build_garch_status_report_without_distributions(
            returns=returns,
            tickers=tickers,
            distribution_selection_report=distribution_selection_report,
        )
        return pd.DataFrame(index=returns.index), empty_report

    distribution_by_ticker = (
        best_fit_distributions
        .set_index(TICKER)[DISTRIBUTION]
        .to_dict()
    )
    volatility_series_by_ticker: dict[str, pd.Series] = {}
    selection_report_by_ticker = (
        distribution_selection_report.set_index(TICKER).to_dict("index")
        if distribution_selection_report is not None and not distribution_selection_report.empty
        else {}
    )
    report_rows: list[dict[str, str | float | int | None]] = []

    for ticker in tickers:
        selection_report = selection_report_by_ticker.get(ticker, {})
        distribution = distribution_by_ticker.get(ticker)

        if ticker not in returns.columns:
            report_rows.append(
                {
                    TICKER: ticker,
                    "status": "failed",
                    "stage": "volatility_series",
                    "reason": "missing_returns_column",
                    "observation_count": 0,
                    "selected_distribution": distribution,
                    "selected_aic": selection_report.get("selected_aic"),
                    "points_written": 0,
                    "candidate_attempts": selection_report.get("candidate_attempts", ""),
                }
            )
            continue

        if distribution is None:
            report_rows.append(
                {
                    TICKER: ticker,
                    "status": "failed",
                    "stage": "distribution_selection",
                    "reason": selection_report.get(
                        "reason",
                        "missing_best_fit_distribution",
                    ),
                    "observation_count": len(normalize_returns_series(returns[ticker])),
                    "selected_distribution": None,
                    "selected_aic": selection_report.get("selected_aic"),
                    "points_written": 0,
                    "candidate_attempts": selection_report.get("candidate_attempts", ""),
                }
            )
            continue

        ticker_returns = returns[ticker]
        clean_returns = normalize_returns_series(ticker_returns)
        fit = fits_by_ticker.get(ticker) if fits_by_ticker is not None else None

        if fit is None:
            fit, attempt = try_fit_garch_1_1_model(ticker_returns, distribution)
        else:
            attempt = None

        if fit is None:
            report_rows.append(
                {
                    TICKER: ticker,
                    "status": "failed",
                    "stage": "volatility_series",
                    "reason": attempt["reason"] if attempt is not None else "fit_unavailable",
                    "observation_count": len(clean_returns),
                    "selected_distribution": distribution,
                    "selected_aic": selection_report.get("selected_aic"),
                    "points_written": 0,
                    "candidate_attempts": selection_report.get("candidate_attempts", ""),
                }
            )
            continue

        scale = fit.scale or 1.0
        conditional_volatility = pd.Series(
            fit.conditional_volatility / scale,
            name=ticker,
        )

        if not conditional_volatility.index.equals(clean_returns.index):
            conditional_volatility.index = clean_returns.index

        reindexed_volatility = conditional_volatility.reindex(returns.index)
        volatility_series_by_ticker[ticker] = reindexed_volatility
        report_rows.append(
            {
                TICKER: ticker,
                "status": "success",
                "stage": "volatility_series",
                "reason": "written",
                "observation_count": len(clean_returns),
                "selected_distribution": distribution,
                "selected_aic": selection_report.get("selected_aic"),
                "points_written": int(reindexed_volatility.notna().sum()),
                "candidate_attempts": selection_report.get("candidate_attempts", ""),
            }
        )

    if not volatility_series_by_ticker:
        return pd.DataFrame(index=returns.index), pd.DataFrame(
            report_rows,
            columns=GARCH_REPORT_COLUMNS,
        ).sort_values(TICKER)

    return (
        pd.concat(volatility_series_by_ticker.values(), axis=1).sort_index(),
        pd.DataFrame(report_rows, columns=GARCH_REPORT_COLUMNS).sort_values(TICKER),
    )


def format_candidate_attempts(
    candidate_attempts: Sequence[dict[str, str | float | int | None]],
) -> str:
    formatted_attempts: list[str] = []

    for attempt in candidate_attempts:
        distribution = str(attempt.get(DISTRIBUTION, "unknown"))
        reason = str(attempt.get("reason") or "unknown")
        aic = attempt.get(AIC)

        if attempt.get("status") == "success" and isinstance(aic, float):
            formatted_attempts.append(f"{distribution}=ok(aic={aic:.2f})")
            continue

        formatted_attempts.append(f"{distribution}={reason}")

    return "; ".join(formatted_attempts)


def derive_candidate_failure_reason(
    candidate_attempts: Sequence[dict[str, str | float | int | None]],
) -> str:
    reasons = [
        str(attempt.get("reason"))
        for attempt in candidate_attempts
        if attempt.get("reason")
    ]

    if not reasons:
        return "all_candidate_fits_failed"

    unique_reasons = sorted(set(reasons))

    if len(unique_reasons) == 1:
        return unique_reasons[0]

    return "all_candidate_fits_failed"


def build_garch_status_report_without_distributions(
    returns: pd.DataFrame,
    tickers: Sequence[str],
    distribution_selection_report: pd.DataFrame | None = None,
) -> pd.DataFrame:
    selection_report_by_ticker = (
        distribution_selection_report.set_index(TICKER).to_dict("index")
        if distribution_selection_report is not None and not distribution_selection_report.empty
        else {}
    )
    report_rows: list[dict[str, str | float | int | None]] = []

    for ticker in tickers:
        selection_report = selection_report_by_ticker.get(ticker, {})
        observation_count = (
            len(normalize_returns_series(returns[ticker]))
            if ticker in returns.columns
            else 0
        )

        report_rows.append(
            {
                TICKER: ticker,
                "status": "failed",
                "stage": "distribution_selection",
                "reason": selection_report.get("reason", "missing_best_fit_distribution"),
                "observation_count": observation_count,
                "selected_distribution": None,
                "selected_aic": selection_report.get("selected_aic"),
                "points_written": 0,
                "candidate_attempts": selection_report.get("candidate_attempts", ""),
            }
        )

    return pd.DataFrame(report_rows, columns=GARCH_REPORT_COLUMNS).sort_values(TICKER)
