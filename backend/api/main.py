import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from .routes.market import router as market_router

REPO_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(REPO_ROOT / ".env")

app = FastAPI(title="Market Risk Engine API")


def build_allowed_origins() -> list[str]:
    default_origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
    configured_origins = [
        origin.strip()
        for origin in os.getenv("CORS_ALLOWED_ORIGINS", "").split(",")
        if origin.strip()
    ]

    return default_origins + configured_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=build_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(market_router)


@app.get("/api/health")
def health_check():
    return {"status": "ok"}
