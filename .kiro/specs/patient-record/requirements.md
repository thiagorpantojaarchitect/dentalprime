# Requisitos — patient-record

## Introdução

O módulo patient-record gerencia o cadastro do paciente e seu prontuário
clínico: anamnese, odontograma, evoluções, imagens e documentos. É o núcleo de
dados sensíveis do produto e o mais crítico em conformidade LGPD e segurança
clínica. Depende de identity-access para autenticação, autorização e tenant.

Referências: `.kiro/steering/security-lgpd.md`,
`.kiro/steering/clinical-safety.md`, `documentation/data-model.md`.

## Requisitos

### Requisito 1 — Cadastro de paciente

**História:** Como recepcionista, quero cadastrar e atualizar dados do paciente,
para identificá-lo e contatá-lo corretamente.

**Critérios de aceitação:**
1. QUANDO um paciente é cadastrado ENTÃO o sistema DEVE associá-lo ao `tenant_id`
   e validar dados de identificação (nome, CPF, contato).
2. SE o CPF já existir no tenant ENTÃO o sistema DEVE impedir duplicidade.
3. O sistema DEVE tratar CPF, contato e endereço como dados sensíveis
   (criptografia em repouso, acesso por RBAC).
4. QUANDO um cadastro é alterado ENTÃO o sistema DEVE auditar a alteração.

### Requisito 2 — Consentimento LGPD

**História:** Como responsável por conformidade, quero registrar e gerenciar o
consentimento do paciente, para tratar seus dados com base legal.

**Critérios de aceitação:**
1. QUANDO dados do paciente são coletados ENTÃO o sistema DEVE registrar o
   consentimento com finalidade, versão do termo e data.
2. QUANDO o paciente revoga consentimento ENTÃO o sistema DEVE registrar a
   revogação e restringir tratamentos que dependam daquela base.
3. QUANDO uma operação exige base legal ENTÃO o sistema DEVE verificar o
   consentimento aplicável antes de prosseguir.

### Requisito 3 — Prontuário clínico versionado

**História:** Como dentista, quero registrar a evolução clínica de forma
confiável, para que o histórico seja íntegro e rastreável.

**Critérios de aceitação:**
1. QUANDO uma entrada clínica é criada ENTÃO o sistema DEVE registrar autoria,
   data/hora e vínculo ao paciente.
2. QUANDO uma entrada clínica é corrigida ENTÃO o sistema DEVE preservar a versão
   anterior (versionamento/append), sem sobrescrita destrutiva.
3. O sistema NÃO DEVE permitir exclusão silenciosa de registro clínico.
4. QUANDO o prontuário é consultado ENTÃO o sistema DEVE auditar o acesso.

### Requisito 4 — Anamnese e odontograma

**História:** Como profissional clínico, quero registrar anamnese e o mapa
dental, para embasar diagnóstico e tratamento.

**Critérios de aceitação:**
1. O sistema DEVE permitir registrar e atualizar a anamnese do paciente com
   histórico.
2. O sistema DEVE representar o odontograma por dente/face com condições
   registradas e autoria.
3. Alertas clínicos (ex.: alergias) DEVEM ser destacados e tratados como
   informação crítica.

### Requisito 5 — Imagens e documentos

**História:** Como especialista, quero anexar exames e imagens ao prontuário,
para consultar durante o tratamento.

**Critérios de aceitação:**
1. QUANDO um arquivo é anexado ENTÃO o sistema DEVE armazená-lo no S3 com
   criptografia KMS e guardar apenas metadados + referência no banco.
2. O acesso a imagens/documentos DEVE respeitar RBAC e ser auditado.
3. SE o tipo de arquivo não for permitido ENTÃO o sistema DEVE rejeitar o upload.

### Requisito 6 — Direitos do titular

**História:** Como paciente, quero exercer meus direitos sobre meus dados,
conforme a LGPD.

**Critérios de aceitação:**
1. O sistema DEVE permitir acesso, correção e portabilidade dos dados do
   paciente.
2. QUANDO eliminação é solicitada ENTÃO o sistema DEVE respeitar obrigações
   legais de guarda de prontuário, aplicando restrição/anonimização quando a
   eliminação total não for permitida.
3. Toda operação sobre direitos do titular DEVE ser auditada.

### Requisito 7 — Segurança e IA

**História:** Como responsável clínico, quero que qualquer apoio de IA seja
seguro e assistivo, para não comprometer o cuidado.

**Critérios de aceitação:**
1. SE a IA do produto gerar conteúdo que possa virar registro clínico ENTÃO o
   sistema DEVE exigir revisão humana antes de persistir.
2. Prompts/respostas de IA com dados de paciente DEVEM seguir minimização e não
   vazar a terceiros não autorizados.
3. Conteúdo produzido por IA DEVE ser identificado como tal.
