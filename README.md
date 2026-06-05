# Market Risk Engine 2.0

![Market Risk Engine 2.0 thumbnail](assets/market_risk_engine_2_0_demo.gif)

![React](https://img.shields.io/badge/React-19-20232A?logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.136-009688?logo=fastapi&logoColor=white)
![Pandas](https://img.shields.io/badge/Pandas-3.0-150458?logo=pandas&logoColor=white)
![NumPy](https://img.shields.io/badge/NumPy-2.4-013243?logo=numpy&logoColor=white)
![GitHub Actions](https://img.shields.io/badge/GitHub_Actions-Scheduled-2088FF?logo=githubactions&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-Deployed-000000?logo=vercel&logoColor=white)
![Live Site](https://img.shields.io/badge/Live-market--risk--engine--2--0.vercel.app-0A66C2?logo=googlechrome&logoColor=white)

## Overview

This repository contains the source code for a market risk platform that combines a Python analytics pipeline with a React + TypeScript frontend for interactive market and risk visualization.

`market_risk_2.0` is a follow-on build from [`Monoji77/market_risk_engine`](https://github.com/Monoji77/market_risk_engine), with the architecture redesigned around:

- a Blob-backed analytics pipeline for scheduled data preparation
- a faster frontend for interactive charting and exploration
- a hybrid deployment path where the frontend can read generated JSON directly from Azure Blob Storage

Live site: [market-risk-engine-2-0.vercel.app](https://market-risk-engine-2-0.vercel.app/)

## Project Structure

```text
.
├── .github/
│   └── workflows/
│       └── daily-finance-data.yml   # Scheduled market data refresh workflow
├── assets/
│   └── thumbnail.png                # Repository thumbnail
├── backend/
│   ├── api/                         # FastAPI application and routes
│   ├── utils/                       # Shared backend helpers
│   ├── 01_read_data.py              # Yahoo Finance data download script
│   ├── 02_build_market_visualizations.py  # Market + drawdown artifact builder
│   ├── 03_calculate_other_risk_measures.py # Advanced metrics artifact builder
│   └── 04_garch_1_1_market_volatility.py  # GARCH volatility + distribution artifact builder
├── frontend/
│   ├── public/                      # Frontend static assets like favicon/icons
│   ├── src/
│   │   ├── assets/                   # Frontend images
│   │   ├── components/               # Charts and reusable UI
│   │   ├── lib/                      # Data loading / transformation
│   │   ├── types/                    # Shared frontend types
│   │   ├── App.tsx                   # Main application shell
│   │   └── main.tsx                  # Frontend entry point
│   ├── package.json                  # Frontend scripts and dependencies
│   └── vite.config.ts                # Vite configuration
├── requirements.txt                  # Pinned Python dependencies
└── README.md
```

## Key Features

- Overview and Advanced workflows inside a single market risk interface
- Interactive market visualizations for close price, close returns, and close log-returns
- Drawdown chart linked to the same visible range as the main market chart
- Daily short term volatility chart with synchronized zoom, crosshair linking, and peak/trough annotations
- GARCH (1, 1) volatility chart sourced from Azure-backed advanced metrics with per-ticker best-fit return distributions
- EWMA volatility chart and risk card with frontend lambda controls, including `Long term (0.94)`, `Short term (0.30)`, and custom slider input
- Summary cards for net move, drawdown, daily short term volatility, GARCH (1, 1) volatility, and EWMA volatility, including crosshair-driven updates
- Distribution summary CSV artifacts written to Azure Blob Storage for best-fit GARCH return-distribution selection
- 95% confidence range interpretation for daily volatility under normal market conditions
- Asset and series switching with frontend-side buffering and transition effects
- Market catalog entries include ticker-level `security` metadata so the frontend can show descriptive asset names directly from generated JSON
- Azure Blob-backed raw-price CSVs, catalog JSON, per-ticker market payloads, and advanced metrics payloads
- Frontend support for direct Azure Blob reads with an optional FastAPI API fallback for local or private deployments
- Scheduled GitHub Actions workflow to refresh market data and write updated outputs to Azure Blob Storage

## EWMA Volatility

The Advanced view includes an Exponentially Weighted Moving Average (EWMA) volatility series. The implementation follows the recursive variance update:

```text
sigma_t^2 = lambda * sigma_{t-1}^2 + (1 - lambda) * R_{t-1}^2
```

Where:

- `lambda` controls how quickly past information decays
- higher `lambda` values retain longer memory and produce a smoother volatility path
- lower `lambda` values react faster to recent return shocks

In the current frontend, users can:

- switch between predefined `Long term` and `Short term` lambda presets
- fine-tune `lambda` directly from the EWMA risk card with a horizontal slider
- compare the EWMA curve against the other synchronized Advanced charts under the same visible window and crosshair date

## Tech Stack

### Frontend

- React 19
- TypeScript 6
- Vite 8
- Framer Motion
- Motion
- Lightweight Charts
- Radix UI Tooltip
- Custom CSS

### Backend

- Python 3.12
- FastAPI
- Pandas
- NumPy
- yfinance

### Tooling and Deployment

- ESLint
- GitHub Actions
- Vercel

## Getting Started

### Prerequisites

- Node.js
- npm
- Python 3.12

### Run Locally

```bash
python -m pip install -r requirements.txt

python -m backend.01_read_data
python -m backend.02_build_market_visualizations
python -m backend.03_calculate_other_risk_measures
python -m backend.04_garch_1_1_market_volatility

cd frontend
npm install
npm run dev
```

Azure Blob Storage is the only supported runtime data store. Before running the scripts, set:

- `AZURE_STORAGE_CONNECTION_STRING` or `AZURE_STORAGE_SAS_TOKEN` with `AZURE_STORAGE_ACCOUNT_NAME`
- `AZURE_STORAGE_CONTAINER_RAW`
- `AZURE_STORAGE_CONTAINER_ARTIFACTS`
- `AZURE_STORAGE_CONTAINER_CACHE` optional

For frontend runtime access, choose one of these modes:

- Preferred production mode: set `VITE_AZURE_BLOB_ARTIFACTS_URL` to the full Azure Blob artifacts container URL. This can be a public container URL or a container URL with a read-only SAS query string.
- Optional development/private mode: run the FastAPI backend and use `VITE_API_BASE_URL` or Vite's `/api` proxy.

When using direct browser-to-Blob reads, make sure Azure Blob CORS allows your frontend origin for `GET`, `HEAD`, and `OPTIONS`.

### Optional Backend API

```bash
uvicorn api.main:app --reload --app-dir backend
```

The frontend prefers `VITE_AZURE_BLOB_ARTIFACTS_URL` when it is set. If it is not set, it falls back to the FastAPI backend. For local development, you can rely on Vite's `/api` proxy or set `VITE_API_BASE_URL` to your backend origin, for example `http://127.0.0.1:8000`. If your backend is hosted separately, add its frontend origin to `CORS_ALLOWED_ORIGINS`.

## Available Commands

| Command | Description |
| --- | --- |
| `cd frontend && npm run dev` | Starts the Vite development server |
| `cd frontend && npm run build` | Runs TypeScript build checks and creates the production build in `frontend/dist/` |
| `cd frontend && npm run lint` | Runs ESLint across the frontend |
| `cd frontend && npm run preview` | Serves the production frontend build locally |
| `python -m backend.01_read_data` | Downloads and refreshes source market CSVs into Azure Blob Storage |
| `python -m backend.02_build_market_visualizations` | Builds market catalog plus per-ticker market and drawdown JSON artifacts in Azure Blob Storage |
| `python -m backend.03_calculate_other_risk_measures` | Builds per-ticker advanced risk metrics artifacts in Azure Blob Storage |
| `python -m backend.04_garch_1_1_market_volatility` | Adds GARCH (1, 1) volatility and distribution summary artifacts in Azure Blob Storage |
| `uvicorn api.main:app --reload --app-dir backend` | Runs the optional FastAPI backend locally |

## Deployment

Production frontend assets are generated with:

```bash
cd frontend
npm run build
```

This repository currently supports:

- Vercel for the live frontend deployment
- GitHub Actions for scheduled market data refreshes

The daily workflow in `.github/workflows/daily-finance-data.yml` refreshes source data and writes updated outputs directly to Azure Blob Storage.

For a frontend-only production deployment, set `VITE_AZURE_BLOB_ARTIFACTS_URL` in Vercel to the Azure Blob artifacts container URL and redeploy. The frontend will then read `market_catalog.json`, `tickers/*.json`, and `advanced_metrics/*.json` directly from Blob Storage without requiring an active FastAPI deployment.

It now runs the data scripts as Python modules:

```bash
python -m backend.01_read_data
python -m backend.02_build_market_visualizations
python -m backend.03_calculate_other_risk_measures
python -m backend.04_garch_1_1_market_volatility
```

That matters because the backend scripts import `backend.utils.utils`; invoking them as modules keeps the import path stable on GitHub runners and local machines. As long as the runner can reach Yahoo Finance, the S&P 500 constituents source, and the configured Azure Storage account, GitHub Actions will repopulate the Blob-backed CSV and JSON payloads, including the catalog fields used for ticker descriptions such as `security`.

## Future Work

The current UI still marks the following items as `TO BE IMPLEMENTED`:

- Extend the advanced metrics pipeline in `backend/03_calculate_other_risk_measures.py` with a broader library of production-style risk measures
- Historical VaR using a rolling historical window for daily VaR estimation
- Historical ES using the same historical loss distribution as the VaR window
- Historical VaR / ES visualization cards and charts inside the Advanced workflow
- VaR / ES backtesting to compare realized breaches against model expectations
- Additional stress testing and scenario-analysis modules for concentrated market shocks
- CAGR and other longer-horizon performance and risk-adjusted return metrics
- Portfolio Lab for building custom portfolios inside the application
- Automated portfolio risk measures for the upcoming portfolio workflow
