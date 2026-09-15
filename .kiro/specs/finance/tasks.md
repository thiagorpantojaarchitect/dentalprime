# Tarefas — finance

- [x] 1. Estruturar o serviço finance
  - Pacote em `services/` em camadas; integrar contexto do identity-access
  - _Requisitos: 1, 8_

- [x] 2. Modelar persistência e migrações
  - [x] 2.1 Migrações para invoice e invoice_item
    - tenant_id, unidade, UUID, dados fiscais estruturados, auditoria
    - _Requisitos: 1, 6_
  - [x] 2.2 Migrações para payment e payment_plan (parcelas)
    - _Requisitos: 2, 3_
  - [x] 2.3 Migrações para provider_payout e reconciliation
    - _Requisitos: 4, 5_
  - [x] 2.4 Migração para insurance_claim (desabilitado por padrão)
    - _Requisitos: 7_

- [x] 3. Implementar InvoiceService
  - Criar/alterar faturas e itens; gerar item a partir de evento de
    treatment-plan; auditar
  - _Requisitos: 1_

- [ ] 4. Implementar PaymentService
  - Registrar pagamentos totais/parciais; atualizar saldo; segredos de gateway
    via Secrets Manager
  - **Status em 15/09/2026:** pagamentos manuais, saldo e idempotência estão
    prontos; falta o conector de gateway e seu segredo em runtime. É integração
    externa, não bloqueia desenvolvimento local, mas é gate para cobrança real.
  - _Requisitos: 2_

- [ ] 5. Implementar PaymentPlanService
  - Parcelas com vencimentos e status; marcar atrasadas no vencimento
  - **Status em 15/09/2026:** parcelamento e cálculo de atraso existem, porém
    falta um job agendado que execute a marcação. É pendência operacional de produção.
  - _Requisitos: 3_

- [ ] 6. Implementar PayoutService
  - Cálculo de repasses por regra; registrar base e valor; auditar
  - **Status em 15/09/2026:** cálculo, base, valor e auditoria existem; a taxa
    ainda vem da requisição, sem regras persistidas por procedimento/profissional.
    É backlog funcional para produção financeira.
  - _Requisitos: 4_

- [x] 7. Implementar ReconciliationService
  - Conciliar pagamentos x recebimentos; sinalizar divergências
  - _Requisitos: 5_

- [ ] 8. Regras fiscais brasileiras
  - Armazenar dados fiscais estruturados e rastreáveis; não emitir documento
    fiscal via integração/licença sem acordo formal
  - Confirmar detalhamento com contador/parceiro fiscal
  - **Status em 15/09/2026:** há armazenamento JSON estruturado, mas faltam
    serviço/API e modelo validado de tributos e retenções. É gate fiscal para
    produção e depende de contador/parceiro externo.
  - _Requisitos: 6_

- [ ] 9. Consumir e publicar eventos
  - Consumir TreatmentItemAccepted; publicar InvoiceIssued, PaymentReceived,
    versionados
  - **Status em 15/09/2026:** o handler idempotente e os eventos de saída estão
    implementados, mas falta o consumidor inbound conectado ao barramento. É
    pendência de integração para o fluxo automático em AWS/produção.
  - _Requisitos: 1, 2_

- [x] 10. Segurança e LGPD
  - Criptografia KMS, RBAC, auditoria, isolamento por tenant, retenção e backup
    imutável
  - _Requisitos: 8_

- [x] 11. Verificação final
  - Build e testes; cobrir saldo de fatura, parcelas atrasadas, conciliação e
    isolamento
  - _Requisitos: 1, 2, 3, 5, 8_
