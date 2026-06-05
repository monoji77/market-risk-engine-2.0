from __future__ import annotations

from importlib import import_module

from tqdm.auto import tqdm

from backend.utils.garch import (
    calculate_garch_1_1_volatility,
    collect_best_fit_distribution_models,
)
from backend.utils.storage import get_storage_mode_label
from backend.utils.utils import get_all_returns


read_data = import_module("backend.01_read_data")
market_visualizations = import_module("backend.02_build_market_visualizations")
other_risk_measures = import_module("backend.03_calculate_other_risk_measures")
garch_market_volatility = import_module("backend.04_garch_1_1_market_volatility")


def main() -> None:
    with tqdm(total=9, desc="refresh_finance_data", unit="step") as progress:
        progress.set_postfix_str("downloading price history")
        rich_data = read_data.download_price_history(read_data.SP500_TICKERS)
        progress.update()

        progress.set_postfix_str("uploading raw csv files")
        available_tickers = read_data.write_raw_price_csvs(
            rich_data,
            read_data.SP500_TICKERS,
        )
        progress.update()

        progress.set_postfix_str("building close price matrix")
        close_prices = read_data.build_close_prices_from_download(
            rich_data,
            available_tickers,
        )
        progress.update()

        progress.set_postfix_str("writing market catalog and ticker payloads")
        market_visualizations.build_and_write_market_visualizations(
            close_prices,
            available_tickers,
        )
        progress.update()

        progress.set_postfix_str("calculating returns")
        returns = get_all_returns(close_prices)
        progress.update()

        progress.set_postfix_str("building short-term volatility payloads")
        short_term_volatility = other_risk_measures.calculate_short_term_volatility(
            returns
        )
        advanced_metric_payloads = (
            other_risk_measures.build_advanced_metric_payloads(
                short_term_volatility,
                available_tickers,
            )
        )
        progress.update()

        progress.set_postfix_str("selecting best-fit distributions")
        best_fit_distributions, fits_by_ticker = collect_best_fit_distribution_models(
            returns_by_ticker={
                ticker: returns[ticker]
                for ticker in available_tickers
                if ticker in returns.columns
            },
            tickers=available_tickers,
        )
        progress.update()

        progress.set_postfix_str("writing distribution reports")
        garch_market_volatility.write_distribution_reports(best_fit_distributions)
        progress.update()

        progress.set_postfix_str("writing final advanced metric payloads")
        garch_volatility = calculate_garch_1_1_volatility(
            returns=returns,
            best_fit_distributions=best_fit_distributions,
            tickers=available_tickers,
            fits_by_ticker=fits_by_ticker,
        )
        advanced_metric_payloads.update(
            garch_market_volatility.build_garch_metric_payloads(
                close_prices,
                returns,
                garch_volatility,
                best_fit_distributions,
                available_tickers,
                existing_payloads_by_ticker=advanced_metric_payloads,
            )
        )
        written_count = other_risk_measures.write_advanced_metric_payload_map(
            advanced_metric_payloads
        )
        progress.update()

    print(f"Saved refresh outputs to storage mode: {get_storage_mode_label()}")
    print(f"Number of tickers analyzed: {len(available_tickers)}")
    print(f"Number of advanced metric payloads written: {written_count}")


if __name__ == "__main__":
    main()
