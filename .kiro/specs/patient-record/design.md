# Design — patient-record

## Visão geral

Serviço de domínio para cadastro de paciente e prontuário clínico. É o núcleo de
dados sensíveis. Depende de identity-access para contexto autenticado
(tenant/unidade/papel) e decisão de autorização. Prioriza integridade do
histórico clínico e conformidade LGPD.

Referências: `documentation/data-model.md`, `.kiro/steering/security-lgpd.md`,
`.kiro/steering/clinical-safety.md`.

## Componentes

### PatientService
- Cadastro, atualização e busca de pacientes, escopados por tenant.
- Validação de CPF e unicidade por tenant. Trata PII como sensível.

### ConsentService
- Registro, verificação e revogação de consentimento por finalidade.
- Consultado antes de operações que dependem de base legal.

### ClinicalRecordService
- Entradas clínicas versionadas (append), com autoria e data/hora.
- Sem sobrescrita destrutiva; correções criam nova versão.

### AnamnesisService / OdontogramService
- Anamnese com histórico; odontograma por dente/face com condições e autoria.
- Alertas clínicos (alergias etc.) destacados.

### DocumentService
- Upload/download de imagens e documentos via S3 (KMS). Banco guarda metadados e
  referência. Valida tipos permitidos.

### PatientRightsService
- Acesso, correção, portabilidade e eliminação (respeitando guarda legal).

## Modelo de dados

Domínio patient-record de `documentation/data-model.md`: `patient`,
`patient_consent`, `clinical_record`, `anamnesis`, `odontogram`,
`clinical_document`, `image_asset`. UUID como PK, `tenant_id` obrigatório,
versionamento em registros clínicos, campos de auditoria.

## Fluxos críticos

- **Correção de prontuário**: cria nova versão; versão anterior permanece
  consultável. Nenhuma exclusão silenciosa.
- **Anexo de arquivo**: valida tipo, envia ao S3 com KMS, grava metadados,
  audita.
- **Consulta de prontuário**: verifica permissão (identity-access), audita
  acesso.
- **Apoio de IA**: saída assistiva identificada; revisão humana obrigatória
  antes de virar registro clínico; dados minimizados.

## Segurança e LGPD

- PII e dados clínicos criptografados em repouso (KMS) e em trânsito (TLS).
- Acesso via RBAC do identity-access; toda leitura/alteração de dado sensível é
  auditada.
- Consentimento verificado por finalidade.
- Retenção conforme prazos legais; eliminação respeita guarda de prontuário.
- Segredos no Secrets Manager; logs sem PII/segredos em claro.

## Tratamento de erros

- Upload de tipo não permitido é rejeitado com mensagem clara e sem vazar
  detalhes internos.
- Falta de consentimento aplicável bloqueia a operação e informa a razão de
  forma adequada.
- Erros não expõem PII nem stack traces ao cliente.

## Estratégia de testes

- Testes de versionamento: correção preserva histórico; exclusão destrutiva é
  impedida.
- Testes de isolamento por tenant no acesso a pacientes e prontuários.
- Testes de verificação de consentimento por finalidade.
- Testes de auditoria em acesso/alteração de dados sensíveis.
- Testes de que saída de IA exige revisão humana antes de persistir como
  registro clínico.
