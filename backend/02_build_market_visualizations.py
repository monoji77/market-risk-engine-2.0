############################
#
# [1] IMPORT LIBRARY
#
############################
import pandas as pd
from utils.utils import PARENT_DIR,  DATA_PATH, TICKERS
import numpy as np

############################
#
# [2] GLOBAL VARIABLES
#
############################

ARTIFACTS_PATH = PARENT_DIR / 'artifacts'
MARKET_PATH = ARTIFACTS_PATH / 'market_visualizations.json'

CLOSE = 'Close'
DATE = 'Date'
TICKER = 'Ticker'
METRIC = 'Metric'
RETURNS = 'Returns'
LOG_RETURNS = 'Log_Returns'
METRICS = ['Close', 'Returns', 'Log_Returns']
############################
#
# [2] HELPER FUNCTIONs
#
############################

def get_all_close_prices() -> pd.DataFrame: 
    """
    Build market visualizations using the close prices of the specified tickers.
    """
    def load_close_prices(ticker: str) -> pd.Series:
        """
        Load the close price for a given ticker from the corresponding CSV file.
        """
        ticker_data = pd.read_csv(f'{DATA_PATH}/{ticker}.csv', index_col=0, parse_dates=True)
        close = ticker_data[CLOSE]
        close.name = ticker
        close.index.name = DATE
        return close
    # Load close prices for all tickers and concatenate them into a single DataFrame
    combined_data = [load_close_prices(ticker) for ticker in TICKERS]
    close_prices = (
        pd.concat(combined_data, axis=1)
            .sort_index()
            .reset_index()
            .melt(id_vars=DATE, var_name=TICKER, value_name=CLOSE)
    )
    close_prices[DATE] = close_prices[DATE].dt.strftime("%Y-%m-%d")
    return close_prices    

def convert_to_frontend_json(close_prices: pd.DataFrame) -> None:
    pct_change = close_prices[CLOSE].pct_change()
    close_returns = close_prices.copy()
    close_returns[CLOSE] = pct_change

    log_returns = np.log(close_prices[CLOSE]/close_prices[CLOSE].shift(1))
    close_log_returns = close_prices.copy()
    close_log_returns[CLOSE] = log_returns
    
    close_prices[METRIC] = CLOSE
    close_returns[METRIC] = RETURNS
    close_log_returns[METRIC] = LOG_RETURNS
    output = {
        "tickers": TICKERS,
        "metrics": METRICS,
        "start_date": close_prices[DATE].min(),
        "end_date": close_prices[DATE].max(),
        "data": (
            close_prices.to_dict(orient='records'),
            close_returns.to_dict(orient='records'),
            close_log_returns.to_dict(orient='records')
        )
    }

    pd.Series([output]).to_json(
        MARKET_PATH,
        orient='records',
        indent=2
    )

############################
#
# [3] MAIN FUNCTION
#
############################
def main() -> None:
    """
    Main function to download historical stock data for specified tickers and save them as CSV files.
    """
    close_prices = get_all_close_prices()
    convert_to_frontend_json(close_prices)
############################
#
# [4] RUN MAIN FUNCTION
#
############################
if __name__ == "__main__":
    main()