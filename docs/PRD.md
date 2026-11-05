# PRD - Cinema Seat Reservation Engine (PoC - MongoDB)

## 1. Visão Geral
Motor de reserva de assentos de cinema focado em concorrência em tempo real, consistência atômica e expiração automática de assentos, utilizando MongoDB como banco de dados principal e Redis como camada de lock distribuído.

## 2. Requisitos Funcionais
- **RF01 - Mapa da Sessão:** Listar todos os assentos de uma sessão e seus respectivos estados (`AVAILABLE`, `HELD`, `RESERVED`).
- **RF02 - Hold Temporário (Lock):** Permitir a reserva temporária de um assento por 10 minutos (TTL configurável) usando um `cartId` (ou idempotency key).
- **RF03 - Confirmação da Reserva:** Converter assento de `HELD` para `RESERVED` mediante a confirmação da compra pelo mesmo `cartId`.
- **RF04 - Liberação Manual:** Permitir que o cliente cancele a seleção e libere o assento antes do tempo.
- **RF05 - Expiração Automática:** Assentos em `HELD` que expirarem devem ficar imediatamente disponíveis para novos locks.

## 3. Requisitos Não Funcionais
- **RNF01 - Zero Overbooking:** Duas requisições simultâneas para o mesmo assento não podem ter sucesso sob nenhuma hipótese.
- **RNF02 - Baixa Latência:** Rejeição de disputas em submilissegundos via Redis (`SET NX EX`).
- **RNF03 - Consistência e Atomicidade no MongoDB:** Persistência atômica utilizando `findOneAndUpdate` com filtros condicionais de status e índices únicos compostos (`sessionId` + `seatNumber`).
- **RNF04 - Testabilidade Automatizada:** Teste automatizado de concorrência com disparos paralelos provando a prevenção de *race conditions*.

## 4. Endpoints Essenciais
- `GET /api/v1/sessions/:sessionId/seats`
- `POST /api/v1/sessions/:sessionId/seats/:seatId/hold` (Body: `{ "cartId": "uuid" }`)
- `POST /api/v1/sessions/:sessionId/seats/:seatId/confirm` (Body: `{ "cartId": "uuid" }`)
- `DELETE /api/v1/sessions/:sessionId/seats/:seatId/hold` (Body: `{ "cartId": "uuid" }`)