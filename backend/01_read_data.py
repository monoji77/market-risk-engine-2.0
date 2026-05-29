############################
#
# [1] IMPORT LIBRARY
#
############################
import pandas as pd
import yfinance as yf
from tqdm.auto import tqdm

from backend.utils.utils import DATA_PATH, SP500_TICKERS


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
    START_DATE = "2001-01-01"
    END_DATE = (pd.Timestamp.now(tz="Asia/Singapore") + pd.Timedelta(days=1)).strftime("%Y-%m-%d")

    with tqdm(total=2, desc="01_read_data", unit="stage") as progress:
        progress.set_postfix_str("downloading price history")
        rich_data = yf.download(
            SP500_TICKERS,
            start=START_DATE,
            end=END_DATE,
            progress=False,
        )
        progress.update()

        progress.set_postfix_str("saving ticker csv files")

        # Separate each ticker from MultiIndex columns into individual DataFrames and save as CSV files
        for ticker in tqdm(SP500_TICKERS, desc="Saving ticker CSVs", unit="ticker"):
            ticker_data = rich_data.xs(ticker, axis=1, level=1)
            ticker_data = ticker_data.dropna()
            ticker_data.to_csv(f"{DATA_PATH}/{ticker}.csv", index=True)

        progress.update()
    print(f"ALL TICKERS SAVED IN FILEPATH: {DATA_PATH}")
############################
#
# [3] RUN MAIN FUNCTION
#
############################
if __name__ == "__main__":
    main()
