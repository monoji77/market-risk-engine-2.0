import os
from io import StringIO

import pandas as pd
from dotenv import load_dotenv
from azure.storage.blob import BlobServiceClient

load_dotenv(override=True)

connection_string = os.getenv("AZURE_STORAGE_CONNECTION_STRING")

blob_service_client = BlobServiceClient.from_connection_string(connection_string)

blob_client = blob_service_client.get_blob_client(
    container="raw",
    blob="raw_prices/AAPL.csv",
)

csv_text = blob_client.download_blob().readall().decode("utf-8")

df = pd.read_csv(StringIO(csv_text))

print(df.head())