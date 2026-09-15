# Dashboards e paginação — DentalPrime

Refinamentos de produto que expõem indicadores agregados por domínio e um
contrato de paginação compartilhado. Tudo é somente leitura, isolado por tenant
e auditado.

Referências: `.kiro/steering/architecture.md`,
`.kiro/steering/security-lgpd.md`, `.kiro/steering/product-vision.md`.

## Contrato de paginação compartilhado

`@dentalprime/core` (`packages/core/src/pagination.ts`) padroniza listagens
paginadas entre os serviços:

- `PageQuery` — `{ limit, offset }` já normalizados.
- `Paginated<T>` — `{ items, total, limit, offset }`.
- `parsePageQuery(raw)` — normaliza entrada crua (query string) para uma
  `PageQuery` válida. Nunca lança: `limit` fica entre 1 e `MAX_PAGE_LIMIT`
  (100, padrão 20), `offset` >= 0 (padrão 0), valores inválidos caem no padrão.
- `buildPage(items, total, query)` — monta o resultado paginado.

O teto de `limit` protege o banco de consultas sem limite. O contrato vive no
core para evitar divergência entre módulos.

## Endpoints de dashboard

Cada endpoint é `GET /dashboard`, exige autenticação, aplica a permissão de
leitura do domínio, filtra por `tenantId` e registra uma trilha de auditoria de
visualização. Nenhum deles altera dado.

### finance — `GET /dashboard`

Consolida faturas por status. Permissão `finance:read`. Auditoria
`finance.dashboard_viewed`.

Resposta:

- `byStatus` — contagem, total faturado e saldo por status (`open`,
  `partially_paid`, `paid`, `cancelled`), em ordem estável.
- `totalInvoices` — número total de faturas.
- `billedCents` / `receivedCents` / `outstandingCents` — total faturado, já
  recebido e a receber (em centavos), excluindo faturas canceladas.

Valores monetários seguem o padrão do domínio: centavos inteiros
(`services/finance/src/domain/money.ts`), somados com `sumCents`.

### smart-scheduling — `GET /dashboard?from=<ISO>&to=<ISO>`

Consolida agendamentos por status numa janela `[from, to)` (por `startsAt`).
Permissão `appointment:read`. Auditoria `scheduling.dashboard_viewed`. Intervalo
inválido (`from >= to`) retorna erro de validação.

Resposta:

- `byStatus` — contagem por status (`booked`, `confirmed`, `attended`,
  `no_show`, `cancelled`).
- `total` — total de agendamentos na janela.
- `attendanceRate` / `noShowRate` — comparecimento e faltas sobre os
  agendamentos com desfecho conhecido (`attended` + `no_show`). `null` quando não
  há desfechos no período.

### crm-growth — `GET /dashboard`

Consolida o funil de leads. Permissão `crm:read`. Auditoria
`crm.dashboard_viewed`.

Resposta:

- `funnel` — contagem por status (`new`, `contacted`, `qualified`, `converted`,
  `lost`), em ordem estável.
- `totalLeads` — total de leads do tenant.
- `conversionRate` — convertidos sobre o total, em `[0,1]`. `null` sem leads.

## Agregação no repositório

As contagens/somas são calculadas na camada de repositório, filtrando por
`tenantId`:

- finance: `InvoiceRepository.summarizeByStatus` (Drizzle `count()` + `sum()`
  com `groupBy(status)`).
- smart-scheduling: `AppointmentRepository.summarizeByStatusInRange` (Drizzle
  `count()` + `groupBy(status)`, filtro por `startsAt`).
- crm-growth: `LeadRepository.countByStatus` (Drizzle `count()` +
  `groupBy(status)`).

Cada método tem também uma implementação em memória equivalente para os testes.

## Testes

Dois níveis por domínio, seguindo o padrão do repositório:

- Serviço (`dashboard-service.test.ts`): agregação, taxas derivadas, auditoria e
  negação de acesso por papel.
- Rota (`app.test.ts`): 401 sem token, validação de query (scheduling) e formato
  da resposta agregada.

Contrato de paginação: `packages/core/src/pagination.test.ts` cobre normalização
de limite/offset, limites, valores inválidos e montagem da página.
