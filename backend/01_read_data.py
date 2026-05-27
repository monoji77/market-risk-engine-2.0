############################
#
# [1] IMPORT LIBRARY
#
############################
import yfinance as yf
from utils.utils import DATA_PATH, TICKERS
import pandas as pd 

############################
#
# [2] MAIN FUNCTION
#
############################

def main() -> None:
    """
    Main function to download historical stock data for specified tickers and save them as CSV files.
    """
    # Download historical data for the specified tickers
    END_DATE = (pd.Timestamp.now(tz="Asia/Singapore") + pd.Timedelta(days=1)).strftime("%Y-%m-%d")
    rich_data = yf.download(TICKERS, start='2001-01-01', end=END_DATE)

    # Separate each ticker from MultiIndex columns into individual DataFrames and save as CSV files
    for ticker in TICKERS:
        ticker_data = rich_data.xs(ticker, axis=1, level=1)
        ticker_data = ticker_data.dropna()
        ticker_data.to_csv(f'{DATA_PATH}/{ticker}.csv', index=True)

############################
#
# [3] RUN MAIN FUNCTION
#
############################
if __name__ == "__main__":
    main()