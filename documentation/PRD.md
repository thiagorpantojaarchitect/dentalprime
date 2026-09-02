# PRD Mestre — DentalPrime

> Documento vivo. Versão inicial da fundação. Atualizar conforme as specs de
> módulo evoluem. Idioma: português. Referências técnicas em inglês.

## 1. Resumo executivo

DentalPrime é uma plataforma brasileira de gestão para clínicas e redes
odontológicas. Unifica relacionamento com paciente (CRM), agenda inteligente,
prontuário clínico, plano de tratamento, financeiro e uma camada de recepção por
IA em um único produto. É concebido para o mercado brasileiro (português, LGPD,
regras fiscais e jurídicas locais, dados primários no Brasil) e com arquitetura
preparada para exportação futura.

O objetivo é reduzir faltas, aumentar a aceitação de tratamentos, organizar o
prontuário e o financeiro, e liberar a equipe de tarefas repetitivas por meio de
automação e IA assistiva.

## 2. Problema

Clínicas odontológicas brasileiras convivem com:

- Agendas fragmentadas e alto índice de faltas (no-show).
- Prontuários dispersos entre papel, planilhas e sistemas isolados.
- Dificuldade de acompanhar planos de tratamento e sua aceitação.
- Cobrança e conciliação manuais e sujeitas a erro.
- Recepção sobrecarregada com atendimento de primeiro contato.
- Redes sem visão consolidada entre unidades.

## 3. Objetivos e métricas

| Objetivo | Métrica alvo (indicativa) |
|---|---|
| Reduzir faltas | Queda no índice de no-show |
| Aumentar aceitação de tratamento | Taxa de case acceptance |
| Organizar prontuário | Tempo para localizar histórico/imagens |
| Automatizar recepção | % de contatos resolvidos por IA assistiva |
| Saúde financeira | Redução de inadimplência e tempo de conciliação |
| Adoção | Clínicas ativas, retenção mensal |

Metas numéricas serão definidas por módulo nas specs de requisitos.

## 4. Personas

Ver `.kiro/steering/product-vision.md`. Resumo: Dra. Marina (proprietária),
Carlos (gerente de rede), Juliana (recepção), Dr. Rafael (especialista),
Sr. Antônio (paciente).

## 5. Escopo por módulo

| Módulo | Escopo resumido | Prioridade |
|---|---|---|
| identity-access | Autenticação, autorização RBAC, multi-tenant, papéis clínicos | Fundacional |
| patient-record | Prontuário, histórico clínico, imagens, documentos, consentimento LGPD | Fundacional |
| smart-scheduling | Agenda, disponibilidade, otimização, confirmações/lembretes | Fundacional |
| treatment-plan | Planos de tratamento, aceitação de casos, evolução | Alta |
| finance | Cobrança, faturamento, repasses, conciliação | Alta |
| crm-growth | Relacionamento, captação, reativação, campanhas | Média |
| ai-front-desk | Recepção por IA: atendimento, triagem, agendamento assistido | Média |

Os três fundacionais (identity-access, patient-record, smart-scheduling) têm
specs completas nesta fundação. Os demais começam como stubs de escopo.

## 6. Aplicações

- **clinic-web** — aplicação principal da clínica (agenda, prontuário,
  financeiro, gestão).
- **patient-mobile** — app do paciente (agendamento, lembretes, documentos).
- **professional-mobile** — app do profissional (agenda, prontuário em consulta).
- **admin-portal** — administração de tenants, planos e configuração de rede.

## 7. Camada de IA do produto

Distinta da IA de desenvolvimento (Kiro/Codex). A IA do produto é **assistiva**,
identificada ao usuário, e nunca toma decisão clínica autônoma (ver
`.kiro/steering/clinical-safety.md`). Fornecedores plugáveis: Amazon Bedrock,
OpenAI API, modelos especializados ou hospedados de forma privada. A escolha do
fornecedor é decisão de arquitetura por caso de uso, não uma dependência única.

Casos de uso previstos: recepção por IA (ai-front-desk), triagem inicial,
sugestões de encaixe de agenda, apoio à comunicação com pacientes, analytics.

## 8. Restrições e conformidade

- **LGPD** (Lei 13.709/2018): dados de saúde são sensíveis. Ver
  `.kiro/steering/security-lgpd.md`.
- **Guarda de prontuário**: prazos mínimos legais de retenção; backups
  imutáveis.
- **Limites jurídicos**: implementar capacidades equivalentes às de produtos
  americanos é permitido; copiar código, interfaces, textos, marcas, bases ou
  APIs proprietárias não é. Integrações que exigem licença (ex.: códigos
  padronizados de procedimento, verificação de convênio, clearinghouses) exigem
  parceria/acordo formal.
- **Residência de dados**: dados primários no Brasil (`sa-east-1`).

## 9. Fora de escopo (fundação)

- Provisionamento de recursos AWS e deploy.
- Integrações que dependem de licença/parceria ainda não firmada.
- IA que gere ou altere registro clínico sem revisão humana.
- Kubernetes/EKS.

## 10. Roadmap de alto nível

1. **Fundação** (este documento + steering + arquitetura + modelo de dados +
   specs fundacionais).
2. **MVP clínico**: identity-access, patient-record, smart-scheduling em
   clinic-web.
3. **Monetização e gestão**: treatment-plan, finance.
4. **Crescimento**: crm-growth, ai-front-desk, apps mobile.
5. **Rede e escala**: consolidação multi-unidade, analytics, exportação.

## 11. Documentos relacionados

- Arquitetura AWS: `documentation/architecture-aws.md`
- Modelo de dados: `documentation/data-model.md`
- Steering: `.kiro/steering/`
- Specs: `.kiro/specs/<módulo>/`
- Regras de agentes: `AGENTS.md`
