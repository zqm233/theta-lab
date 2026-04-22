# OKX API v5 — Dual Investment (DCD / SFP) — project reference

This file is a **curated, project-local** summary so agents and developers do not need to re-fetch the full OKX documentation site for routine DCD work. It is **not** a full mirror of OKX docs.

**RAG copy:** `data/rag/knowledge/crypto/okx_dcd_api_reference.md` (same content; update both when editing, or re-copy from this file before ingestion).

**Official source (authoritative):** [https://www.okx.com/docs-v5/en/](https://www.okx.com/docs-v5/en/) — search for *Dual investment*, *DCD*, or *finance/sfp/dcd*.

**Last curated:** 2026-04-18 (align with repo changes).

---

## Base URL

- Production: `https://www.okx.com`
- Private REST: HMAC-SHA256 signing with headers `OK-ACCESS-KEY`, `OK-ACCESS-SIGN`, `OK-ACCESS-TIMESTAMP`, `OK-ACCESS-PASSPHRASE`.

---

## Endpoints used by this repo (`backend/data/okx.py`)

| Purpose | Method | Path |
|--------|--------|------|
| Currency pairs | GET | `/api/v5/finance/sfp/dcd/currency-pair` |
| Product list | GET | `/api/v5/finance/sfp/dcd/products` |
| **Active** DCD orders (live positions) | GET | `/api/v5/finance/sfp/dcd/orders` |
| **History** DCD orders | GET | `/api/v5/finance/sfp/dcd/order-history` |

### `order-history` query rules

- Optional query param **`state`**: OKX expects **at most one** value per request. **Do not** send comma-separated lists to OKX.
- Some environments return **HTTP 400** for `state=filled` on this path. The backend therefore prefers **`GET .../order-history?limit=100`** (no `state`), drops **live-like** rows (`live`, `pending`, …), and only if that fails or returns nothing falls back to per-state calls (`expired`, `settled`, `canceled`, `filled`).
- App route: **`GET /api/v1/okx/dcd/orders/history`** wraps the above.

### Product id shape (heuristic in code)

`productId` often looks like: `BTC-USDT-<...>-<strike>-C|P` — last segment **`P`** = buy low (put-style), **`C`** = sell high (call-style). **Quote** currency is often the second segment (e.g. `USDT`).

---

## Order payload — field mapping notes

OKX field names **differ** between `/dcd/orders` (active) and `/dcd/order-history`, and between **put (低买)** vs **call (高卖)** rows.

### 高卖 (Call / `C`)

- **总投入（UI）** = 卖出的 **标的币数量（base，如 BTC）**。不会把 `notionalSz`+**USDT** 误当作这笔「卖出 BTC」的本金。
- 解析顺序：`notionalSz`+`notionalCcy==base` → `baseSz`/`baseCcy` → `sz`+（`ccy` 为空或 base）→ `frozeSz` / `ordSz` / `accFillSz` 等按 **base** 计。
- **预期收益（UI）**：优先 **`absYield`**（订单维度绝对收益，多为 BTC）；否则带 **`interestCcy`** 的 `estimatedInterest` / `interest` 等且币种为 base；再否则在已有 **BTC 本金** 时用 `本金 × APR × (天数/365)` 估算 BTC。

### 低买 (Put / `P`)

- 本金多在 **报价币**：`quoteSz`+`quoteCcy`、`notionalSz`+`notionalCcy` 等。
- 预期收益币种多为 **USDT**（或 `interestCcy` / 本金币种）。

If no non-zero **base** size is found for a high-sell row, the API still sets **`investUnknown: true`** so the UI can show **—**.

Other interest keys: `estInterest`, `preInterest`, `settleInterest`.

---

## Updating this document

When OKX changes response shapes:

1. Capture a **redacted** sample JSON from `/dcd/orders` and `/dcd/order-history` (remove keys).
2. Update the table and field list above.
3. Adjust `_dcd_invest_amount_and_ccy` in `backend/data/okx.py` if new keys appear.
