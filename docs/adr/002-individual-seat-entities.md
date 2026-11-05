# ADR 002: Assentos como Documentos Materializados vs. Matriz Calculada

## Status
Aceito

## Contexto
Avaliou-se calcular os assentos dinamicamente em memória no backend a partir de um schema de sala simplificado com dimensões ($N \times M$).

## Decisão
Persistir cada assento da sessão como um documento individual na collection `session_seats` (ou documentos filhos bem definidos).

## Consequências
- **Concorrência Granular:** No MongoDB (WiredTiger), o lock de escrita ocorre no nível do documento. Se os assentos fossem um array dentro de um único documento de sessão, qualquer reserva travaria o documento da sessão inteira. Com documentos separados por assento, reservas em cadeiras diferentes ocorrem em paralelo sem contenção mútua.
- **Suporte a Assentos Especiais:** Permite metadados por assento (PCD, mobilidade reduzida, VIP, assento quebrado/manutenção).