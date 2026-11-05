# ADR 003: Atualizações em Tempo Real via Server-Sent Events (SSE) e Redis Pub/Sub

## Status
Aceito

## Contexto
Para demonstrar visualmente o comportamento da concorrência e o ciclo de vida dos assentos nos totens e navegadores (mudanças de `AVAILABLE`, `HELD`, `RESERVED` e expirações), a aplicação cliente precisa refletir alterações de estado instantaneamente sem exigir recarregamento de página (*polling* frequente).

Avaliou-se o uso de **WebSockets bidirecionais** (via Socket.io ou ws) versus **Server-Sent Events (SSE)**, além da organização do código em um **Monorepo formal** (com ferramentas como Nx/Turborepo) versus uma **SPA desacoplada em pasta dedicada**.

## Decisão

1. **Protocolo Unidirecional com Server-Sent Events (SSE):**
   - As ações de mutação (solicitar hold, confirmar reserva, liberar assento) continuam sendo requisições **HTTP REST convencionais** (`POST`, `DELETE`), aproveitando validações de schema, códigos de status HTTP semânticos (ex.: `409 Conflict`, `201 Created`) e cabeçalhos padrão.
   - O tráfego reativo do servidor para o cliente é estritamente unidirecional, tornando o SSE (`text/event-stream`) a escolha ideal: opera sobre HTTP padrão, consome menos recursos de handshake que WebSockets, possui reconexão automática nativa no navegador através da API `EventSource` e elimina a necessidade de bibliotecas cliente adicionais.

2. **Barramento de Notificações com Redis Pub/Sub:**
   - Para desacoplar a camada de casos de uso da gestão de conexões ativas, os eventos de domínio (`SEAT_HELD`, `SEAT_RESERVED`, `SEAT_RELEASED`) são publicados em um canal do Redis (`sessions:<sessionId>:events`).
   - O endpoint SSE escuta esse canal e repassa os eventos aos clientes conectados daquela sessão, viabilizando escalabilidade horizontal da API sem perda de eventos entre instâncias.

3. **Arquitetura de Código Desacoplada (Frontend em Pasta Dedicada):**
   - Criação de uma SPA leve em `frontend/` (Vite + Vue 3 + Tailwind CSS) consumindo o backend via proxy reverso ou CORS habilitado em desenvolvimento local.
   - Evita-se a complexidade de configuração de tooling, workspaces cruzados e pipelines de build de um Monorepo formal na véspera da apresentação técnica.

## Consequências

- **Positivas:**
  - Simplicidade de implementação: nenhum protocolo novo além de HTTP padrão no frontend.
  - Baixa sobrecarga operacional: o cliente usa a API nativa `window.EventSource`.
  - Clareza semântica: comandos continuam sendo REST idempotentes; eventos de streaming cuidam apenas da projeção visual.
  - Escalabilidade horizontal nativa garantida pelo Redis Pub/Sub.

- **Negativas:**
  - O canal SSE é estritamente unidirecional (servidor -> cliente). Caso o sistema exija troca de mensagens contínuas originadas do cliente no mesmo socket no futuro, seria necessário migrar para WebSockets ou manter o modelo híbrido (SSE + REST).