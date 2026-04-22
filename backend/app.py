"""FastAPI application for the Option Intelligence Research Agent."""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

import certifi
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api.routes import router
from backend.api.routes_v1 import router as router_v1
from backend.db import close_db, init_db

load_dotenv(override=True)

# Fix macOS SSL cert issue for aiohttp (used by ChatNVIDIA)
os.environ.setdefault("SSL_CERT_FILE", certifi.where())

logging.basicConfig(level=logging.INFO)

_agent = None


async def get_agent():
    """Lazy-initialise and return the singleton ThetaLabAgent."""
    global _agent
    if _agent is None:
        from backend.agent.agent import ThetaLabAgent
        from backend.agent.persistence import create_checkpointer, create_store

        store = create_store()
        checkpointer = await create_checkpointer()
        _agent = ThetaLabAgent(store=store, checkpointer=checkpointer)
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
        agent = await get_agent()
        logging.getLogger(__name__).info("ThetaLab agent initialised")

        from backend.a2a import create_a2a_app

        a2a_sub = create_a2a_app(agent)
        application.mount("/a2a", a2a_sub)
        logging.getLogger(__name__).info(
            "A2A endpoint mounted at /a2a  "
            "(AgentCard: /a2a/.well-known/agent-card.json)"
        )
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

app.include_router(router)  # Legacy API (deprecated after 3 months)
app.include_router(router_v1)  # v1 RESTful API


@app.get("/")
def health():
    return {"status": "ok", "service": "ThetaLab", "version": "0.2.0"}


def main():
    uvicorn.run(
        "backend.app:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        reload_excludes=[
            "data/rag/**",
            "data/*.db*",
            "**/__pycache__/**",
            "**/.pytest_cache/**",
        ],
    )


if __name__ == "__main__":
    main()
