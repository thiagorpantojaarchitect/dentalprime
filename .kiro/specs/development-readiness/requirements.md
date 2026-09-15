# Requisitos - prontidão do ambiente de desenvolvimento

## Objetivo

Disponibilizar uma versão do DentalPrime que possa ser provisionada do zero em uma conta AWS de desenvolvimento, sem dados reais, e validada por testes automatizados antes do primeiro acesso clínico.

## Requisitos funcionais

1. Os sete serviços devem construir, iniciar e permanecer saudáveis em ECS Fargate.
2. As migrações dos sete domínios devem coexistir no mesmo cluster Aurora sem colisão.
3. O contrato público deve ser same-origin em `/api/<domínio>` e alcançar as rotas Fastify existentes.
4. `clinic-web` e `admin-portal` devem ser publicados com configuração de desenvolvimento e invalidação de cache.
5. O fluxo de convite deve usar token aleatório, expirável e de uso único; ativação não pode redefinir usuário ativo.
6. Deve existir um caminho explícito, auditável e não público para criar o primeiro tenant e administrador de desenvolvimento.
7. Integrações EventBridge, SQS, S3 e Bedrock devem ser configuradas por ambiente, com stub somente quando declarado para desenvolvimento.
8. O ambiente deve expor sinais de saúde, alarmes e dashboard suficientes para diagnosticar deploy e runtime.
9. O proprietário inicial deve trocar a senha temporária por uma senha nova, com revogação das sessões de renovação existentes.
10. O paciente deve acessar apenas o prontuário associado ao seu usuário autenticado; a associação deve ser feita por uma ação de equipe autorizada e auditada.
11. Listagens administrativas devem ser paginadas no banco e preservar acesso a todos os registros.

## Requisitos de segurança

1. Nenhum segredo ou dado sensível deve ser incluído em código, imagem, log ou artefato frontend.
2. Recursos de dados devem usar criptografia KMS e acesso por IAM mínimo.
3. O ALB não deve oferecer uma rota útil que contorne o contrato protegido pela borda.
4. Dados de desenvolvimento devem ser exclusivamente sintéticos.
5. Toda ação clínica deve preservar autoria e histórico; IA permanece assistiva.
6. Somente `platform-admin` pode listar ou provisionar tenants; o papel `owner` permanece limitado ao próprio tenant.
7. Em produção, a aplicação deve confiar apenas nos dois saltos conhecidos de proxy (CloudFront e ALB), sem aceitar cabeçalhos encaminhados arbitrários do cliente.

## Requisitos de qualidade

1. Instalação limpa, build, lint, formatação e testes devem passar.
2. A CI deve executar migrações contra PostgreSQL real e iniciar as imagens de contêiner.
3. `cdk synth --strict` deve passar para development sem depender de estado local acidental.
4. O pipeline deve suportar bootstrap greenfield em ordem determinística.
5. Nenhum recurso AWS será criado por uma sessão de desenvolvimento sem aprovação explícita.
6. O ambiente local deve validar URLs pré-assinadas contra armazenamento S3 compatível, sem depender de credenciais AWS.

## Fora do escopo desta entrega

- Inserção de dados reais ou migração de pacientes.
- Provisionamento efetivo em uma conta AWS sem aprovação separada.
- Liberação de staging ou produção.
- Automação de diagnóstico, prescrição ou decisão clínica.
