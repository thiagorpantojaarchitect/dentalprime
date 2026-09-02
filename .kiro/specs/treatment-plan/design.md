# Design — treatment-plan

## Visão geral

Serviço de domínio para planos de tratamento, aceitação de casos e evolução.
Depende de identity-access (contexto e autorização) e patient-record (paciente e
diagnóstico). Publica eventos consumidos por finance quando itens são aceitos.

Referências: `documentation/data-model.md`, `.kiro/steering/clinical-safety.md`.

## Componentes

### TreatmentPlanService
- Cria, revisa (nova versão) e consulta planos, escopados por tenant.
- Vincula plano a paciente e autoria; preserva histórico.

### PlanItemService
- Gerencia itens do plano: procedimento, custo estimado, fase, ordem,
  dependências e status.

### AcceptanceService
- Registra aceitação/recusa/adiamento por plano ou item, com histórico.
- Ao aceitar item, publica evento para finance.

### ProcedureCatalogService
- Mantém o catálogo de procedimentos próprios da clínica. Bloqueia inclusão de
  códigos licenciados sem acordo formal.

## Modelo de dados

Domínio treatment-plan de `documentation/data-model.md`: `treatment_plan`,
`treatment_plan_item`, `procedure_catalog`, `plan_acceptance`. `tenant_id`
obrigatório, versionamento de plano, campos de auditoria.

## Fluxos críticos

- **Criar plano**: valida paciente/permissão, cria plano com itens do catálogo,
  registra autoria.
- **Aceitar item**: registra decisão, publica `TreatmentItemAccepted` para
  finance.
- **Revisar plano**: cria nova versão; versão anterior permanece consultável.
- **Evolução**: transições de status de item, com histórico.

## Integração por eventos

Publica em EventBridge: `TreatmentPlanCreated`, `TreatmentItemAccepted`,
`TreatmentItemCompleted`. Consome eventos de paciente conforme necessário.
Contratos versionados.

## Segurança e integridade clínica

- Nenhuma decisão clínica registrada por automação/IA sem confirmação humana.
- RBAC do identity-access; toda alteração/consulta de plano auditada.
- Isolamento por `tenant_id`.

## Tratamento de erros

- Tentativa de incluir código licenciado sem acordo é rejeitada com mensagem
  clara.
- Erros não expõem dados clínicos nem stack traces ao cliente.

## Estratégia de testes

- Versionamento: revisão preserva o plano anterior.
- Aceitação publica evento para finance corretamente.
- Bloqueio de código licenciado sem acordo.
- Isolamento por tenant e auditoria de alterações.
