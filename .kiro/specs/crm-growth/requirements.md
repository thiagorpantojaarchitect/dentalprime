# Requisitos — crm-growth

## Introdução

O módulo crm-growth cuida do relacionamento com pacientes e prospects: captação
de leads, reativação de pacientes inativos, campanhas e segmentação. Apoia
crescimento e retenção sem comprometer a LGPD. Toda comunicação respeita
consentimento, finalidade e opt-out.

Referências: `documentation/PRD.md`, `documentation/data-model.md`,
`.kiro/steering/security-lgpd.md`.

## Requisitos

### Requisito 1 — Gestão de leads

**História:** Como responsável por captação, quero cadastrar e acompanhar leads,
para converter contatos em pacientes.

**Critérios de aceitação:**
1. QUANDO um lead é cadastrado ENTÃO o sistema DEVE associá-lo ao `tenant_id`,
   com origem e dados de contato.
2. O sistema DEVE suportar status do lead: novo, em contato, qualificado,
   convertido, perdido.
3. QUANDO o status muda ENTÃO o sistema DEVE registrar a alteração (auditada).
4. QUANDO um lead é convertido ENTÃO o sistema DEVE registrar a conversão e
   permitir vincular ao paciente resultante.

### Requisito 2 — Interações

**História:** Como equipe de relacionamento, quero registrar interações com
leads e pacientes, para manter o histórico de contato.

**Critérios de aceitação:**
1. QUANDO uma interação ocorre ENTÃO o sistema DEVE registrar tipo, canal,
   data/hora e autor.
2. O sistema DEVE listar as interações de um lead/paciente em ordem cronológica.

### Requisito 3 — Campanhas

**História:** Como gestor, quero criar campanhas de captação e reativação, para
alcançar públicos específicos.

**Critérios de aceitação:**
1. O sistema DEVE permitir criar campanhas com nome, finalidade e período.
2. QUANDO uma campanha é executada ENTÃO o sistema DEVE selecionar apenas
   contatos elegíveis (com consentimento vigente e sem opt-out).
3. SE um contato não é elegível ENTÃO o sistema NÃO DEVE incluí-lo na campanha.

### Requisito 4 — Segmentação

**História:** Como gestor, quero segmentar contatos, para direcionar campanhas.

**Critérios de aceitação:**
1. O sistema DEVE permitir definir segmentos por critérios (ex.: inativos há N
   meses, origem do lead).
2. A avaliação de um segmento DEVE respeitar o isolamento por `tenant_id`.

### Requisito 5 — Consentimento e opt-out (LGPD)

**História:** Como titular de dados, quero controlar se posso ser contatado,
conforme a LGPD.

**Critérios de aceitação:**
1. O sistema DEVE registrar consentimento de contato por canal e finalidade.
2. QUANDO um contato solicita opt-out ENTÃO o sistema DEVE registrar e passar a
   considerá-lo não elegível para comunicação da finalidade correspondente.
3. QUANDO uma campanha seleciona contatos ENTÃO o sistema DEVE verificar
   consentimento/opt-out antes de incluir.
4. Toda decisão de elegibilidade e cada opt-out DEVE ser auditada.

### Requisito 6 — Segurança e isolamento

**História:** Como operador, quero que os dados de CRM sejam isolados e
protegidos.

**Critérios de aceitação:**
1. Toda consulta DEVE ser filtrada por `tenant_id`.
2. Ações DEVEM respeitar RBAC (crm:read / crm:manage) e ser auditadas.
3. Segredos de canais/integrações DEVEM vir do Secrets Manager.
