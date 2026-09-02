# Requisitos — finance

## Introdução

O módulo finance cuida da cobrança ao paciente, faturamento, parcelamento,
repasses a profissionais e conciliação, com atenção às regras fiscais
brasileiras. Integra-se a treatment-plan (itens aceitos geram cobrança) e
smart-scheduling (consultas), por eventos.

Referências: `documentation/PRD.md`, `documentation/data-model.md`,
`.kiro/steering/security-lgpd.md`.

## Requisitos

### Requisito 1 — Faturamento

**História:** Como responsável financeiro, quero emitir faturas ao paciente,
para cobrar procedimentos e produtos.

**Critérios de aceitação:**
1. QUANDO uma fatura é criada ENTÃO o sistema DEVE vinculá-la ao paciente, ao
   `tenant_id` e à unidade.
2. Cada item de fatura DEVE ter descrição, quantidade, valor unitário e total.
3. QUANDO um item de plano de tratamento é aceito ENTÃO o sistema DEVE poder
   gerar item de fatura a partir do evento correspondente.
4. QUANDO uma fatura é emitida ou alterada ENTÃO o sistema DEVE auditar a
   operação.

### Requisito 2 — Pagamentos

**História:** Como recepcionista, quero registrar pagamentos, para acompanhar o
que foi recebido.

**Critérios de aceitação:**
1. O sistema DEVE registrar pagamentos com valor, meio e data.
2. O sistema DEVE suportar pagamento total ou parcial de uma fatura.
3. QUANDO um pagamento é registrado ENTÃO o sistema DEVE atualizar o saldo da
   fatura.
4. Segredos de gateways de pagamento DEVEM vir do Secrets Manager, resolvidos em
   runtime.

### Requisito 3 — Parcelamento

**História:** Como paciente, quero parcelar o tratamento, para viabilizar o
pagamento.

**Critérios de aceitação:**
1. O sistema DEVE permitir criar um plano de pagamento (payment plan) com
   parcelas, valores e vencimentos.
2. O sistema DEVE acompanhar o status de cada parcela (em aberto, paga, atrasada).
3. SE uma parcela vence sem pagamento ENTÃO o sistema DEVE marcá-la como atrasada.

### Requisito 4 — Repasses a profissionais

**História:** Como gerente, quero calcular repasses a profissionais, para pagar
corretamente a equipe.

**Critérios de aceitação:**
1. O sistema DEVE calcular repasses com base em regras configuradas por
   procedimento/profissional.
2. QUANDO um repasse é gerado ENTÃO o sistema DEVE registrar base de cálculo e
   valor, auditados.

### Requisito 5 — Conciliação

**História:** Como responsável financeiro, quero conciliar recebimentos, para
garantir a integridade financeira.

**Critérios de aceitação:**
1. O sistema DEVE permitir conciliar pagamentos registrados com recebimentos.
2. SE houver divergência ENTÃO o sistema DEVE sinalizá-la para revisão.

### Requisito 6 — Regras fiscais brasileiras

**História:** Como responsável fiscal, quero que a cobrança respeite as regras
fiscais brasileiras, para manter a conformidade.

**Critérios de aceitação:**
1. O sistema DEVE armazenar dados fiscais necessários (ex.: identificação do
   tomador, natureza do serviço) de forma estruturada e auditável.
2. SE a emissão de documento fiscal exigir integração externa ou licença ENTÃO o
   sistema NÃO DEVE implementá-la sem acordo formal.
3. O sistema DEVE registrar valores, tributos e retenções de forma rastreável,
   com detalhamento a ser definido junto ao contador/parceiro fiscal.

### Requisito 7 — Convênios (fora do escopo inicial)

**História:** Como clínica, quero futuramente processar cobranças de convênio,
respeitando os limites de licença.

**Critérios de aceitação:**
1. Integração com convênios/clearinghouses e verificação de cobertura NÃO DEVE
   ser implementada sem parceria/acordo formal.
2. QUANDO habilitada ENTÃO a entidade `insurance_claim` DEVE registrar a
   solicitação de forma auditável.

### Requisito 8 — Segurança e LGPD

**História:** Como titular de dados, quero que meus dados financeiros sejam
protegidos.

**Critérios de aceitação:**
1. Dados financeiros DEVEM ser criptografados em repouso (KMS) e em trânsito
   (TLS), com acesso por RBAC.
2. Toda operação financeira sensível DEVE ser auditada.
3. Dados financeiros DEVEM ser isolados por `tenant_id` e retidos conforme
   obrigações legais; backups imutáveis.
