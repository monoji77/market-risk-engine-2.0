import pandas as pd

from backend.utils.garch import (
    AIC,
    build_distribution_summary_statistics,
    collect_best_fit_distributions,
)
from backend.utils.storage import write_distribution_csv
from backend.utils.utils import SP500_TICKERS, get_all_close_prices, get_all_returns


def build_formatted_distribution_summary(summary_df: pd.DataFrame) -> pd.DataFrame:
    if summary_df.empty:
        return summary_df

    formatted_df = summary_df.copy()
    formatted_df["Count"] = formatted_df["Count"].astype(int)
    formatted_df["Proportion"] = (
        formatted_df["Proportion"] * 100
    ).map("{:.0f}%".format)

    return formatted_df


def main() -> None:
    close_prices = get_all_close_prices(SP500_TICKERS)
    returns = get_all_returns(close_prices)
    best_fit_distributions = collect_best_fit_distributions(
        returns_by_ticker={ticker: returns[ticker] for ticker in close_prices.columns},
        tickers=close_prices.columns,
    )

    raw_summary_df = build_distribution_summary_statistics(best_fit_distributions)
    write_distribution_csv("distribution_raw.csv", raw_summary_df)
    write_distribution_csv(
        "distribution_summary_statistics.csv",
        build_formatted_distribution_summary(raw_summary_df),
    )

    if not best_fit_distributions.empty:
        display_df = best_fit_distributions.copy()
        display_df[AIC] = display_df[AIC].map("{:.2f}".format)
        write_distribution_csv(
            "distribution_best_fit_by_ticker.csv",
            display_df.set_index("ticker"),
        )


if __name__ == "__main__":
    main()
