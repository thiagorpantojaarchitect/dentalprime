# services/

Serviços de backend por domínio. Cada serviço corresponde a um limite de domínio
descrito em uma spec de `.kiro/specs/`.

Domínios previstos: identity-access, patient-record, smart-scheduling,
treatment-plan, finance, crm-growth, ai-front-desk.

Regras:
- Camadas: contrato/API → aplicação → domínio → infraestrutura.
- Acesso a dados via repositório com isolamento por `tenant_id`.
- Comunicação entre domínios preferencialmente assíncrona (EventBridge/SQS).
- Segredos no Secrets Manager; nada hardcoded.

Ver `.kiro/steering/architecture.md`.
