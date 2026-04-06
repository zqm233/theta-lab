"""Pydantic request/response models for all API endpoints."""

from __future__ import annotations

from pydantic import BaseModel


class PositionQuoteRequest(BaseModel):
    ticker: str
    expiration: str
    strike: float
    type: str
    id: str


class CloseTradeRequest(BaseModel):
    id: str
    ticker: str
    type: str
    side: str
    strike: float
    qty: int
    entry_price: float
    exit_price: float
    expiration: str
    opened_at: str


class CreateAccountRequest(BaseModel):
    name: str
    platform: str
    broker: str = ""
    currency: str = "USD"
    notes: str = ""


class UpdateAccountRequest(BaseModel):
    name: str | None = None
    platform: str | None = None
    broker: str | None = None
    currency: str | None = None
    notes: str | None = None


class CreateHoldingRequest(BaseModel):
    account_id: str
    asset_type: str
    ticker: str
    side: str = "long"
    qty: float
    avg_cost: float = 0
    current_price: float | None = None
    notes: str = ""
    option_type: str | None = None
    strike: float | None = None
    expiration: str | None = None


class UpdateHoldingRequest(BaseModel):
    qty: float | None = None
    avg_cost: float | None = None
    current_price: float | None = None
    side: str | None = None
    notes: str | None = None
    ticker: str | None = None


class ChatRequest(BaseModel):
    message: str
    thread_id: str | None = None
    user_id: str = "default"


class ConfirmRequest(BaseModel):
    thread_id: str
    approved: bool
    user_id: str = "default"


class LLMConfigRequest(BaseModel):
    provider: str
    model: str = ""
    apiKey: str = ""
    baseUrl: str = ""


class OkxMcpConfigRequest(BaseModel):
    access: str = "readonly"


class FlashAlphaConfigRequest(BaseModel):
    apiKey: str


class CmcMcpConfigRequest(BaseModel):
    apiKey: str


class LangSmithConfigRequest(BaseModel):
    apiKey: str
