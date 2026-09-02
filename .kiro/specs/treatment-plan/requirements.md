# Requisitos — treatment-plan

## Introdução

O módulo treatment-plan gerencia planos de tratamento propostos ao paciente,
a aceitação de casos (case acceptance) e a evolução do plano. Conecta
patient-record (diagnóstico e prontuário) e finance (cobrança dos itens
aceitos), preservando a integridade das decisões clínicas.

Referências: `documentation/PRD.md`, `documentation/data-model.md`,
`.kiro/steering/clinical-safety.md`, `.kiro/steering/security-lgpd.md`.

## Requisitos

### Requisito 1 — Criação do plano de tratamento

**História:** Como dentista, quero elaborar um plano de tratamento a partir do
diagnóstico, para propor ao paciente uma sequência de procedimentos.

**Critérios de aceitação:**
1. QUANDO um plano é criado ENTÃO o sistema DEVE vinculá-lo ao paciente, ao
   `tenant_id` e à autoria do profissional.
2. O sistema DEVE permitir adicionar itens de plano a partir do catálogo de
   procedimentos da clínica.
3. QUANDO um plano é criado ou alterado ENTÃO o sistema DEVE registrar autoria e
   data/hora.

### Requisito 2 — Itens do plano

**História:** Como dentista, quero detalhar cada item do plano, para que o
paciente entenda procedimentos, sequência e custo estimado.

**Critérios de aceitação:**
1. Cada item DEVE referenciar um procedimento do catálogo, com custo estimado e
   ordem de execução.
2. O sistema DEVE permitir agrupar itens em fases do tratamento.
3. SE um item depende de outro ENTÃO o sistema DEVE representar a dependência.

### Requisito 3 — Aceitação de casos

**História:** Como recepcionista, quero registrar a decisão do paciente sobre o
plano, para acompanhar a aceitação de casos.

**Critérios de aceitação:**
1. QUANDO o paciente decide sobre o plano ou item ENTÃO o sistema DEVE registrar
   aceitação, recusa ou adiamento com data/hora e autoria.
2. O sistema DEVE preservar o histórico de decisões (sem sobrescrita
   destrutiva).
3. QUANDO um item é aceito ENTÃO o sistema DEVE publicar evento para o módulo
   finance gerar cobrança.

### Requisito 4 — Evolução do plano

**História:** Como profissional clínico, quero acompanhar o andamento do plano,
para saber o que foi concluído e o que resta.

**Critérios de aceitação:**
1. O sistema DEVE suportar status de item: proposto, aceito, em andamento,
   concluído, cancelado.
2. QUANDO o status de um item muda ENTÃO o sistema DEVE registrar o histórico.
3. O sistema DEVE permitir revisar o plano criando nova versão, preservando a
   anterior.

### Requisito 5 — Catálogo de procedimentos

**História:** Como gerente, quero manter o catálogo de procedimentos da clínica,
para padronizar planos e custos.

**Critérios de aceitação:**
1. O sistema DEVE permitir cadastrar procedimentos próprios da clínica com nome,
   descrição e custo base, escopados por `tenant_id`.
2. SE um procedimento exigir código padronizado licenciado (ex.: CDT/ADA) ENTÃO
   o sistema NÃO DEVE incluí-lo sem acordo formal de licença.

### Requisito 6 — Segurança e integridade clínica

**História:** Como responsável clínico, quero que o plano preserve a integridade
das decisões, conforme a segurança clínica.

**Critérios de aceitação:**
1. Nenhuma automação ou IA DEVE registrar plano ou decisão clínica sem
   confirmação de profissional habilitado.
2. Toda consulta e alteração de plano DEVE respeitar RBAC e ser auditada.
3. Dados do plano DEVEM ser isolados por `tenant_id`.
