# Tarefas — finance

- [ ] 1. Estruturar o serviço finance
  - Pacote em `services/` em camadas; integrar contexto do identity-access
  - _Requisitos: 1, 8_

- [ ] 2. Modelar persistência e migrações
  - [ ] 2.1 Migrações para invoice e invoice_item
    - tenant_id, unidade, UUID, dados fiscais estruturados, auditoria
    - _Requisitos: 1, 6_
  - [ ] 2.2 Migrações para payment e payment_plan (parcelas)
    - _Requisitos: 2, 3_
  - [ ] 2.3 Migrações para provider_payout e reconciliation
    - _Requisitos: 4, 5_
  - [ ] 2.4 Migração para insurance_claim (desabilitado por padrão)
    - _Requisitos: 7_

- [ ] 3. Implementar InvoiceService
  - Criar/alterar faturas e itens; gerar item a partir de evento de
    treatment-plan; auditar
  - _Requisitos: 1_

- [ ] 4. Implementar PaymentService
  - Registrar pagamentos totais/parciais; atualizar saldo; segredos de gateway
    via Secrets Manager
  - _Requisitos: 2_

- [ ] 5. Implementar PaymentPlanService
  - Parcelas com vencimentos e status; marcar atrasadas no vencimento
  - _Requisitos: 3_

- [ ] 6. Implementar PayoutService
  - Cálculo de repasses por regra; registrar base e valor; auditar
  - _Requisitos: 4_

- [ ] 7. Implementar ReconciliationService
  - Conciliar pagamentos x recebimentos; sinalizar divergências
  - _Requisitos: 5_

- [ ] 8. Regras fiscais brasileiras
  - Armazenar dados fiscais estruturados e rastreáveis; não emitir documento
    fiscal via integração/licença sem acordo formal
  - Confirmar detalhamento com contador/parceiro fiscal
  - _Requisitos: 6_

- [ ] 9. Consumir e publicar eventos
  - Consumir TreatmentItemAccepted; publicar InvoiceIssued, PaymentReceived,
    versionados
  - _Requisitos: 1, 2_

- [ ] 10. Segurança e LGPD
  - Criptografia KMS, RBAC, auditoria, isolamento por tenant, retenção e backup
    imutável
  - _Requisitos: 8_

- [ ] 11. Verificação final
  - Build e testes; cobrir saldo de fatura, parcelas atrasadas, conciliação e
    isolamento
  - _Requisitos: 1, 2, 3, 5, 8_
