import pandas as pd
from arch import arch_model
from arch.univariate.base import ARCHModelResult
from backend.utils.utils import RETURNS, VALUE, TICKER, TICKERS, get_all_close_prices, get_all_returns, convert_to_long_records
from tabulate import tabulate

AIC = 'AIC'
DISTRIBUTION = 'Distribution'
GARCH = 'GARCH'
AR = 'AR'
CANDIDATE_DISTRIBUTIONS = [
    'normal',
    'studentst',
    'skewstudent',
    'generalized error',    
]

def get_aic_of_garch_1_1_model_given_distribution(
        returns: pd.Series, 
        distribution: str,
        tick: str):
    tick_returns = returns[returns[TICKER] == tick][VALUE].dropna()
    tick_returns.name = f'{tick} {RETURNS}'
    model = arch_model(y=tick_returns,
                       mean=AR,
                       dist=distribution,
                       vol=GARCH,
                       p=1, o=0, q=1,
                       rescale=True)

    fit = model.fit(disp='off') 

    return (tick, distribution, f'{fit.aic:.2f}') 

def obtain_all_aic_per_ticker(returns: pd.DataFrame) -> pd.DataFrame:
    results = [
        get_aic_of_garch_1_1_model_given_distribution(returns, dist, tick)
            for dist in CANDIDATE_DISTRIBUTIONS 
                for tick in TICKERS
    ]
    results = pd.DataFrame(results, columns=[TICKER, DISTRIBUTION, AIC])
    return results

def obtain_best_aic_per_ticker(returns: pd.DataFrame) -> pd.DataFrame:
    results = obtain_all_aic_per_ticker(returns)
    cond = results.groupby(TICKER)[AIC].idxmin()
    best_aic_per_ticker = results.loc[cond].reset_index(drop=True)
    return best_aic_per_ticker

def print_best_distribution_summary_statistics(best_aic_per_ticker: pd.DataFrame):
    best_distribution_summary_statistics =  pd.concat(
        [best_aic_per_ticker[DISTRIBUTION].value_counts(), 
        best_aic_per_ticker[DISTRIBUTION].value_counts(normalize=True)],
        axis=1,
            keys=['Count', 'Proportion'],
    )
    best_distribution = best_aic_per_ticker[DISTRIBUTION].value_counts().idxmax()
    display_df = best_distribution_summary_statistics.copy()

    display_df["Count"] = display_df["Count"].astype(int)
    display_df["Proportion"] = (display_df["Proportion"] * 100).map("{:.0f}%".format)

    # convert count to integer and proportion to percentage
    print(f"\nSummary statistics of best distribution\n")
    print("-" * 28)
    print(" " * 7 + best_distribution)
    print("-" * 28, '\n')
    print(
        tabulate(
            display_df,
            headers="keys",
            tablefmt="pretty",
            floatfmt=".2f"
        )
    )

    print(
        tabulate(
            best_aic_per_ticker,
            headers="keys",
            tablefmt="pretty",
            showindex=False,
            floatfmt=".2f"
        )
    )


def main():
    close_prices = get_all_close_prices()
    returns = get_all_returns(close_prices)
    returns = convert_to_long_records(returns, metric=RETURNS)    
    best_aic_per_ticker = obtain_best_aic_per_ticker(returns)
    print_best_distribution_summary_statistics(best_aic_per_ticker)
    


if __name__ == "__main__":
    main()

