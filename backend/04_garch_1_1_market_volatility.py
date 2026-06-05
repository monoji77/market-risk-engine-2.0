from __future__ import annotations

import pandas as pd
from tqdm.auto import tqdm

from backend.utils.garch import (
    AIC,
    DISTRIBUTION,
    GARCH_1_1_DISTRIBUTION,
    GARCH_1_1_VOLATILITY,
    build_distribution_summary_statistics,
    calculate_garch_1_1_volatility,
    collect_best_fit_distributions,
)
from backend.utils.storage import (
    get_storage_mode_label,
    read_advanced_metric_payload_if_exists,
    write_advanced_metric_payload,
    write_distribution_csv,
)
from backend.utils.utils import (
    SP500_TICKERS,
    convert_series_to_point_records,
    get_all_close_prices,
    get_all_returns,
    get_available_tickers,
    ticker_to_filename,
)


def build_formatted_distribution_summary(summary_df: pd.DataFrame) -> pd.DataFrame:
    if summary_df.empty:
        return summary_df

    formatted_df = summary_df.copy()
    formatted_df["Count"] = formatted_df["Count"].astype(int)
    formatted_df["Proportion"] = (
        formatted_df["Proportion"] * 100
    ).map("{:.0f}%".format)

    return formatted_df


def write_distribution_reports(best_fit_distributions: pd.DataFrame) -> None:
    summary_df = build_distribution_summary_statistics(best_fit_distributions)
    formatted_summary_df = build_formatted_distribution_summary(summary_df)

    write_distribution_csv("distribution_raw.csv", summary_df)
    write_distribution_csv("distribution_summary_statistics.csv", formatted_summary_df)

    if best_fit_distributions.empty:
        write_distribution_csv(
            "distribution_best_fit_by_ticker.csv",
            best_fit_distributions,
        )
        return

    display_df = best_fit_distributions.copy()
    display_df[AIC] = display_df[AIC].map("{:.2f}".format)

    write_distribution_csv(
        "distribution_best_fit_by_ticker.csv",
        display_df.set_index("ticker"),
    )


def get_series_date_bounds(series: pd.Series) -> tuple[str, str]:
    point_records = convert_series_to_point_records(series)
    has_index = len(series.index) > 0

    if point_records:
        return point_records[0]["date"], point_records[-1]["date"]

    if has_index:
        return (
            series.index.min().strftime("%Y-%m-%d"),
            series.index.max().strftime("%Y-%m-%d"),
        )

    return "", ""


def merge_iso_dates(*dates: str, reducer=min) -> str:
    non_empty_dates = [date for date in dates if date]

    if not non_empty_dates:
        return ""

    return reducer(non_empty_dates)


def build_merged_advanced_metric_payload(
    ticker: str,
    garch_volatility_series: pd.Series,
    best_fit_distribution: str | None,
    existing_payload: dict | None,
) -> dict:
    payload = dict(existing_payload or {})
    existing_metrics = list(payload.get("metrics", []))
    metrics = list(existing_metrics)

    if GARCH_1_1_VOLATILITY not in metrics:
        metrics.append(GARCH_1_1_VOLATILITY)

    point_records = convert_series_to_point_records(garch_volatility_series)
    start_date, end_date = get_series_date_bounds(garch_volatility_series)
    merged_start_date = merge_iso_dates(payload.get("start_date", ""), start_date)
    merged_end_date = merge_iso_dates(
        payload.get("end_date", ""),
        end_date,
        reducer=max,
    )

    series = dict(payload.get("series", {}))
    series[GARCH_1_1_VOLATILITY] = point_records

    payload.update(
        {
            "ticker": ticker,
            "metrics": metrics,
            "start_date": merged_start_date,
            "end_date": merged_end_date,
            "series": series,
            GARCH_1_1_DISTRIBUTION: best_fit_distribution,
        }
    )

    return payload


def write_garch_metric_payloads(
    garch_volatility: pd.DataFrame,
    best_fit_distributions: pd.DataFrame,
    available_tickers: list[str],
) -> int:
    distribution_by_ticker = (
        best_fit_distributions
        .set_index("ticker")[DISTRIBUTION]
        .to_dict()
        if not best_fit_distributions.empty
        else {}
    )
    written_count = 0

    for ticker in tqdm(
        available_tickers,
        desc="Writing GARCH metric files",
        unit="ticker",
    ):
        if ticker not in garch_volatility.columns:
            continue

        existing_payload = read_advanced_metric_payload_if_exists(
            ticker_to_filename(ticker)
        )
        payload = build_merged_advanced_metric_payload(
            ticker=ticker,
            garch_volatility_series=garch_volatility[ticker],
            best_fit_distribution=distribution_by_ticker.get(ticker),
            existing_payload=existing_payload,
        )

        write_advanced_metric_payload(ticker_to_filename(ticker), payload)
        written_count += 1

    return written_count


def main() -> None:
    available_ticker_set = set(get_available_tickers())
    available_tickers = [
        ticker for ticker in SP500_TICKERS if ticker in available_ticker_set
    ]

    with tqdm(
        total=6,
        desc="04_garch_1_1_market_volatility",
        unit="step",
    ) as progress:
        progress.set_postfix_str("loading close prices")
        close_prices = get_all_close_prices(available_tickers)
        progress.update()

        progress.set_postfix_str("calculating returns")
        returns = get_all_returns(close_prices)
        progress.update()

        progress.set_postfix_str("selecting best-fit distributions")
        best_fit_distributions = collect_best_fit_distributions(
            returns_by_ticker={
                ticker: returns[ticker]
                for ticker in available_tickers
                if ticker in returns.columns
            },
            tickers=available_tickers,
        )
        progress.update()

        progress.set_postfix_str("writing distribution reports")
        write_distribution_reports(best_fit_distributions)
        progress.update()

        progress.set_postfix_str("calculating garch volatility")
        garch_volatility = calculate_garch_1_1_volatility(
            returns=returns,
            best_fit_distributions=best_fit_distributions,
            tickers=available_tickers,
        )
        progress.update()

        progress.set_postfix_str("merging advanced metrics payloads")
        written_count = write_garch_metric_payloads(
            garch_volatility,
            best_fit_distributions,
            available_tickers,
        )
        progress.update()

    print(f"Saved GARCH market volatility payloads to storage mode: {get_storage_mode_label()}")
    print(f"Number of tickers analyzed: {len(available_tickers)}")
    print(f"Number of tickers with GARCH payloads: {written_count}")


if __name__ == "__main__":
    main()
