# Tarefas — patient-record

- [ ] 1. Estruturar o serviço patient-record
  - Criar pacote em `services/` em camadas; integrar contexto autenticado do
    identity-access
  - _Requisitos: 1, 3_

- [ ] 2. Modelar persistência e migrações
  - [ ] 2.1 Migrações para patient e patient_consent
    - tenant_id, UUID, PII marcada como sensível, campos de auditoria
    - _Requisitos: 1, 2_
  - [ ] 2.2 Migrações para clinical_record com versionamento (append)
    - Sem sobrescrita destrutiva; autoria e data/hora
    - _Requisitos: 3_
  - [ ] 2.3 Migrações para anamnesis, odontogram
    - _Requisitos: 4_
  - [ ] 2.4 Migrações para clinical_document e image_asset (metadados + S3)
    - _Requisitos: 5_

- [ ] 3. Implementar PatientService
  - Cadastro/atualização/busca com isolamento por tenant e validação de CPF
  - Auditar alterações; tratar PII como sensível
  - _Requisitos: 1_

- [ ] 4. Implementar ConsentService
  - Registro, verificação e revogação de consentimento por finalidade
  - Bloquear operações sem base legal aplicável
  - _Requisitos: 2_

- [ ] 5. Implementar ClinicalRecordService (versionado)
  - Entradas com autoria; correções criam nova versão
  - Impedir exclusão silenciosa; auditar acesso ao prontuário
  - _Requisitos: 3_

- [ ] 6. Implementar AnamnesisService e OdontogramService
  - Anamnese com histórico; odontograma por dente/face; destacar alertas
    clínicos
  - _Requisitos: 4_

- [ ] 7. Implementar DocumentService
  - Upload/download via S3 com KMS; validar tipos; guardar metadados; auditar
  - _Requisitos: 5_

- [ ] 8. Implementar PatientRightsService
  - Acesso, correção, portabilidade; eliminação respeitando guarda legal
  - Auditar toda operação de direitos do titular
  - _Requisitos: 6_

- [ ] 9. Integração de IA assistiva (guardrails)
  - Garantir revisão humana antes de persistir saída de IA como registro clínico
  - Minimização de dados em prompts; identificar conteúdo de IA
  - Confirmar desenho com o usuário antes de implementar fluxos que gerem
    conteúdo clínico
  - _Requisitos: 7_

- [ ] 10. Verificação final
  - Build e testes; cobrir versionamento, consentimento, auditoria e isolamento
  - _Requisitos: 1, 2, 3, 5, 6, 7_
