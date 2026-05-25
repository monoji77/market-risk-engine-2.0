from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes.market import router as market_router

app = FastAPI(title="Market Risk Engine API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(market_router)


@app.get("/api/health")
def health_check():
    return {"status": "ok"}