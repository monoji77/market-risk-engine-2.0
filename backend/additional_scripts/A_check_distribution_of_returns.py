import pandas as pd
from arch import arch_model
from arch.univariate.base import ARCHModelResult
from backend.utils.storage import write_distribution_csv
from backend.utils.utils import RETURNS, VALUE, TICKER, SP500_TICKERS, get_all_close_prices, get_all_returns, convert_to_long_records
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
DISTRIBUTION = 'distribution'

def get_aic_of_garch_1_1_model_given_distribution(
        returns: pd.Series, 
        distribution: str,
        tick: str):
    # tick_returns = returns[returns[TICKER] == tick][VALUE].dropna()
    # tick_returns.name = f'{tick} {RETURNS}'
    model = arch_model(y=returns,
                    mean=AR,
                    dist=distribution,
                    vol=GARCH,
                    p=1, o=0, q=1,
                    rescale=True)

    fit = model.fit(disp='off') 
    return (tick, distribution, f'{fit.aic:.2f}') 

def obtain_all_aic_per_ticker(returns: dict) -> pd.DataFrame:
    results = [
        get_aic_of_garch_1_1_model_given_distribution(returns[tick], dist, tick)
            for dist in CANDIDATE_DISTRIBUTIONS 
                for tick in SP500_TICKERS
    ]
    results = pd.DataFrame(results, columns=[TICKER, DISTRIBUTION, AIC])
    return results

def obtain_best_aic_per_ticker(returns: pd.DataFrame) -> pd.DataFrame:
    returns_by_ticker = {
        ticker: group[VALUE].dropna().to_numpy()
        for ticker, group in returns.groupby(TICKER, sort=False)
    }   
    results = obtain_all_aic_per_ticker(returns_by_ticker)

    cond = results.groupby(TICKER)[AIC].idxmin()
    best_aic_per_ticker = results.loc[cond].reset_index(drop=True)
    return best_aic_per_ticker

def save_best_distribution_summary_statistics(best_aic_per_ticker: pd.DataFrame):
    best_distribution_summary_statistics =  pd.concat(
        [best_aic_per_ticker[DISTRIBUTION].value_counts(), 
        best_aic_per_ticker[DISTRIBUTION].value_counts(normalize=True)],
        axis=1,
            keys=['Count', 'Proportion'],
    )
    best_distribution = best_aic_per_ticker[DISTRIBUTION].value_counts().idxmax()
    display_df = best_distribution_summary_statistics.copy()
    display_df.index.name = DISTRIBUTION
    write_distribution_csv(f'{DISTRIBUTION}_raw.csv', display_df)

    display_df["Count"] = display_df["Count"].astype(int)
    display_df["Proportion"] = (display_df["Proportion"] * 100).map("{:.0f}%".format)

    write_distribution_csv(f'{DISTRIBUTION}_summary_statistics.csv', display_df)


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
    print("step 1")
    close_prices = get_all_close_prices()
    
    print("step 2")
    returns = get_all_returns(close_prices)
    
    print("step 3")
    returns = convert_to_long_records(returns, metric=RETURNS)    

    print("step 4")
    best_aic_per_ticker = obtain_best_aic_per_ticker(returns)

    print("step 5")
    save_best_distribution_summary_statistics(best_aic_per_ticker)
    


if __name__ == "__main__":
    main()

