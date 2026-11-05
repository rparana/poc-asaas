# 🎬 Cinema Seat Reservation Engine (PoC)

> [!NOTE]  
> **Status:** Prova de Conceito (PoC)  
> Este repositório é estritamente uma **Prova de Conceito experimental** desenvolvida para validar estratégias de concorrência em tempo real, consistência atômica e prevenção de *overbooking* utilizando **MongoDB** e **Redis**. Não representa a arquitetura final nem o código de produção definitivo.

---

## 🎯 Objetivo da PoC

Avaliar a eficiência e a robustez de um modelo de concorrência em duas camadas para reservas de assentos de alta demanda:

1. **Camada 1 — Lock Distribuído em Memória (Redis):** Bloqueio temporário ultra-rápido via `SET seat_lock:<sessionId>:<seatNumber> <cartId> NX EX <ttlSeconds>`. Requisições concorrentes perdedoras são rejeitadas em submilissegundos com HTTP `409 Conflict`, sem onerar o banco de dados.
2. **Camada 2 — Persistência e Consistência Atômica (MongoDB):** Assentos modelados como **documentos individuais materializados** na coleção `session_seats`, com índice único composto `{ sessionId: 1, seatNumber: 1 }` e mutações de estado via `findOneAndUpdate` atômico no motor WiredTiger.
3. **Mecanismo de Compensação (Rollback Automático):** Caso o lock no Redis seja adquirido com sucesso, mas o assento no MongoDB já não esteja mais disponível (`AVAILABLE` ou `HELD` expirado), o lock é imediatamente desfeito via script Lua e HTTP 409 é retornado.

```mermaid
flowchart TD
    Client["Cliente / Requisição Concorrente"] -->|"1. POST /seats/:seatNumber/hold"| API["Fastify Engine"]
    
    subgraph Camada 1: Fast Fail Distributed Lock
        API -->|"2. SET NX EX (ioredis)"| Redis[("Redis 7 (In-Memory)")]
        Redis -- "Lock Negado (409 Conflict)" --> API
    end

    subgraph Camada 2: Persistência Atômica Condicional
        API -->|"3. findOneAndUpdate (Status: AVAILABLE ou expirado)"| Mongo[("MongoDB 7 (Replica Set rs0)")]
        Mongo -. "Falha no Mongo? Reverte Lock via Lua Script" .-> Redis
    end

    API -->|"4. 200 OK (Assento retido com cartId por 10 min)"| Client
```

---

## 🛠️ Stack Tecnológica

| Tecnologia | Finalidade |
| :--- | :--- |
| **Node.js 26** (Alpine) | Runtime JavaScript de última geração com suporte a ESM nativo |
| **TypeScript** (v5) | Tipagem estática e segurança em tempo de compilação |
| **Fastify** (v5) | Framework HTTP focado em altíssimo throughput e baixa latência |
| **Zod** (v3) | Validação estrita de parâmetros de rota, payloads e variáveis de ambiente |
| **MongoDB** (v7.0) | Banco de dados NoSQL com Replica Set de nó único (`rs0`) e transações |
| **Driver Nativo MongoDB** | Manipulação direta sem overhead de hidratação de ODM |
| **Redis** (v7.0) | Cache e distributed lock em memória com execução atômica via Lua Scripts |
| **ioredis** | Cliente Redis performático com pool de conexões e reconexão automática |
| **Biome** | Formatação e linter de código ultrarrápidos |
| **Docker & Docker Compose** | Orquestração completa dos contêineres com **Hot-Reload em tempo real** |

---

## 📂 Estrutura do Projeto

```text
├── docs/
│   ├── PRD.md                                   # Requisitos do produto e regras de negócio
│   └── adr/
│       ├── 001-seat-locking-and-concurrency.md  # ADR: Estratégia de Lock Redis + Mongo
│       └── 002-individual-seat-entities.md      # ADR: Assentos como documentos materializados
├── src/
│   ├── application/
│   │   └── use-cases/
│   │       ├── hold-seat.use-case.ts            # Bloqueio temporário (Hold) em 2 camadas
│   │       ├── confirm-seat.use-case.ts         # Confirmação atômica de compra (Reserved)
│   │       ├── release-seat.use-case.ts         # Liberação manual antecipada
│   │       └── list-seats.use-case.ts           # Listagem do mapa da sessão e status efetivo
│   ├── domain/
│   │   └── errors/
│   │       └── seat-errors.ts                   # Erros de domínio mapeados para códigos HTTP
│   ├── http/
│   │   └── routes/
│   │       └── seat-routes.ts                   # Rotas Fastify validadas com esquemas Zod
│   ├── config/
│   │   └── env.ts                               # Variáveis de ambiente tipadas com Zod
│   ├── infra/
│   │   ├── db/
│   │   │   ├── models/
│   │   │   │   └── session-seat.ts              # Modelagem da entidade SessionSeat
│   │   │   ├── mongo.ts                         # Conexão e singleton do MongoDB nativo
│   │   │   └── seed.ts                          # Criação de índice único composto e 20 assentos
│   │   └── redis/
│   │       ├── client.ts                        # Conexão e cliente ioredis
│   │       └── redis-lock-service.ts            # Lock distribuído (SET NX EX e release via Lua)
│   ├── app.ts                                   # Setup do Fastify, rotas e tratamento global de erros
│   └── server.ts                                # Entrada da aplicação com graceful shutdown
├── Dockerfile                                   # Imagem Node 26 Alpine para desenvolvimento
├── docker-compose.yml                           # MongoDB 7, Redis 7, Redis Insight e API (Node 26)
├── biome.json                                   # Configuração do Biome
└── tsconfig.json                                # Configuração do TypeScript ESM (NodeNext)
```

---

## 🚀 Como Executar

### Pré-requisitos
- [Docker](https://www.docker.com/) e Docker Compose instalados
- Opcional para rodar fora do Docker: [Node.js](https://nodejs.org/) `>= 22` e [pnpm](https://pnpm.io/) `>= 11`

---

### Passo 1: Configurar Variáveis de Ambiente

Copie o arquivo de exemplo `.env.example` para `.env`:

```bash
cp .env.example .env
```

---

### Passo 2: Subir os Containers Docker (Ambiente Completo com Node 26)

Inicie todos os contêineres:

```bash
docker compose up -d
```

Verifique se todos os serviços estão saudáveis:
```bash
docker compose ps
```

> [!TIP]
> **Hot-Reload em Tempo Real:** O serviço `api` roda dentro do container com `tsx watch` e sincronização de volumes. Ao alterar e salvar qualquer arquivo em `src/` no seu editor, o serviço reinicia e aplica as mudanças automaticamente!
> Para acompanhar os logs:
> ```bash
> docker compose logs -f api
> ```

---

### Passo 3: Executar o Seed Inicial

Cria o índice único composto `{ sessionId: 1, seatNumber: 1 }` (`unique: true`) na collection `session_seats` e popula a sessão `sessao-cinema-101` com 20 assentos (`A1` a `A20`):

```bash
docker compose exec api pnpm db:seed
```

---

## 📡 Guia de Uso da API (Endpoints REST)

A API roda por padrão na porta **3001** (`http://localhost:3001`).

### 1. Mapa da Sessão (Listar Assentos)
Retorna o mapa de assentos da sessão com contadores agregados e status efetivo:
- Se um assento estiver `HELD` e o tempo de expiração tiver vencido, o status retornado é automaticamente calculado como `AVAILABLE` (RF05).

```bash
curl -s http://localhost:3001/api/v1/sessions/sessao-cinema-101/seats
```

**Exemplo de Resposta (HTTP 200):**
```json
{
  "sessionId": "sessao-cinema-101",
  "totalSeats": 20,
  "availableCount": 20,
  "heldCount": 0,
  "reservedCount": 0,
  "seats": [
    { "seatNumber": "A1", "status": "AVAILABLE", "expiresAt": null },
    { "seatNumber": "A2", "status": "AVAILABLE", "expiresAt": null }
  ]
}
```

---

### 2. Bloqueio Temporário (Hold Seat)
Retém temporariamente uma poltrona vinculada ao `cartId` por 10 minutos (TTL padrão configurável via `.env` ou parâmetro `ttlSeconds` opcional).

```bash
curl -s -i -X POST http://localhost:3001/api/v1/sessions/sessao-cinema-101/seats/A1/hold \
  -H "Content-Type: application/json" \
  -d '{"cartId": "cart-uuid-101"}'
```

**Resposta de Sucesso (HTTP 200):**
```json
{
  "message": "Assento A1 bloqueado temporariamente com sucesso.",
  "seat": {
    "sessionId": "sessao-cinema-101",
    "seatNumber": "A1",
    "status": "HELD",
    "cartId": "cart-uuid-101",
    "expiresAt": "2026-11-05T14:36:21.151Z"
  }
}
```

**Tentativa Concorrente Duplicada (HTTP 409 Conflict):**
```json
{
  "statusCode": 409,
  "error": "SEAT_ALREADY_TAKEN",
  "message": "Assento A1 já está temporariamente retido ou ocupado por outro usuário."
}
```

---

### 3. Confirmação da Reserva (Confirm Seat)
Efetiva a compra do ingresso, convertendo o status de `HELD` para `RESERVED` e removendo com segurança o lock do Redis.

```bash
curl -s -i -X POST http://localhost:3001/api/v1/sessions/sessao-cinema-101/seats/A1/confirm \
  -H "Content-Type: application/json" \
  -d '{"cartId": "cart-uuid-101"}'
```

**Resposta de Sucesso (HTTP 200):**
```json
{
  "message": "Assento A1 confirmado e reservado com sucesso.",
  "seat": {
    "sessionId": "sessao-cinema-101",
    "seatNumber": "A1",
    "status": "RESERVED",
    "cartId": "cart-uuid-101",
    "updatedAt": "2026-11-05T14:17:30.872Z"
  }
}
```

---

### 4. Liberação Manual (Cancelamento / Release)
Permite que o usuário desista da escolha antes dos 10 minutos, liberando o assento imediatamente para `AVAILABLE` tanto no MongoDB quanto no Redis.

```bash
curl -s -i -X DELETE http://localhost:3001/api/v1/sessions/sessao-cinema-101/seats/A2/hold \
  -H "Content-Type: application/json" \
  -d '{"cartId": "cart-uuid-101"}'
```

---

### 5. Checagem de Saúde (Healthcheck)
```bash
curl -s http://localhost:3001/health
```

**Resposta (HTTP 200):**
```json
{
  "status": "healthy",
  "version": "1.0.0-poc",
  "timestamp": "2026-11-05T14:18:00.000Z",
  "services": {
    "mongo": "up",
    "redis": "up"
  }
}
```

---

## 🖥️ Inspeção Visual com Redis Insight

Abra no navegador:
👉 [http://localhost:5540](http://localhost:5540)

- Adicione uma nova conexão apontando para o Host `redis` na porta `6379`.
- Você poderá visualizar as chaves ativas no formato `seat_lock:<sessionId>:<seatNumber>` e acompanhar a contagem regressiva do TTL em tempo real.

---

## 🛠️ Comandos de Desenvolvimento

| Comando | Descrição |
| :--- | :--- |
| `docker compose up -d` | Sobe o ambiente completo (DBs + API em Node 26) |
| `docker compose exec api pnpm db:seed` | Executa o seed de assentos no MongoDB via Docker |
| `docker compose logs -f api` | Acompanha os logs e hot-reload da aplicação |
| `pnpm lint` | Executa a validação de linter com Biome |
| `pnpm format` | Formata o código-fonte seguindo o padrão Biome |
