# ThetaLab RAG Knowledge Base

This directory stores domain knowledge for the RAG (Retrieval-Augmented Generation) system.

## Directory Structure

```
knowledge/
├── options/       # Options trading knowledge (Sell Put, Greeks, IV, strategies, etc.)
├── crypto/        # Crypto trading knowledge (DCD, market analysis, trading strategies, etc.)
└── general/       # General investment knowledge
```

## File Format

- **All knowledge documents should be Markdown files (`.md`)**
- Use UTF-8 encoding
- Each document should focus on a specific topic
- Use Markdown features for better structure:
  - Headings (`#`, `##`, `###`)
  - Lists (bullets, numbered)
  - Code blocks for formulas or examples
  - Tables for structured data
  - Bold/italic for emphasis

### Why Markdown?

Markdown is **AI's native language**. Using Markdown provides:

- Better semantic structure (headings, lists, tables)
- Easier parsing and chunking by the RAG system
- More natural retrieval results for LLMs
- Human-readable format for editing and maintenance

## Metadata

When ingested, each document receives metadata:

- `source`: Relative path from this directory
- `filename`: Original filename
- `domain`: One of `options`, `crypto`, or `general`

This metadata enables domain-specific retrieval (e.g., only searching options knowledge when answering options questions).

## Adding New Knowledge

1. Create a new `.md` file in the appropriate domain directory
2. Write clear, structured content using Markdown formatting
3. Run the ingestion script to update the vector index:

```bash
python scripts/build_rag_index.py
```

## Example Documents

### Options
- `sell_put_strategy.md` - Complete Sell Put guide
- `greeks_guide.md` - Greeks explanations
- `iv_crush_guide.md` - IV Crush mechanics
- `volatility_analysis.md` - IV Rank/Percentile, HV, Spread analysis
- `flashalpha_guide.md` - FlashAlpha GEX/DEX/VEX tools
- `options_strategies.md` - All options strategies (spreads, straddles, etc.)

### Crypto
- `dcd_complete_guide.md` - DCD (Dual Investment) complete guide
- `okx_dcd_api_reference.md` - OKX REST DCD endpoints & field mapping (kept in sync with `docs/okx-dcd-api-reference.md`)
- `market_analysis_framework.md` - Multi-dimensional analysis (sentiment, technical, on-chain, fundamental)

### General
- Position sizing principles
- Risk-reward calculations
- Trading psychology

## Writing Guidelines

### Use Clear Headings

```markdown
# Main Topic
## Subtopic
### Specific Concept
```

### Use Lists for Sequential Steps

```markdown
1. Step one
2. Step two
3. Step three
```

### Use Tables for Structured Data

```markdown
| Indicator | Value | Interpretation |
|-----------|-------|----------------|
| IV Rank   | 65%   | High volatility |
| RSI       | 32    | Oversold |
```

### Use Code Blocks for Formulas

````markdown
```
ROIC = Premium / (Strike Price × 100) × 100%
```
````

### Use Bold/Italic for Emphasis

- **Bold** for key terms or warnings
- *Italic* for subtle emphasis
