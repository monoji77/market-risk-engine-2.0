from __future__ import annotations

import json
import os
from functools import lru_cache
from io import StringIO
from pathlib import Path
from typing import Any

import pandas as pd
from azure.core.exceptions import ResourceNotFoundError
from azure.identity import DefaultAzureCredential
from azure.storage.blob import BlobServiceClient, ContentSettings
from dotenv import load_dotenv


REPO_ROOT = Path(__file__).resolve().parents[2]

RAW_PRICE_PREFIX = "raw_price"
DISTRIBUTION_PREFIX = "distribution"
MARKET_TICKERS_PREFIX = "tickers"
ADVANCED_METRICS_PREFIX = "advanced_metrics"
MARKET_CATALOG_BLOB = "market_catalog.json"
SP500_CACHE_BLOB = "sp500_constituents_cache.csv"

load_dotenv(REPO_ROOT / ".env")


def get_optional_env_var(name: str) -> str | None:
    value = os.getenv(name)

    if value is None:
        return None

    normalized_value = value.strip()

    return normalized_value or None


def require_env_var(name: str) -> str:
    value = get_optional_env_var(name)

    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")

    return value


def get_raw_container_name() -> str:
    return require_env_var("AZURE_STORAGE_CONTAINER_RAW")


def get_artifacts_container_name() -> str:
    return require_env_var("AZURE_STORAGE_CONTAINER_ARTIFACTS")


def get_cache_container_name() -> str:
    return get_optional_env_var("AZURE_STORAGE_CONTAINER_CACHE") or get_artifacts_container_name()


def get_storage_mode_label() -> str:
    return "azure-blob"


@lru_cache(maxsize=1)
def get_blob_service_client() -> BlobServiceClient:
    connection_string = get_optional_env_var("AZURE_STORAGE_CONNECTION_STRING")

    if connection_string:
        return BlobServiceClient.from_connection_string(connection_string)

    sas_token = get_optional_env_var("AZURE_STORAGE_SAS_TOKEN")
    account_name = require_env_var("AZURE_STORAGE_ACCOUNT_NAME")
    account_url = f"https://{account_name}.blob.core.windows.net"

    if sas_token:
        return BlobServiceClient(
            account_url=account_url,
            credential=sas_token.lstrip("?"),
        )

    credential = DefaultAzureCredential()

    return BlobServiceClient(account_url=account_url, credential=credential)


def upload_text_blob(
    container_name: str,
    blob_name: str,
    text: str,
    *,
    content_type: str,
) -> None:
    blob_client = get_blob_service_client().get_blob_client(
        container=container_name,
        blob=blob_name,
    )
    blob_client.upload_blob(
        text.encode("utf-8"),
        overwrite=True,
        content_settings=ContentSettings(content_type=content_type),
    )


def download_text_blob(container_name: str, blob_name: str) -> str:
    blob_client = get_blob_service_client().get_blob_client(
        container=container_name,
        blob=blob_name,
    )

    return blob_client.download_blob().readall().decode("utf-8")


def blob_exists(container_name: str, blob_name: str) -> bool:
    blob_client = get_blob_service_client().get_blob_client(
        container=container_name,
        blob=blob_name,
    )

    return blob_client.exists()


def list_blob_names(container_name: str, *, prefix: str) -> list[str]:
    container_client = get_blob_service_client().get_container_client(container_name)

    return sorted(
        blob.name
        for blob in container_client.list_blobs(name_starts_with=prefix)
    )


def write_json_artifact(output: dict[str, Any], artifact_path: str) -> None:
    upload_text_blob(
        container_name=get_artifacts_container_name(),
        blob_name=artifact_path,
        text=json.dumps(output, indent=2, allow_nan=False),
        content_type="application/json",
    )


def read_json_artifact(artifact_path: str) -> dict[str, Any]:
    return json.loads(
        download_text_blob(
            container_name=get_artifacts_container_name(),
            blob_name=artifact_path,
        )
    )


def artifact_exists(artifact_path: str) -> bool:
    return blob_exists(get_artifacts_container_name(), artifact_path)


def write_market_catalog_payload(output: dict[str, Any]) -> None:
    write_json_artifact(output, MARKET_CATALOG_BLOB)


def read_market_catalog_payload() -> dict[str, Any]:
    return read_json_artifact(MARKET_CATALOG_BLOB)


def write_market_ticker_payload(ticker_filename: str, output: dict[str, Any]) -> None:
    write_json_artifact(output, f"{MARKET_TICKERS_PREFIX}/{ticker_filename}")


def read_market_ticker_payload(ticker_filename: str) -> dict[str, Any]:
    return read_json_artifact(f"{MARKET_TICKERS_PREFIX}/{ticker_filename}")


def write_advanced_metric_payload(ticker_filename: str, output: dict[str, Any]) -> None:
    write_json_artifact(output, f"{ADVANCED_METRICS_PREFIX}/{ticker_filename}")


def read_advanced_metric_payload_if_exists(ticker_filename: str) -> dict[str, Any] | None:
    relative_path = f"{ADVANCED_METRICS_PREFIX}/{ticker_filename}"

    if not artifact_exists(relative_path):
        return None

    return read_json_artifact(relative_path)


def write_raw_price_csv(ticker: str, ticker_data: pd.DataFrame) -> None:
    csv_buffer = StringIO()
    ticker_data.to_csv(csv_buffer, index=True)

    upload_text_blob(
        container_name=get_raw_container_name(),
        blob_name=f"{RAW_PRICE_PREFIX}/{ticker}.csv",
        text=csv_buffer.getvalue(),
        content_type="text/csv",
    )


def read_raw_price_csv(ticker: str) -> pd.DataFrame:
    csv_text = download_text_blob(
        container_name=get_raw_container_name(),
        blob_name=f"{RAW_PRICE_PREFIX}/{ticker}.csv",
    )

    return pd.read_csv(
        StringIO(csv_text),
        index_col=0,
        parse_dates=True,
    )


def list_available_tickers_from_storage() -> list[str]:
    blob_names = list_blob_names(
        get_raw_container_name(),
        prefix=f"{RAW_PRICE_PREFIX}/",
    )

    return sorted(
        Path(blob_name).stem
        for blob_name in blob_names
        if blob_name.endswith(".csv")
    )


def write_sp500_constituents_cache(sp500_df: pd.DataFrame) -> None:
    csv_buffer = StringIO()
    sp500_df.to_csv(csv_buffer, index=False)

    upload_text_blob(
        container_name=get_cache_container_name(),
        blob_name=SP500_CACHE_BLOB,
        text=csv_buffer.getvalue(),
        content_type="text/csv",
    )


def read_sp500_constituents_cache() -> pd.DataFrame | None:
    try:
        csv_text = download_text_blob(
            container_name=get_cache_container_name(),
            blob_name=SP500_CACHE_BLOB,
        )
    except ResourceNotFoundError:
        return None

    return pd.read_csv(StringIO(csv_text))


def write_distribution_csv(filename: str, output_df: pd.DataFrame) -> None:
    csv_buffer = StringIO()
    output_df.to_csv(csv_buffer)

    upload_text_blob(
        container_name=get_artifacts_container_name(),
        blob_name=f"{DISTRIBUTION_PREFIX}/{filename}",
        text=csv_buffer.getvalue(),
        content_type="text/csv",
    )
