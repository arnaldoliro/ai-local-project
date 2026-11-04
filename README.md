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
                           ├──▶ ollama (GPU)          127.0.0.1:11434   chat
                           └──▶ ollama-embed (CPU)    (sem porta)       embeddings
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

Se os modelos ainda não estiverem no volume:

```bash
docker compose exec ollama ollama pull qwen3.5:2b                # chat (GPU)
docker compose exec ollama-embed ollama pull qwen3-embedding:0.6b  # memória (CPU)
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

## API

| Método | Rota | O que faz |
|---|---|---|
| `GET` | `/health` | Status do banco e do Ollama (não carrega modelo) |
| `GET` | `/conversations` | Lista as conversas (mais recentes primeiro) |
| `POST` | `/conversations` | Cria uma conversa |
| `GET` | `/conversations/:id` | Conversa com as mensagens |
| `PATCH` | `/conversations/:id` | Renomeia e/ou muda a configuração: `{ title?, model?, systemPrompt?, temperature? }` (`null` volta ao padrão) |
| `DELETE` | `/conversations/:id` | Apaga a conversa e as mensagens |
| `POST` | `/conversations/:id/messages` | Envia `{ content, think?, attachmentIds? }` e responde em **SSE** |
| `POST` | `/attachments` | Upload de imagem: o arquivo é o corpo (`Content-Type: image/*`), até 5 MB |
| `GET` | `/attachments/:id` | A imagem |
| `DELETE` | `/attachments/:id` | Remove uma imagem que ainda não foi enviada |
| `GET` | `/models` | Modelos instalados no Ollama que conversam, com capacidades (raciocínio, imagens, ferramentas) |
| `GET` | `/settings/defaults` | Modelo e system prompt padrão, limites de tamanho e de temperatura |
| `GET` | `/events` | **SSE** com as mudanças nas conversas (`conversation.updated` / `conversation.deleted`) |

Eventos do stream, em ordem: `start` → `queued` (se houver fila) → `generating` (`modelLoaded: false` = carregando o modelo) → `thinking`* / `content`* → `done` ou `error`. Fechar a conexão cancela a geração no Ollama.

## Configuração por conversa

Cada conversa pode ter o próprio **modelo**, **system prompt** e **temperatura**, ajustados no painel aberto pelo botão do modelo no topo do chat. Campo vazio significa "usar o padrão": o modelo do `.env`, o system prompt padrão e a temperatura definida no próprio modelo.

- **Trocar de modelo:** só um modelo cabe na GPU por vez, então a primeira resposta com o modelo novo demora mais (carregamento). Título e resumo usam o modelo da conversa, para não forçar trocas.
- **Raciocínio:** o botão só fica disponível se o modelo tiver a capacidade `thinking`.
- **System prompt:** até 2.000 caracteres. Ele sai do mesmo orçamento de 4096 tokens do histórico.
- **Mais modelos:** `docker compose exec ollama ollama pull <modelo>`. A lista no painel se atualiza ao abrir.

## Imagens

Anexe pelo clipe, arraste e solte no campo de mensagem ou cole com Ctrl+V (até 3 por mensagem). O botão só aparece se o modelo da conversa tiver visão.

- **No navegador:** a imagem é redimensionada para no máximo 768 px e convertida para JPEG, com `<canvas>` e sem lib. O upload fica pequeno, qualquer formato que o navegador abre funciona e os **metadados EXIF, inclusive localização GPS, são removidos** antes de sair da máquina.
- **No backend:** o formato é confirmado pelos bytes do arquivo (PNG, JPEG ou WebP), e não pelo cabeçalho da requisição. Largura e altura são lidas do arquivo para estimar os tokens. Os arquivos ficam no volume `uploads`, com nomes gerados (`<uuid>.<ext>`). Uploads nunca enviados são apagados depois de 1 hora, e apagar uma conversa apaga as imagens dela.
- **Custo no contexto:** medido no `qwen3.5:2b`, cada bloco de 32×32 px custa 1 token. Uma imagem de 768×576 ocupa cerca de 434 tokens da janela de 4096.
- **Histórico:** só as imagens da mensagem com imagem **mais recente** são reenviadas (para perguntas como "e a cor do carro?"). As mais antigas viram o texto `[o usuário enviou uma imagem aqui]`.

## Memória (RAG)

Cada troca concluída (pergunta + resposta) é dividida em trechos de cerca de 600 caracteres e transformada em vetores (embeddings) pelo `qwen3-embedding:0.6b`, um modelo multilíngue, bom em português. Os vetores ficam no **pgvector**. A cada mensagem nova, os trechos mais parecidos de **todas as conversas** são buscados por semelhança de cosseno e entram no prompt, até uma cota de 600 tokens.

- **Um Ollama só para embeddings, na CPU** (`ollama-embed`, 2 CPUs e 1,5 GB): com um modelo por instância, o modelo de chat nunca sai da GPU para dar lugar aos embeddings. Mesmo assim, **todas as chamadas, das duas instâncias, passam pela mesma fila**: uma por vez.
- **Indexação:** depois de cada resposta, em segundo plano. As conversas antigas são indexadas aos poucos (backfill), e **só quando a fila está ociosa**.
- **Busca:** cerca de 0,3 s por pergunta. Trechos com semelhança abaixo de 0,45 são descartados. A parte da conversa atual que já está no histórico não é buscada de novo. Se o servidor de embeddings estiver fora, o chat funciona sem memória.
- **Na interface:** respostas que usaram memória mostram "Lembrou de N conversas", com link para cada uma.
- **Desligar por conversa** (painel de configuração): a conversa deixa de buscar memórias e de ser encontrada pelas outras. **Limite:** o que ela já tiver passado para respostas de outras conversas continua nelas.
- **Sem índice HNSW:** na escala de um app local (milhares de trechos), a busca exata leva milissegundos e é precisa. O Prisma também não sabe representar esse índice e tentaria removê-lo a cada migration.

## Título e resumo automáticos

Depois de cada resposta, duas tarefas rodam **em segundo plano**, uma depois da outra e pela mesma fila do modelo, com prioridade menor que o chat:

1. **Título:** na primeira troca de mensagens, o modelo gera um título curto. Se você renomear antes, o seu título prevalece.
2. **Resumo:** quando o histórico ainda não resumido passa de cerca de 1.600 tokens (ou de 20 mensagens), as mensagens antigas são resumidas. O histórico recente, de cerca de 800 tokens, continua indo inteiro. O resumo é incremental: o resumo anterior mais as mensagens novas viram um resumo novo.

Se você mandar uma mensagem enquanto uma dessas tarefas estiver rodando, ela é **interrompida** e volta para a fila. O seu chat nunca espera por título ou resumo.

O título aparece sozinho na lista lateral, via `GET /events`.

## Como o contexto é montado

A janela tem 4096 tokens: 1024 ficam reservados para a resposta e 10% são margem de erro. Sobram 2.662 tokens para o prompt, preenchidos nesta ordem:

1. System prompt
2. Mensagem atual (se não couber sozinha, a API responde `413`)
3. Resumo das mensagens antigas, dentro do system prompt (é o primeiro a sair se a mensagem atual for muito grande)
4. Mensagens anteriores ainda não resumidas, da mais nova para a mais antiga, até acabar o orçamento (no máximo 20)

Com o **raciocínio ligado**, a reserva de resposta sobe para 2048 tokens, porque o raciocínio também conta como saída. Nessa mensagem sobram cerca de 1.638 tokens para o prompt. A janela continua em 4096.

Os tokens são estimados antes do envio (cerca de 3 caracteres por token, de propósito pessimista). O log do backend mostra a estimativa ao lado do número real devolvido pelo Ollama, para calibrar a heurística.

## Proteções da máquina

| Onde | O quê |
|---|---|
| Ollama (GPU) | `OLLAMA_NUM_PARALLEL=1`, `OLLAMA_MAX_LOADED_MODELS=1`, `OLLAMA_MAX_QUEUE=10`, limite de 6 CPUs e 6 GB de RAM |
| Ollama de embeddings (CPU) | As mesmas regras, sem GPU, com limite de 2 CPUs e 1,5 GB de RAM |
| Contexto | `OLLAMA_CONTEXT_LENGTH` fixo (4096) a partir do `.env` |
| Postgres | 512 MB de RAM, 1 CPU |
| Backend / Frontend | 768 MB / 1,5 GB de RAM, 2 CPUs cada |
| Backend | Fila única para chat, título, resumo e embeddings: uma chamada ao modelo por vez (prioridade para o chat, até 10 na espera), timeout de primeiro token e total, e cancelamento ao fechar a conexão |

## Segurança

- Todas as portas publicadas só em `127.0.0.1`. O Postgres não publica porta nenhuma.
- As credenciais ficam no `.env`, que está fora do git. O `.env.example` não tem valores reais.
- O backend valida todas as variáveis de ambiente ao subir e não inicia se faltar alguma.

## Roadmap

- [x] **Fase 0:** fundação (compose, esqueletos, config validada, Prisma + pgvector)
- [x] **Fase 1:** chat com streaming, fila do modelo, gestão de contexto
- [x] **Fase 2:** várias conversas, título automático, resumo das antigas
- [x] **Fase 3:** modelo, system prompt e temperatura por conversa
- [x] **Fase 4:** imagens
- [x] **Fase 5:** memória com embeddings e RAG
