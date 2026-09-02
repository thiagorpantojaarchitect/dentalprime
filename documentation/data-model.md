# Modelo de Dados — DentalPrime

> Modelo conceitual da fundação. Detalhes físicos (colunas exatas, índices,
> migrações) são definidos nas specs de cada módulo. Banco alvo: Aurora
> PostgreSQL. Multi-tenant por `tenant_id`.

## 1. Princípios de modelagem

- **Multi-tenant por `tenant_id`.** Toda tabela de negócio carrega `tenant_id`.
  Repositórios aplicam o filtro sempre; nenhuma consulta cruza tenants sem
  autorização explícita e auditada.
- **Chaves.** Identificadores primários são UUID. Chaves naturais (CPF, e-mail)
  são únicas por tenant, não globalmente.
- **Auditoria.** Campos comuns: `created_at`, `updated_at`, `created_by`,
  `updated_by`. Dados sensíveis também registram acesso/alteração em trilha
  dedicada.
- **Histórico clínico preservado.** Registros clínicos usam versionamento/append
  em vez de sobrescrita destrutiva (ver `.kiro/steering/clinical-safety.md`).
- **Soft delete** para entidades que exigem retenção legal; hard delete apenas
  quando permitido e auditado.
- **Dados sensíveis** (PII, clínico, financeiro) criptografados em repouso (KMS)
  e com acesso restrito por RBAC.

## 2. Domínios e entidades centrais

### identity-access

| Entidade | Descrição |
|---|---|
| `tenant` | Clínica ou rede. Raiz do isolamento multi-tenant. |
| `clinic_unit` | Unidade física de uma rede (uma clínica pode ter várias). |
| `user` | Usuário do sistema (equipe, admin, paciente-usuário). |
| `role` | Papel (RBAC): owner, manager, dentist, specialist, assistant, front-desk, patient. |
| `permission` | Permissão granular associada a papéis. |
| `user_role` | Vínculo usuário-papel, escopado por tenant e unidade. |
| `session` | Sessão/refresh de autenticação (metadados; tokens não persistidos em claro). |
| `audit_log` | Trilha de acesso/alteração de dados sensíveis. |

### patient-record

| Entidade | Descrição |
|---|---|
| `patient` | Cadastro do paciente (PII: nome, CPF, contato, endereço). |
| `patient_consent` | Consentimento LGPD: finalidade, versão do termo, data, status. |
| `clinical_record` | Prontuário: entradas clínicas versionadas com autoria. |
| `anamnesis` | Histórico de saúde/anamnese do paciente. |
| `odontogram` | Mapa dental e condições por dente/face. |
| `clinical_document` | Documentos e exames (referência a objeto no S3). |
| `image_asset` | Imagens clínicas (radiografias, fotos) — metadados + S3. |

### smart-scheduling

| Entidade | Descrição |
|---|---|
| `provider` | Profissional agendável (vinculado a `user`). |
| `resource` | Recurso agendável (cadeira, sala, equipamento). |
| `availability` | Janelas de disponibilidade de provider/resource. |
| `appointment` | Agendamento: paciente, provider, unidade, horário, status. |
| `appointment_status_history` | Histórico de status (marcado, confirmado, atendido, faltou, cancelado). |
| `waitlist_entry` | Lista de espera para encaixe. |
| `reminder` | Lembrete/confirmação enviado e seu resultado. |

### treatment-plan

| Entidade | Descrição |
|---|---|
| `treatment_plan` | Plano de tratamento proposto ao paciente. |
| `treatment_plan_item` | Item/procedimento do plano, com status de aceitação. |
| `procedure_catalog` | Catálogo de procedimentos da clínica (nomes próprios; códigos licenciados só sob acordo). |
| `plan_acceptance` | Registro de aceitação/recusa de casos. |

### finance

| Entidade | Descrição |
|---|---|
| `invoice` | Cobrança/fatura ao paciente. |
| `invoice_item` | Itens da fatura (procedimentos, produtos). |
| `payment` | Pagamento recebido e meio. |
| `payment_plan` | Parcelamento. |
| `provider_payout` | Repasse a profissionais. |
| `reconciliation` | Conciliação financeira. |
| `insurance_claim` | Solicitação a convênio (integração sob acordo/parceria). |

### crm-growth

| Entidade | Descrição |
|---|---|
| `lead` | Contato/prospect. |
| `campaign` | Campanha de captação/reativação. |
| `interaction` | Interação registrada com lead/paciente. |
| `segment` | Segmentação para campanhas. |

### ai-front-desk

| Entidade | Descrição |
|---|---|
| `conversation` | Conversa da recepção por IA. |
| `message` | Mensagens da conversa (identificadas como IA quando aplicável). |
| `handoff` | Transferência de atendimento para humano. |
| `ai_action_log` | Ações sugeridas/executadas pela IA, com revisão humana quando afetam cuidado. |

## 3. Relacionamentos principais

- `tenant` 1—N `clinic_unit`, `user`, `patient`, e todas as entidades de negócio.
- `patient` 1—N `clinical_record`, `appointment`, `treatment_plan`, `invoice`.
- `provider` 1—N `availability`, `appointment`.
- `treatment_plan` 1—N `treatment_plan_item`; itens podem gerar `invoice_item`.
- `appointment` N—1 `patient`, `provider`, `clinic_unit`.
- `clinical_record` N—1 `patient`, com autoria (`user`) e versão.

## 4. Padrões transversais

- **Isolamento**: `tenant_id` obrigatório e indexado em toda tabela de negócio.
- **Versionamento clínico**: `clinical_record` e correlatos guardam versões;
  correções não apagam o registro anterior.
- **Auditoria**: acesso e alteração de `patient`, `clinical_record`,
  `clinical_document`, `image_asset`, `invoice` e correlatos vão para
  `audit_log`.
- **Consentimento**: operações sobre dados de paciente verificam
  `patient_consent` conforme finalidade.
- **Retenção**: entidades clínicas/financeiras respeitam prazos legais; backups
  imutáveis (AWS Backup).
- **Criptografia**: PII e dados clínicos/financeiros com KMS; segredos no
  Secrets Manager.

## 5. Notas de implementação

- Migrações versionadas por módulo; nenhuma alteração de schema fora de
  migração.
- Índices por `tenant_id` e por chaves de busca frequentes (paciente, data de
  agendamento).
- Nomes de tabelas e colunas em inglês; documentação em português.
- Dados de exemplo/seed usam placeholders genéricos, nunca PII real.
