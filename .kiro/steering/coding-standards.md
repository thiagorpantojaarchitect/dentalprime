# Padrões de Código — DentalPrime

Regras sempre aplicáveis. Valem para código escrito por humanos, Kiro e Codex.

## Idioma

- **Código, nomes de identificadores e nomes de recursos:** inglês.
- **Documentação de produto, PRD, specs de negócio:** português.
- **Comentários:** português quando ajudarem a explicar decisão ou regra de
  negócio; evitar comentários óbvios.
- **Nomes de recursos AWS:** usar hífens, nunca travessões (em dashes).

## Linguagem e estilo

- **TypeScript** em todo o stack, com `strict` habilitado.
- Tipagem explícita em contratos públicos (APIs, eventos, funções exportadas).
- Preferir imutabilidade e funções puras onde fizer sentido.
- Sem `any` implícito. Modelar erros de forma explícita.

## Estrutura

- Um limite de domínio por módulo. Não vazar detalhes internos entre domínios.
- Camadas claras: contrato/API → aplicação/uso → domínio → infraestrutura.
- Acesso a dados sempre via repositório que aplica isolamento por `tenant_id`.

## Qualidade

- **Testes obrigatórios** para novas funcionalidades e correções de bug. Se não
  houver framework de teste no pacote, configurar o padrão do ecossistema.
- Rodar build/compilação e testes relevantes antes de considerar uma tarefa
  concluída. Build sem erro não é prova suficiente de sucesso; verificar o
  resultado real contra o critério da tarefa.
- Lint e formatação automáticos. Nenhum merge com lint quebrado.
- Sem código morto, TODOs órfãos ou credenciais em commit.

## Segurança no código

- Entrada validada e sanitizada; consultas parametrizadas.
- Segredos via Secrets Manager, nunca hardcoded.
- Dependências com versões fixadas; preferir pacotes mantidos e conhecidos.
- Tratamento de erro que não vaza dados sensíveis nem stack traces ao cliente.

## Git

- Commits pequenos e descritivos. Nunca commitar `.env`, credenciais ou dados
  reais de pacientes.
- Branch por funcionalidade; não commitar direto em `main`.
- PRs com resumo do que mudou, o que foi testado e riscos.

## AGENTS.md

As regras compartilhadas entre Kiro e Codex vivem em `AGENTS.md` na raiz. Este
arquivo de steering e o `AGENTS.md` devem permanecer consistentes.
