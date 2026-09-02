# Requisitos (stub de escopo) — crm-growth

> Stub de escopo. A spec completa será desenvolvida quando este módulo entrar no
> roadmap ativo. Prioridade: média.

## Introdução

O módulo crm-growth cuida do relacionamento com pacientes e prospects: captação
de leads, reativação de pacientes inativos, campanhas e segmentação. Apoia
crescimento e retenção sem comprometer a LGPD.

Referências: `documentation/PRD.md`, `documentation/data-model.md`,
`.kiro/steering/security-lgpd.md`.

## Escopo

Incluído:
- Cadastro e acompanhamento de leads.
- Campanhas de captação e reativação.
- Registro de interações com leads/pacientes.
- Segmentação para campanhas.

Fora de escopo (fundação):
- Envio de comunicação sem base legal/consentimento adequado.
- Compra ou uso de bases de terceiros não autorizadas.

## Entidades

`lead`, `campaign`, `interaction`, `segment` (ver
`documentation/data-model.md`).

## Restrições

- Multi-tenant por `tenant_id`.
- Comunicação respeita consentimento e finalidade (LGPD); permitir opt-out.
- Segredos de canais/integrações no Secrets Manager.

## Próximos passos

Detalhar requisitos EARS, design e tasks quando o módulo for priorizado.
