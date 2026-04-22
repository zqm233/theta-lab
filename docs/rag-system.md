# ThetaLab RAG Knowledge System

完整的 RAG（检索增强生成）知识系统实现文档。

## 架构概览

RAG 系统采用**工厂模式 + 可配置后端**设计，与项目现有的 `persistence/` 模块保持一致的架构风格。

### 核心组件

```
backend/rag/
├── __init__.py              # 公共 API: get_embeddings(), get_vectorstore(), get_retriever()
├── embeddings.py            # Embeddings 工厂（派发）
├── embeddings_google.py     # Google Generative AI 实现
├── embeddings_openai.py     # OpenAI 实现
├── vectorstore.py           # VectorStore 工厂（派发）
├── vectorstore_chroma.py    # Chroma 本地存储实现
├── vectorstore_pgvector.py  # PostgreSQL pgvector 实现
├── chunking.py              # 文本分块策略
└── ingest.py                # 离线入库逻辑

backend/agent/
└── tools_rag.py             # RAG 检索工具（@tool）

scripts/
└── build_rag_index.py       # 离线索引构建脚本

data/rag/
├── chroma/                  # Chroma 向量数据库持久化
└── knowledge/               # 原始知识文档
    ├── options/             # 期权知识
    ├── crypto/              # 加密货币知识
    └── general/             # 通用投资知识
```

## 环境配置

### 必需环境变量

```bash
# Embedding 供应商 API Key（二选一）
GOOGLE_API_KEY=your_google_api_key      # 使用 Google 时
OPENAI_API_KEY=your_openai_api_key      # 使用 OpenAI 时
```

### 可选环境变量

```bash
# Embedding 供应商选择（默认: google）
RAG_EMBEDDING_PROVIDER=google   # google | openai

# 向量库选择（默认: chroma）
RAG_VECTOR_DB=chroma            # chroma | pgvector

# PostgreSQL 连接（使用 pgvector 时需要）
POSTGRES_URL=postgresql://user:pass@localhost:5432/thetalab
```

## 使用流程

### 1. 准备知识文档

将知识文档（`.txt` 或 `.md`）放入对应目录：

```bash
data/rag/knowledge/
├── options/
│   ├── iv_crush.txt
│   ├── greeks_guide.txt
│   └── sell_put_strategy.txt
├── crypto/
│   ├── dcd_basics.txt
│   └── defi_risks.txt
└── general/
    └── risk_management.txt
```

**文档内容示例**（`options/iv_crush.txt`）：

```
IV Crush 详解

IV Crush 是指在财报或重大事件后，隐含波动率急剧下降的现象。

## 原因

1. 事件不确定性消除
2. 市场预期重新定价
3. 期权卖方离场

## 对 Sell Put 的影响

持有期权空头时，IV Crush 是有利的...
```

### 2. 构建索引

```bash
# 安装依赖
pip install -e .

# 设置 API Key
export GOOGLE_API_KEY=your_key

# 运行索引构建
python scripts/build_rag_index.py
```

输出示例：

```
2026-04-13 10:00:00 [INFO] Indexing options knowledge...
2026-04-13 10:00:05 [INFO] Loaded 3 documents from data/rag/knowledge/options
2026-04-13 10:00:05 [INFO] Created 12 chunks from 3 documents
2026-04-13 10:00:10 [INFO] Ingested 12 chunks into vector store (collection: thetalab_knowledge, domain: options)
```

### 3. Agent 自动使用

Options Agent 会自动拥有 `search_options_knowledge` 工具：

**用户问题**：
```
什么是 IV Crush？会影响我的 Sell Put 吗？
```

**Agent 内部流程**：
1. 识别需要知识支撑
2. 调用 `search_options_knowledge("IV Crush")`
3. 检索到 4 条最相关片段
4. 结合检索内容 + 实时数据生成回答

**用户看到的回答**：
```
IV Crush 是隐含波动率在财报等重大事件后急剧下降的现象...
[引用知识片段并结合当前 TSLA 的 IV 数据]
```

## 扩展指南

### 添加新的 Embedding 供应商

1. 创建 `backend/rag/embeddings_<provider>.py`：

```python
from langchain_<provider> import <Provider>Embeddings

def create_embeddings(**kwargs):
    return <Provider>Embeddings(
        model="...",
        **kwargs
    )
```

2. 在 `backend/rag/embeddings.py` 注册：

```python
try:
    from backend.rag import embeddings_<provider>
    _EMBEDDING_PROVIDERS["<provider>"] = embeddings_<provider>
except ImportError:
    pass
```

3. 使用：

```bash
export RAG_EMBEDDING_PROVIDER=<provider>
```

### 添加新的向量库

1. 创建 `backend/rag/vectorstore_<backend>.py`：

```python
from langchain_<backend> import <Backend>VectorStore

def create_vectorstore(embeddings, collection_name="...", **kwargs):
    return <Backend>VectorStore(
        embeddings=embeddings,
        collection_name=collection_name,
        **kwargs
    )
```

2. 在 `backend/rag/vectorstore.py` 注册：

```python
try:
    from backend.rag import vectorstore_<backend>
    _VECTOR_STORES["<backend>"] = vectorstore_<backend>
except ImportError:
    pass
```

3. 使用：

```bash
export RAG_VECTOR_DB=<backend>
```

### 添加新知识域

1. 创建目录并添加文档：

```bash
mkdir -p data/rag/knowledge/futures
echo "期货基础知识..." > data/rag/knowledge/futures/basics.txt
```

2. 在 `scripts/build_rag_index.py` 添加入库逻辑：

```python
futures_dir = data_dir / "futures"
if futures_dir.exists() and any(futures_dir.rglob("*.txt")):
    print("Indexing futures knowledge...")
    ingest_knowledge_directory(futures_dir, domain="futures")
```

3. （可选）创建对应的检索工具：

```python
@tool
def search_futures_knowledge(query: str) -> str:
    """Search futures trading knowledge base."""
    retriever = get_retriever(k=4, filter={"domain": "futures"})
    docs = retriever.invoke(query)
    # ...
```

## 技术细节

### 文本分块策略

- **Chunk Size**: 1000 字符
- **Overlap**: 200 字符
- **分隔符优先级**: `\n\n` → `\n` → `。` → `.` → 空格

### Metadata 结构

每个文档块包含：

```python
{
    "source": "rag/knowledge/options/iv_crush.txt",
    "filename": "iv_crush.txt",
    "domain": "options"  # options | crypto | general
}
```

### 检索参数

```python
get_retriever(
    k=4,                          # Top-K 文档数
    score_threshold=0.7,          # 最低相似度（可选）
    filter={"domain": "options"}  # Metadata 过滤
)
```

## 与现有架构的对齐

| 设计原则 | 体现 |
|---------|------|
| 依赖抽象 | 使用 `Embeddings` / `VectorStore` 基类 |
| 单一职责 | 每个文件一个实现（embeddings_google.py、vectorstore_chroma.py） |
| 工厂模式 | 环境变量 + 注册表派发 |
| 可扩展 | 添加新后端 = 1 文件 + 1 行注册 |

参考现有模块：
- [`backend/agent/persistence/`](backend/agent/persistence/) - 相同的工厂模式
- [`backend/agent/tools.py`](backend/agent/tools.py) - 相同的 `@tool` 模式

## 故障排查

### 依赖安装

```bash
# 核心依赖
pip install langchain-chroma langchain-text-splitters

# Google Embeddings
pip install langchain-google-genai

# OpenAI Embeddings
pip install langchain-openai

# pgvector（可选）
pip install langchain-postgres
```

### 常见问题

**Q: ModuleNotFoundError: No module named 'chromadb'**

A: 运行 `pip install chromadb`

**Q: 向量库是空的**

A: 检查是否运行过 `python scripts/build_rag_index.py`

**Q: Agent 不调用检索工具**

A: 检查 prompt 是否明确提到需要检索知识，或手动在用户问题里包含「为什么」「怎么做」等触发词

## 性能优化

- **初次索引**：~1000 字符/秒（含 API 调用）
- **检索延迟**：~100-300ms（Top-4）
- **存储占用**：Chroma ~100KB/100 chunks

建议：
- 生产环境切换到 pgvector（更好的并发性能）
- 定期更新索引（Cron / CI/CD）
- 监控 Embedding API 配额

## 后续优化方向

- Hybrid 检索（向量 + BM25 关键词）
- Reranking（用小模型重排序检索结果）
- 评测集（问题 → 期望文档，跟踪召回率）
- 多租户（按 `user_id` 隔离知识库）
