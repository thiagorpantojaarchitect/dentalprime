# Design — finance

## Visão geral

Serviço de domínio financeiro: faturamento, pagamentos, parcelamento, repasses e
conciliação, com dados fiscais brasileiros estruturados. Depende de
identity-access (contexto e autorização) e consome eventos de treatment-plan.
Emissão fiscal e convênios que exijam integração/licença ficam fora até acordo
formal.

Referências: `documentation/data-model.md`, `.kiro/steering/security-lgpd.md`.

## Componentes

### InvoiceService
- Cria e altera faturas e itens; gera item a partir de evento de treatment-plan;
  calcula totais; audita.

### PaymentService
- Registra pagamentos (total/parcial), atualiza saldo. Integra gateways com
  segredos resolvidos do Secrets Manager em runtime.

### PaymentPlanService
- Cria parcelas com vencimentos; acompanha status; marca atrasadas no
  vencimento.

### PayoutService
- Calcula repasses por regras configuradas (procedimento/profissional); registra
  base e valor.

### ReconciliationService
- Concilia pagamentos com recebimentos; sinaliza divergências para revisão.

### FiscalService
- Mantém dados fiscais estruturados e rastreáveis (tomador, natureza do serviço,
  tributos, retenções). Não emite documento fiscal via integração/licença sem
  acordo formal.

## Modelo de dados

Domínio finance de `documentation/data-model.md`: `invoice`, `invoice_item`,
`payment`, `payment_plan`, `provider_payout`, `reconciliation`,
`insurance_claim`. `tenant_id` obrigatório, valores monetários com precisão
adequada, campos de auditoria. `insurance_claim` desabilitado por padrão.

## Fluxos críticos

- **Gerar cobrança a partir de plano**: consome `TreatmentItemAccepted`, cria
  invoice_item.
- **Registrar pagamento**: atualiza saldo; publica `PaymentReceived`.
- **Parcelamento**: cria parcelas; job marca atrasadas no vencimento.
- **Conciliação**: compara pagamentos e recebimentos; divergência vira alerta.

## Integração por eventos

Consome `TreatmentItemAccepted` (treatment-plan). Publica em EventBridge:
`InvoiceIssued`, `PaymentReceived`. Contratos versionados.

## Segurança e LGPD

- Dados financeiros criptografados em repouso (KMS) e em trânsito (TLS); acesso
  por RBAC.
- Toda operação financeira sensível auditada.
- Segredos de gateway/fiscais no Secrets Manager; nunca em logs em claro.
- Isolamento por `tenant_id`; retenção legal; backups imutáveis.

## Valores monetários

- Usar representação de precisão fixa (evitar ponto flutuante binário para
  dinheiro). Definir moeda por tenant (BRL padrão).

## Tratamento de erros

- Pagamento acima do saldo é tratado conforme política (rejeição ou crédito),
  sem inconsistência de saldo.
- Falhas de gateway não deixam a fatura em estado ambíguo (idempotência).
- Erros não expõem dados financeiros nem stack traces ao cliente.

## Estratégia de testes

- Cálculo de saldo em pagamentos parciais e totais.
- Marcação de parcelas atrasadas no vencimento.
- Conciliação com e sem divergência.
- Idempotência no registro de pagamento.
- Isolamento por tenant e auditoria.
