#####################
#
# [0] IMPORT LIBRARIES
#
#####################
import pandas as pd
from pathlib import Path

#####################
#
# [1] SHARED VARIABLES
#
#####################
PARENT_DIR = Path(__file__).parent.parent
DATA_PATH = PARENT_DIR / 'data'
ARTIFACTS_PATH = PARENT_DIR / "artifacts"
TICKERS = [
    # Interested stocks
    'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 

    # Market proxy
    'SPY',
]
TICKER = "ticker"
VALUE = "value"
METRIC = "metric"
RETURNS = "returns"
LOG_RETURNS = "log_returns"
TODAY = pd.Timestamp.today().strftime('%Y-%m-%d')
DATE = "Date"
CLOSE = "Close"
#####################
#
# [2] SHARED FUNCTIONS
#
#####################
def get_all_close_prices() -> pd.DataFrame:
    """
    Load close prices for all tickers and return a wide DataFrame.

    Output shape:
    Date        AAPL     MSFT     GOOGL    AMZN     TSLA     SPY
    2001-01-02  0.22     ...      ...      ...      ...      ...
    """

    def load_close_prices(ticker: str) -> pd.Series:
        file_path = DATA_PATH / f"{ticker}.csv"

        ticker_data = pd.read_csv(
            file_path,
            index_col=0,
            parse_dates=True
        )

        close = ticker_data[CLOSE].copy()
        close.name = ticker
        close.index.name = DATE

        return close

    combined_data = [load_close_prices(ticker) for ticker in TICKERS]

    close_prices = (
        pd.concat(combined_data, axis=1)
        .sort_index()
    )

    close_prices.index.name = DATE

    return close_prices

def convert_to_long_records(df: pd.DataFrame, metric: str) -> list[dict]:
    """
    Convert wide DataFrame into long records.
    """

    long_df = (
        df.reset_index()
        .melt(
            id_vars=DATE,
            var_name=TICKER,
            value_name=VALUE
        )
        .dropna(subset=[VALUE])
    )

    long_df[DATE] = long_df[DATE].dt.strftime("%Y-%m-%d")
    long_df[METRIC] = metric

    return long_df[[DATE, TICKER, METRIC, VALUE]]
