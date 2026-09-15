# Tarefas — patient-record

- [x] 1. Estruturar o serviço patient-record
  - Criar pacote em `services/` em camadas; integrar contexto autenticado do
    identity-access
  - _Requisitos: 1, 3_

- [ ] 2. Modelar persistência e migrações
  - **Status em 15/09/2026:** parcial; o modelo clínico principal está migrado,
    mas a entidade separada `image_asset` de 2.4 permanece aberta.
  - [x] 2.1 Migrações para patient e patient_consent
    - tenant_id, UUID, PII marcada como sensível, campos de auditoria
    - _Requisitos: 1, 2_
  - [x] 2.2 Migrações para clinical_record com versionamento (append)
    - Sem sobrescrita destrutiva; autoria e data/hora
    - _Requisitos: 3_
  - [x] 2.3 Migrações para anamnesis, odontogram
    - _Requisitos: 4_
  - [ ] 2.4 Migrações para clinical_document e image_asset (metadados + S3)
    - **Status em 15/09/2026:** documentos e imagens usam hoje
      `clinical_document`; falta modelar `image_asset` separadamente. Não bloqueia
      desenvolvimento, mas deve ser decidido antes da evolução clínica em produção.
    - _Requisitos: 5_

- [x] 3. Implementar PatientService
  - Cadastro/atualização/busca com isolamento por tenant e validação de CPF
  - Auditar alterações; tratar PII como sensível
  - _Requisitos: 1_

- [ ] 4. Implementar ConsentService
  - Registro, verificação e revogação de consentimento por finalidade
  - Bloquear operações sem base legal aplicável
  - **Status em 15/09/2026:** registro e consulta existem, porém a exigência de
    consentimento ainda não está conectada aos fluxos clínicos. É gate para dados reais.
  - _Requisitos: 2_

- [x] 5. Implementar ClinicalRecordService (versionado)
  - Entradas com autoria; correções criam nova versão
  - Impedir exclusão silenciosa; auditar acesso ao prontuário
  - _Requisitos: 3_

- [x] 6. Implementar AnamnesisService e OdontogramService
  - Anamnese com histórico; odontograma por dente/face; destacar alertas
    clínicos
  - _Requisitos: 4_

- [x] 7. Implementar DocumentService
  - Upload/download via S3 com KMS; validar tipos; guardar metadados; auditar
  - _Requisitos: 5_

- [ ] 8. Implementar PatientRightsService
  - Acesso, correção, portabilidade; eliminação respeitando guarda legal
  - Auditar toda operação de direitos do titular
  - **Status em 15/09/2026:** exportação, portabilidade e eliminação protegida
    existem; falta um fluxo dedicado de solicitação de correção pelo titular.
    É pendência de conformidade para produção com dados reais.
  - _Requisitos: 6_

- [ ] 9. Integração de IA assistiva (guardrails)
  - Garantir revisão humana antes de persistir saída de IA como registro clínico
  - Minimização de dados em prompts; identificar conteúdo de IA
  - Confirmar desenho com o usuário antes de implementar fluxos que gerem
    conteúdo clínico
  - **Status em 15/09/2026:** integração de IA clínica não foi implementada.
    Não bloqueia desenvolvimento sem essa capacidade; quando ativada, revisão
    humana e minimização de dados serão gates obrigatórios.
  - _Requisitos: 7_

- [ ] 10. Verificação final
  - Build e testes; cobrir versionamento, consentimento, auditoria e isolamento
  - **Status em 15/09/2026:** build e testes atuais passam, mas a cobertura de
    consentimento aplicado e IA clínica depende dos itens 4 e 9. Gate para dados reais.
  - _Requisitos: 1, 2, 3, 5, 6, 7_
