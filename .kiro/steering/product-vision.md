# Visão de Produto — DentalPrime

## O que é

DentalPrime é uma plataforma brasileira de gestão para clínicas e redes
odontológicas. Reúne CRM, agenda inteligente, prontuário clínico, plano de
tratamento, financeiro e uma camada de IA de atendimento em um único produto,
projetado para o mercado brasileiro e preparado para expansão internacional.

O produto é 100% brasileiro em propriedade intelectual, marca, idioma primário
(português), regras fiscais/jurídicas e hospedagem primária de dados no Brasil
(região AWS São Paulo, `sa-east-1`).

## Para quem

- **Clínicas individuais** — dentistas autônomos e consultórios pequenos que
  precisam sair de planilhas e agendas de papel.
- **Redes e franquias** — múltiplas unidades com gestão centralizada,
  relatórios consolidados e padronização de processos.
- **Equipe clínica** — dentistas, especialistas e auxiliares que consultam
  prontuário, registram procedimentos e acompanham tratamentos.
- **Recepção e administrativo** — agendamento, confirmações, cobrança e
  atendimento de primeiro contato.
- **Pacientes** — agendamento, lembretes, acesso a documentos e comunicação.

## Personas principais

1. **Dra. Marina (dentista-proprietária)** — quer visão do faturamento, agenda
   cheia e menos faltas, sem virar gestora de TI.
2. **Carlos (gerente de rede)** — precisa comparar unidades, padronizar
   processos e consolidar indicadores.
3. **Juliana (recepcionista)** — vive na agenda e no telefone; precisa de
   confirmações automáticas e encaixe rápido.
4. **Dr. Rafael (especialista)** — foca no prontuário, imagens e plano de
   tratamento; quer acesso rápido e confiável ao histórico.
5. **Sr. Antônio (paciente)** — quer agendar fácil, receber lembretes e
   entender seu tratamento e seus custos.

## Módulos

| Módulo | Descrição |
|---|---|
| identity-access | Autenticação, autorização, multi-tenant, papéis clínicos |
| crm-growth | Relacionamento, captação, reativação, campanhas |
| smart-scheduling | Agenda inteligente, disponibilidade, otimização, confirmações |
| patient-record | Prontuário clínico, histórico, imagens, documentos |
| treatment-plan | Planos de tratamento, aceitação de casos, evolução |
| finance | Cobrança, faturamento, repasses, conciliação |
| ai-front-desk | Recepção por IA: atendimento, triagem, agendamento assistido |

## Princípios de produto

- **Português primeiro.** Interface, comunicação e documentação em português.
- **Segurança e LGPD por padrão.** Dados clínicos são sensíveis; proteção não
  é opcional.
- **Simplicidade antes de escala.** Não introduzir complexidade de
  infraestrutura antes de o produto precisar dela.
- **Preparado para exportação.** Arquitetura multi-tenant e internacionalizável
  desde o início, sem antecipar custo de operação global.
- **IA como capacidade do produto, não dependência única.** A camada de IA do
  produto (Bedrock, OpenAI, modelos privados) é plugável e substituível.

## Limites jurídicos (importante)

Podemos implementar capacidades equivalentes às de produtos americanos
(verificação de cobertura, recepção por voz, otimização de agenda, automação de
cobrança, analytics, engajamento de pacientes). Não devemos copiar código-fonte,
interfaces protegidas, textos, marcas, bases privadas, APIs não autorizadas ou
algoritmos proprietários de terceiros.

Integrações que exigem licença ou parceria (por exemplo, códigos padronizados de
procedimento, verificação de convênio, clearinghouses) devem passar por acordo
formal antes da implementação.
