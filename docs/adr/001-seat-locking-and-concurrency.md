# ADR 001: Concorrência e Lock com MongoDB e Redis

## Status
Aceito

## Contexto
Durante picos de acesso, milhares de usuários podem disputar as mesmas poltronas simultaneamente. Fazer apenas leituras (`findOne`) seguidas de gravações (`updateOne`) no MongoDB cria janelas de concorrência (*race conditions*). Além disso, o índice TTL nativo do MongoDB roda a cada ~60 segundos, o que pode causar atraso perceptível na liberação de cadeiras abandonadas.

## Decisão
1. **Camada 1 - Lock Distribuído em Memória (Redis):** O Redis atua como cancela de tráfego ultra-rápida via `SET seat_lock:<sessionId>:<seatId> <cartId> NX EX <ttl>`. Requisições concorrentes perdedoras são rejeitadas instantaneamente com HTTP 409 sem bater no MongoDB.
2. **Camada 2 - Persistência Atômica no MongoDB:**
   - Garantia de unicidade por índice composto exclusivo: `{ sessionId: 1, seatNumber: 1 }` na collection `session_seats`.
   - Modificações de status utilizam `findOneAndUpdate` atômico com filtro condicional:
     `{ sessionId, seatNumber, status: "AVAILABLE" }` (ou `status: "HELD"` com `expiresAt < agora`).
3. **Liberação Segura:** A remoção do lock no Redis é validada via Script Lua atômico, garantindo que apenas o `cartId` proprietário daquele lock possa removê-lo.

## Consequências
- Elimina completamente o overbooking.
- Protege o MongoDB contra saturação de conexões e locks excessivos de documento no motor WiredTiger.
- Garante liberação de assento instantânea no milissegundo em que o TTL do Redis expira.