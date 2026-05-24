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
TICKERS = [
    # Interested stocks
    'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 

    # Market proxy
    'SPY',
]
TODAY = pd.Timestamp.today().strftime('%Y-%m-%d')

