# Design — crm-growth

## Visão geral

Serviço de domínio para relacionamento e crescimento: leads, interações,
campanhas e segmentação, com uma camada de consentimento de contato que garante
conformidade LGPD (opt-in/opt-out) antes de qualquer comunicação. Depende de
identity-access (contexto e autorização).

Referências: `documentation/data-model.md`, `.kiro/steering/security-lgpd.md`.

## Componentes

### LeadService
- Cadastro, atualização de status (novo → em contato → qualificado →
  convertido/perdido) e conversão (vínculo opcional ao paciente).

### InteractionService
- Registro e listagem de interações (tipo, canal, data/hora, autor).

### ConsentService (contato)
- Registro de consentimento por canal e finalidade; opt-out.
- `isEligible(contact, purpose, channel)`: ponto único de decisão de
  elegibilidade para comunicação.

### CampaignService
- Cria campanhas; ao selecionar público, filtra por elegibilidade (consentimento
  vigente e sem opt-out). Contatos não elegíveis são excluídos e a decisão é
  auditada.

### SegmentService
- Define e avalia segmentos por critérios, sempre escopado por tenant.

## Modelo de dados

Domínio crm-growth de `documentation/data-model.md`: `lead`, `campaign`,
`interaction`, `segment`, mais `contact_consent` (consentimento/opt-out por
canal e finalidade) e `audit_log`. `tenant_id` obrigatório.

## Fluxos críticos

- **Converter lead**: muda status para convertido, registra vínculo com paciente
  e audita.
- **Executar campanha**: resolve o segmento, filtra por elegibilidade
  (ConsentService), audita quem foi incluído/excluído, e retorna a lista elegível
  (o envio em si é assíncrono e fora deste serviço).
- **Opt-out**: registra a recusa; a partir daí o contato não é elegível para a
  finalidade.

## Segurança e LGPD

- Isolamento por `tenant_id` em toda consulta.
- Nenhuma comunicação a contato sem base legal/consentimento; opt-out sempre
  respeitado.
- RBAC (crm:read / crm:manage); auditoria de ações e decisões de elegibilidade.
- Segredos de canais no Secrets Manager. Sem uso de bases de terceiros não
  autorizadas.

## Estratégia de testes

- Opt-out torna o contato inelegível e o exclui da seleção de campanha.
- Conversão de lead atualiza status e audita.
- Isolamento por tenant nas consultas.
- Autorização allow/deny por papel.
