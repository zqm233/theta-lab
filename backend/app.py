"""FastAPI application for the Option Intelligence Research Agent."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api.routes import router
from backend.db import close_db, init_db

load_dotenv()

logging.basicConfig(level=logging.INFO)

_agent = None


def get_agent():
    """Lazy-initialise and return the singleton ThetaLabAgent."""
    global _agent
    if _agent is None:
        from backend.agent.agent import ThetaLabAgent
        _agent = ThetaLabAgent()
    return _agent


def reset_agent():
    """Close the current agent and force re-creation on next access."""
    global _agent
    if _agent is not None:
        _agent.close()
        _agent = None


@asynccontextmanager
async def lifespan(application: FastAPI):
    init_db()

    from backend.agent.mcp_tools import init_mcp_tools
    await init_mcp_tools()

    try:
        get_agent()
        logging.getLogger(__name__).info("ThetaLab agent initialised")
    except ValueError as e:
        logging.getLogger(__name__).warning("Agent not initialised: %s", e)
    yield
    if _agent is not None:
        _agent.close()
    close_db()


app = FastAPI(
    title="ThetaLab",
    description="AI-powered options selling assistant — Sell Put & Sell Call theta strategies",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/")
def health():
    return {"status": "ok", "service": "ThetaLab", "version": "0.2.0"}


def main():
    uvicorn.run("backend.app:app", host="0.0.0.0", port=8000, reload=True)


if __name__ == "__main__":
    main()
