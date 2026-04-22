# RAG 系统快速开始

## 1. 安装依赖

```bash
pip install -e .
```

这会安装包括 `langchain-chroma` 和 `langchain-text-splitters` 在内的所有依赖。

## 2. 设置 API Key

```bash
# 使用 Google Embeddings（推荐，与主 LLM 同一家）
export GOOGLE_API_KEY=your_google_api_key

# 或使用 OpenAI Embeddings
export OPENAI_API_KEY=your_openai_api_key
export RAG_EMBEDDING_PROVIDER=openai
```

## 3. 构建索引

项目已包含示例知识文档：

- `data/rag/knowledge/options/iv_crush_guide.txt` - IV Crush 详解
- `data/rag/knowledge/options/greeks_guide.txt` - Greeks 实战指南  
- `data/rag/knowledge/crypto/dcd_complete_guide.txt` - 双币赢完全指南

运行索引构建：

```bash
python scripts/build_rag_index.py
```

预期输出：

```
2026-04-13 10:00:00 [INFO] ============================================================
2026-04-13 10:00:00 [INFO] Indexing options knowledge...
2026-04-13 10:00:00 [INFO] ============================================================
2026-04-13 10:00:05 [INFO] Loaded 2 documents from data/rag/knowledge/options
2026-04-13 10:00:05 [INFO] Created 15 chunks from 2 documents
2026-04-13 10:00:10 [INFO] Ingested 15 chunks into vector store (collection: thetalab_knowledge, domain: options)
2026-04-13 10:00:10 [INFO] ============================================================
2026-04-13 10:00:10 [INFO] Indexing crypto knowledge...
2026-04-13 10:00:10 [INFO] ============================================================
2026-04-13 10:00:15 [INFO] Loaded 1 documents from data/rag/knowledge/crypto
2026-04-13 10:00:15 [INFO] Created 12 chunks from 1 documents
2026-04-13 10:00:20 [INFO] Ingested 12 chunks into vector store (collection: thetalab_knowledge, domain: crypto)
2026-04-13 10:00:20 [INFO] ============================================================
2026-04-13 10:00:20 [INFO] RAG index build complete!
2026-04-13 10:00:20 [INFO] ============================================================
```

## 4. 测试检索

在 Python 中测试：

```python
from backend.rag import get_retriever

# 测试检索 Options 知识
retriever = get_retriever(k=2, filter={"domain": "options"})
docs = retriever.invoke("什么是 IV Crush？")

for i, doc in enumerate(docs, 1):
    print(f"\n=== 检索结果 {i} ===")
    print(f"来源：{doc.metadata.get('source')}")
    print(f"内容：{doc.page_content[:200]}...")
```

## 5. 启动服务测试

```bash
# 启动后端
python -m backend.app

# 在聊天界面问
# "什么是 IV Crush？会影响我的 Sell Put 吗？"
# "双币赢的风险是什么？"
```

Agent 会自动调用 `search_options_knowledge` 或 `search_crypto_knowledge` 工具检索相关知识。

## 6. 添加自己的知识

1. 在对应目录创建 `.txt` 文件：

```bash
# 期权知识
echo "你的期权知识内容..." > data/rag/knowledge/options/my_strategy.txt

# 加密货币知识
echo "你的加密货币知识..." > data/rag/knowledge/crypto/my_guide.txt
```

2. 重新构建索引：

```bash
python scripts/build_rag_index.py
```

3. 测试新知识是否可检索

## 故障排查

### 问题：`ModuleNotFoundError: No module named 'chromadb'`

```bash
pip install chromadb
```

### 问题：索引构建时报 API 错误

检查 API Key 是否正确设置：

```bash
echo $GOOGLE_API_KEY
# 或
echo $OPENAI_API_KEY
```

### 问题：Agent 不调用检索工具

- 确保问题明确需要知识（包含「什么是」「为什么」「怎么做」等）
- 检查向量库是否有数据（查看 `data/rag/chroma/` 目录）

## 更多文档

- 完整架构说明：[`docs/rag-system.md`](../docs/rag-system.md)
- 知识库使用指南：[`data/rag/knowledge/README.md`](README.md)
