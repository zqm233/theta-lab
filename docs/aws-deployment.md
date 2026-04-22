# ThetaLab — AWS Deployment Blueprint

> Reference architecture for deploying ThetaLab to AWS.
> Designed as interview knowledge — understand the full picture,
> discuss confidently, deploy when ready.

---

## Architecture Overview

```
                         ┌─────────────────────────────────────┐
                         │           CloudFront CDN            │
                         │  (HTTPS, gzip/brotli, edge cache)   │
                         └──────┬──────────────┬───────────────┘
                                │              │
                     ┌──────────▼──────┐  ┌────▼────────────────────┐
                     │  S3 Bucket      │  │  ALB (Application LB)   │
                     │  React SPA      │  │  health check: GET /    │
                     │  (static files) │  └────┬───────────┬────────┘
                     └─────────────────┘       │           │
                                          ┌────▼───┐  ┌────▼───┐
                                          │ ECS    │  │ ECS    │
                                          │ Task 1 │  │ Task 2 │
                                          └────┬───┘  └────┬───┘
                                               │           │
                                          ┌────▼───────────▼────┐
                                          │  RDS PostgreSQL     │
                                          │  (checkpoints,      │
                                          │   store, trades)    │
                                          └─────────────────────┘
External Agents ──A2A JSON-RPC──► CloudFront ──► ALB ──► ECS ──► ThetaLabAgent
```

### AWS Services Used

| Layer | Service | Purpose |
|-------|---------|---------|
| Edge | CloudFront | CDN, HTTPS termination, SPA routing, API proxy |
| Frontend | S3 | Static hosting for React build output |
| DNS | Route 53 | Custom domain |
| TLS | ACM | Free SSL certificate |
| Compute | ECS Fargate | Serverless containers (no EC2) |
| Load balancing | ALB | HTTP routing, health checks, multi-AZ |
| Database | RDS PostgreSQL | LangGraph Checkpointer + Store + trade history |
| Secrets | Secrets Manager | API keys (LLM, OKX, LangSmith) |
| Config | SSM Parameter Store | DATABASE_URL, non-secret config |
| Container registry | ECR | Docker image storage |
| Logs | CloudWatch Logs | Container stdout/stderr |
| Monitoring | CloudWatch Metrics | CPU, memory, 5xx alarms → SNS |
| Agent tracing | LangSmith | LangGraph execution traces |
| CI/CD | GitHub Actions | Build → ECR → ECS / S3 → CloudFront |

---

## Phase 1 — Containerization

### Backend Dockerfile

```dockerfile
FROM python:3.12-slim
WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN pip install --no-cache-dir uv && uv sync --frozen --no-dev

COPY backend/ backend/
COPY main.py .

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/')"

CMD ["uv", "run", "uvicorn", "backend.app:app", "--host", "0.0.0.0", "--port", "8000"]
```

### docker-compose.yml (local verification)

```yaml
services:
  backend:
    build: .
    ports: ["8000:8000"]
    env_file: .env
    environment:
      PERSISTENCE_BACKEND: postgres
      DATABASE_URL: postgresql+asyncpg://thetalab:${DB_PASSWORD:-thetalab}@postgres:5432/thetalab
    depends_on:
      postgres:
        condition: service_healthy

  frontend:
    build:
      context: frontend
      dockerfile: Dockerfile
    ports: ["80:80"]
    depends_on: [backend]

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: thetalab
      POSTGRES_USER: thetalab
      POSTGRES_PASSWORD: ${DB_PASSWORD:-thetalab}
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U thetalab"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
```

Key point: set `PERSISTENCE_BACKEND=postgres` and the existing persistence
abstraction (`backend/agent/persistence/`) handles everything — zero code
changes needed.

---

## Phase 2 — Frontend: S3 + CloudFront

### Build

```bash
cd frontend && bun run build    # produces dist/
```

### S3 Upload

```bash
# Create bucket (name is globally unique)
aws s3 mb s3://thetalab-frontend --region us-east-1

# Static assets — cache 1 year (filenames contain content hashes)
aws s3 sync dist/ s3://thetalab-frontend/ \
  --delete \
  --cache-control "public, max-age=31536000, immutable" \
  --exclude "index.html" \
  --exclude "*.json"

# index.html — never cache (so users always get the latest)
aws s3 cp dist/index.html s3://thetalab-frontend/index.html \
  --cache-control "no-cache"
```

The S3 bucket does NOT need public access or static website hosting enabled.
CloudFront accesses it privately via Origin Access Control (OAC).

### CloudFront Distribution

Create via Console or CLI. Critical settings:

| Setting | Value | Why |
|---------|-------|-----|
| Origin | S3 bucket (via OAC, not public) | Secure access |
| Viewer protocol | Redirect HTTP → HTTPS | Security |
| Compress | Yes (gzip + brotli) | 60-70% smaller JS/CSS |
| Custom error 403 → `/index.html` (200) | SPA routing support | React Router needs this |
| Cache policy | `CachingOptimized` (managed) | Good defaults |
| Price class | Use only North America + Europe | Cost savings for demo |

#### SPA Routing

When a user navigates directly to `/settings` or refreshes the page, S3
returns 403 (object not found). CloudFront's custom error response rewrites
this to serve `index.html` with a 200 status, letting React Router handle
the route client-side.

#### API Proxy (optional)

Add a second origin pointing to ALB for `/api/*` and `/a2a/*` paths.
This puts everything behind a single domain (no CORS issues):

```
CloudFront → /api/*   → ALB (backend)
           → /a2a/*   → ALB (backend)
           → /*       → S3  (frontend)
```

### Custom Domain + HTTPS

```
Route 53:  thetalab.com  →  ALIAS  →  CloudFront distribution
ACM:       *.thetalab.com  →  free SSL cert (DNS validation)
```

### Update Deployment

```bash
aws s3 sync dist/ s3://thetalab-frontend/ --delete ...
aws cloudfront create-invalidation --distribution-id E123... --paths "/*"
```

Invalidation takes 30-60 seconds. First 1,000/month are free.

---

## Phase 3 — Backend: ECS Fargate

### ECS Configuration

| Resource | Value |
|----------|-------|
| Cluster | ECS Fargate (serverless, no EC2 to manage) |
| Task Definition | 1 vCPU, 2 GB RAM, port 8000 |
| Service | Desired count: 2 (high availability) |
| Load Balancer | ALB with health check on `GET /` |
| Auto Scaling | Target tracking on CPU (scale out at 70%) |

### Why Fargate over EC2

- No server patching or management
- Pay per second of compute used
- Auto-scales with demand
- Built-in integration with ALB, CloudWatch, Secrets Manager

### Task Definition (key sections)

```json
{
  "containerDefinitions": [{
    "name": "thetalab-backend",
    "image": "<account>.dkr.ecr.us-east-1.amazonaws.com/thetalab-backend:latest",
    "portMappings": [{ "containerPort": 8000 }],
    "secrets": [
      { "name": "GOOGLE_API_KEY", "valueFrom": "arn:aws:secretsmanager:..." },
      { "name": "DATABASE_URL",   "valueFrom": "arn:aws:ssm:...:DATABASE_URL" }
    ],
    "environment": [
      { "name": "PERSISTENCE_BACKEND", "value": "postgres" }
    ],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/ecs/thetalab",
        "awslogs-region": "us-east-1",
        "awslogs-stream-prefix": "backend"
      }
    }
  }]
}
```

Secrets are injected at runtime via IAM roles — never baked into images.

---

## Phase 4 — Database: RDS PostgreSQL

| Config | Value |
|--------|-------|
| Engine | PostgreSQL 16 |
| Instance | db.t4g.micro (Free Tier eligible) |
| Storage | 20 GB gp3 |
| Multi-AZ | No (demo), Yes (production) |
| Backup | 7-day automated snapshots |

Application config:

```bash
PERSISTENCE_BACKEND=postgres
DATABASE_URL=postgresql+asyncpg://thetalab:<password>@<rds-endpoint>:5432/thetalab
```

---

## Phase 5 — Secrets Management

| Secret | Service |
|--------|---------|
| GOOGLE_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY | Secrets Manager |
| OKX_API_KEY / OKX_API_SECRET / OKX_PASSPHRASE | Secrets Manager |
| LANGSMITH_API_KEY | Secrets Manager |
| DATABASE_URL | SSM Parameter Store (SecureString) |
| PERSISTENCE_BACKEND, LLM_PROVIDER, LLM_MODEL | SSM Parameter Store (String) |

ECS task role gets `secretsmanager:GetSecretValue` and `ssm:GetParameters`
permissions. No access keys in code or environment files.

---

## Phase 6 — Networking & Security

```
┌─────────────────── VPC 10.0.0.0/16 ───────────────────┐
│                                                        │
│  ┌── Public Subnets (10.0.1.0/24, 10.0.2.0/24) ────┐  │
│  │  ALB         NAT Gateway                         │  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│  ┌── Private Subnets (10.0.3.0/24, 10.0.4.0/24) ───┐  │
│  │  ECS Tasks   RDS                                 │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

| Security Group | Inbound Rule |
|----------------|-------------|
| ALB SG | 443 (HTTPS) from 0.0.0.0/0 |
| ECS SG | 8000 from ALB SG only |
| RDS SG | 5432 from ECS SG only |

NAT Gateway provides outbound internet for ECS tasks in private subnets
(needed for LLM APIs, Yahoo Finance, LangSmith, OKX MCP).

Demo tip: skip NAT Gateway ($35/mo) by placing ECS in public subnets with
public IP assignment. Less secure but saves cost.

---

## Phase 7 — CI/CD: GitHub Actions

```
git push main
     │
     ├─► deploy-backend:
     │     checkout → docker build → push to ECR → update ECS service
     │
     └─► deploy-frontend:
           checkout → bun build → s3 sync → CloudFront invalidation
```

Authentication: GitHub OIDC federation → AWS IAM role (no stored access keys).

Workflow lives at `.github/workflows/deploy.yml` in the repo.

---

## Phase 8 — Observability

| Concern | Tool | Setup |
|---------|------|-------|
| Container logs | CloudWatch Logs | ECS `awslogs` driver (automatic) |
| Metrics + alarms | CloudWatch Metrics | CPU, memory, 5xx rate → SNS |
| Agent tracing | LangSmith | Set `LANGSMITH_API_KEY` env var |
| APM (optional) | X-Ray | Trace HTTP request latency end-to-end |
| Uptime | Route 53 Health Check | Ping `GET /` every 30s |

---

## Phase 9 — A2A in Production

| Concern | Solution |
|---------|----------|
| Discovery | `https://thetalab.com/a2a/.well-known/agent-card.json` via CloudFront |
| Authentication | API Gateway with API key or OAuth2 in front of `/a2a` |
| Rate limiting | API Gateway throttling (100 req/min default) |
| CORS | Tighten `allow_origins` to specific partner domains |

---

## Cost Estimate (Demo Scale)

| Service | Monthly |
|---------|---------|
| ECS Fargate (1 task, 0.5 vCPU, 1 GB) | ~$15 |
| RDS db.t4g.micro | ~$15 (Free Tier: $0) |
| S3 + CloudFront | ~$1 |
| NAT Gateway | ~$35 |
| Secrets Manager | ~$1 |
| **Total** | **~$65/mo** |

Without NAT Gateway (ECS in public subnet): ~$30/mo.

---

## Interview Talking Points

**Zero-change deployment**: the app already uses environment variables for
all config and has a persistence abstraction layer (SQLite ↔ PostgreSQL).
No code changes needed to move from local to AWS.

**Full tech stack**:

```
Local Dev:        Docker, docker-compose, Makefile
Container:        Dockerfile (multi-stage), ECR
Compute:          ECS Fargate, ALB, Auto Scaling
Database:         RDS PostgreSQL (via persistence abstraction)
Frontend:         S3 + CloudFront + Route 53 + ACM
Secrets:          Secrets Manager, SSM Parameter Store
Networking:       VPC, Private Subnets, Security Groups, NAT Gateway
CI/CD:            GitHub Actions (OIDC) → ECR → ECS / S3
Observability:    CloudWatch, LangSmith
Security:         IAM roles, OIDC federation, no hardcoded secrets
Agent Protocol:   A2A endpoint via CloudFront + API Gateway
IaC (optional):   Terraform or CDK to codify all of the above
```
