# Tarefas — ai-front-desk

- [ ] 1. Estruturar o serviço ai-front-desk
  - Pacote em `services/` em camadas; integrar contexto do identity-access
  - _Requisitos: 1, 6_

- [ ] 2. Modelar persistência e migrações
  - [ ] 2.1 Migrações para conversation e message (flag isAI)
    - _Requisitos: 1_
  - [ ] 2.2 Migrações para handoff e ai_action_log (status de revisão)
    - _Requisitos: 4, 5_

- [ ] 3. Definir AIProvider (interface) e StubAIProvider deterministico
  - Sem chamada real a fornecedor; chaves reais viriam do Secrets Manager
  - _Requisitos: 6_

- [ ] 4. Implementar Guardrails
  - Recusar pedidos de conteúdo clínico + recomendar handoff
  - Marcar saída que influencia cuidado como pendente de revisão
  - _Requisitos: 5_

- [ ] 5. Implementar ConversationService
  - Iniciar conversa; mensagens de usuário/IA (isAI); aplicar guardrails
  - _Requisitos: 1, 5_

- [ ] 6. Implementar TriageService
  - Triagem não clínica (motivo/urgência); urgência recomenda handoff
  - _Requisitos: 2_

- [ ] 7. Implementar HandoffService e SchedulingSuggestionService
  - Handoff registra motivo e marca conversa; sugestão de agendamento assistiva
    registra ai_action_log e não agenda
  - _Requisitos: 3, 4_

- [ ] 8. API HTTP e segurança
  - Rotas de conversas, mensagens, triagem, handoff, sugestões; RBAC; isolamento
  - _Requisitos: 6_

- [ ] 9. Verificação final
  - Build e testes; cobrir IA identificada, guardrail, sugestão não executa,
    handoff, isolamento
  - _Requisitos: 1, 3, 4, 5, 6_
