# AI Local

Chat com IA que roda 100% na sua máquina: conversa com modelos do [Ollama](https://ollama.com) e guarda o histórico no PostgreSQL.

Projeto de estudo e portfólio, pensado para hardware modesto (notebook com 16 GB de RAM e GPU de 4 GB) e com proteções explícitas para o modelo nunca travar a máquina.

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | NestJS 12 + TypeScript (ESM), Prisma 7 |
| Banco | PostgreSQL 17 + pgvector |
| Frontend | Next.js 16 (App Router) + Tailwind CSS 4 + Motion |
| Modelo | Ollama (API nativa, atrás de uma interface própria), `qwen3.5:2b` por padrão |
| Infra | Docker Compose |

## Arquitetura

```
Navegador ──▶ frontend (Next.js) 127.0.0.1:3000
   │
   └──── HTTP / SSE ──▶ backend (NestJS) 127.0.0.1:3001
                           ├──▶ postgres + pgvector   (sem porta publicada)
                           └──▶ ollama (GPU)          127.0.0.1:11434
```

O navegador fala direto com a API, e o CORS só aceita a origem do frontend.

## Pré-requisitos

- Docker com Compose v2
- Driver NVIDIA + [nvidia-container-toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/) (para o Ollama usar a GPU)
- Um volume Docker chamado `ollama` com os modelos. Ele é usado como volume externo, então os modelos não são baixados de novo. Se ainda não existir:

  ```bash
  docker volume create ollama
  ```

Node.js **não** precisa estar instalado: tudo roda em containers.

## Como subir

```bash
cp .env.example .env
# defina POSTGRES_PASSWORD (só letras e números), por exemplo:
#   openssl rand -hex 24

docker compose up -d --build
```

Se o modelo ainda não estiver no volume:

```bash
docker compose exec ollama ollama pull qwen3.5:2b
```

Endereços:

- App: http://127.0.0.1:3000
- API (health check): http://127.0.0.1:3001/health

## Desenvolvimento

O código de `backend/` e `frontend/` é montado nos containers, então salvar um arquivo recarrega o serviço (hot reload).

```bash
docker compose logs -f backend               # logs
docker compose exec backend npm test         # testes do backend
docker compose exec backend npm run lint
docker compose exec frontend npm run lint
docker stats                                 # consumo vs. limites
```

**Dependências:** o `node_modules` vive dentro da imagem, não na sua máquina. Depois de adicionar um pacote, reconstrua recriando os volumes anônimos:

```bash
docker compose up -d --build -V backend
```

**Migrations (Prisma):** são aplicadas automaticamente quando o backend sobe. Para criar uma nova depois de mudar o `schema.prisma`:

```bash
docker compose exec backend npx prisma migrate dev --name descricao_da_mudanca
```

## Proteções da máquina

| Onde | O quê |
|---|---|
| Ollama | `OLLAMA_NUM_PARALLEL=1`, `OLLAMA_MAX_LOADED_MODELS=1`, `OLLAMA_MAX_QUEUE=10`, limite de 6 CPUs e 6 GB de RAM |
| Contexto | `OLLAMA_CONTEXT_LENGTH` fixo (4096) a partir do `.env` |
| Postgres | 512 MB de RAM, 1 CPU |
| Backend / Frontend | 768 MB / 1,5 GB de RAM, 2 CPUs cada |
| Backend (Fase 1) | Fila com uma chamada ao modelo por vez e timeouts |

## Segurança

- Todas as portas publicadas só em `127.0.0.1`. O Postgres não publica porta nenhuma.
- As credenciais ficam no `.env`, que está fora do git. O `.env.example` não tem valores reais.
- O backend valida todas as variáveis de ambiente ao subir e não inicia se faltar alguma.

## Roadmap

- [x] **Fase 0:** fundação (compose, esqueletos, config validada, Prisma + pgvector)
- [ ] **Fase 1:** chat com streaming, fila do modelo, gestão de contexto
- [ ] **Fase 2:** várias conversas, título automático, resumo das antigas
- [ ] **Fase 3:** modelo, system prompt e temperatura por conversa
- [ ] **Fase 4:** imagens
- [ ] **Fase 5:** memória com embeddings e RAG
