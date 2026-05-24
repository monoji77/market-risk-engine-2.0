# Market Risk Engine 2.0

`market_risk_2.0` is being built as a stronger follow-on to [`Monoji77/market_risk_engine`](https://github.com/Monoji77/market_risk_engine). The main goal is to improve the project architecture so audience-facing visualizations render much faster than they did in the earlier Streamlit-based setup, where query and page rendering times were too slow for a smoother frontend experience.

This version separates the data/visualization backend from the presentation layer. Instead of relying on Streamlit to handle both analytics and UI delivery, the backend prepares frontend-ready market visualization artifacts that can be consumed by a dedicated web client.

## Current Status

The backend for basic market visualizations is currently complete. It reads market data, transforms close prices into visualization-friendly formats, and exports JSON artifacts for frontend consumption.

Frontend work is being prepared in parallel using React, TypeScript, and Vite. The intent is to use that stack to showcase the backend visualizations through a faster, more responsive interface than the previous architecture allowed.

## Project Structure

- `backend/`: market data processing and visualization artifact generation
- `frontend/`: React + TypeScript + Vite application for audience-facing visualizations

## Direction

This project is focused on:

- reducing rendering and query latency for frontend users
- decoupling analytics generation from UI delivery
- creating a cleaner path for scaling market risk dashboards and visualizations
