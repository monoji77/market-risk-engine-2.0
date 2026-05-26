# Market Risk Engine 2.0

`market_risk_2.0` is a follow-on build from [`Monoji77/market_risk_engine`](https://github.com/Monoji77/market_risk_engine), with the architecture redesigned around a dedicated analytics backend and a faster audience-facing frontend.

The earlier Streamlit setup was useful for rapid prototyping, but it mixed analytics, page rendering, and interaction into one layer. This version separates those concerns:

- the backend prepares market and risk artifacts
- the frontend consumes those artifacts through a React + TypeScript + Vite interface
- the overall goal is faster rendering, cleaner iteration, and a better foundation for richer market risk tooling

## What This Project Is For

The intent is to build a market risk platform that can move from raw return visualizations into more serious portfolio and risk analytics, while still feeling responsive from a frontend user perspective.

Current frontend work focuses on:

- close price visualization
- close returns visualization
- close log-returns visualization
- interactive exploration of visible price history, peaks, troughs, and year-to-date movement

## Risk Analytics Direction

This repository is being extended beyond market charts into a broader set of risk measures and performance diagnostics. Planned and in-progress measures include:

- drawdown
- maximum drawdown
- historical VaR
- historical expected shortfall (historical ES)
- CAGR
- realized return distributions
- rolling volatility
- downside risk measures
- stress testing outputs
- comparative portfolio risk diagnostics

The broader objective is to turn the current visualization layer into a surface for inspecting both market behavior and portfolio risk characteristics.

## Current Architecture

### Backend

The backend is responsible for:

- reading and transforming market data
- producing frontend-ready JSON artifacts
- serving those artifacts to the frontend
- acting as the analytics layer for upcoming risk measures

### Frontend

The frontend is responsible for:

- rendering fast, interactive market visualizations
- exposing clean controls for asset and series selection
- supporting richer user interaction than the previous Streamlit UI allowed
- providing a base for future risk dashboards

## Project Structure

- `backend/`: analytics scripts, artifact generation, API layer, and risk computations
- `backend/artifacts/`: generated market and risk payloads for frontend use
- `frontend/`: React + TypeScript + Vite application

## Public Deployment

For an employer-facing public link, deploy the frontend as a static site and treat the generated market JSON as a build artifact that is checked into the repo.

- `backend/02_build_market_visualizations.py` now writes to both `backend/artifacts/market_visualizations.json` and `frontend/public/market_visualizations.json`
- the frontend reads `frontend/public/market_visualizations.json` by default
- if you want to point the frontend at a live API instead, set `VITE_API_BASE_URL`

### Recommended Setup: Vercel

1. Push the repository to GitHub.
2. In Vercel, import the repository.
3. Set the project root directory to `frontend`.
4. Keep the default Vite build settings:
   - Build command: `npm run build`
   - Output directory: `dist`
5. Deploy and use the generated `*.vercel.app` URL on your resume, LinkedIn, or applications.
6. Optional: attach a custom domain for a cleaner public link.

Because the repo already includes a scheduled GitHub Action that refreshes market data, each data update can also update `frontend/public/market_visualizations.json`, which keeps the deployed frontend current without requiring a live backend service.

### Local Development

- frontend only: run the Vite app from `frontend/` and it will use the checked-in static JSON file
- frontend + backend API: set `VITE_API_BASE_URL` and run the FastAPI app separately if you want to test the split architecture locally

## Near-Term Roadmap

Near-term work is centered on:

- expanding the visualization layer from prices into risk measures
- integrating drawdown and tail-risk views
- surfacing historical VaR and historical ES clearly in the frontend
- adding CAGR and related performance diagnostics
- building a cleaner pipeline from analytics generation to frontend rendering

## Design Goal

The core design goal is not just to calculate risk metrics, but to make them explorable. This project is being structured so that computational work lives in the backend and the frontend can stay focused on presentation, interaction, and speed.
