# Segurança e LGPD — DentalPrime

Dados de saúde são dados pessoais sensíveis pela LGPD (Lei 13.709/2018).
Estas regras são sempre aplicáveis e têm precedência sobre conveniência de
implementação.

## Princípios

- **Privacidade e segurança desde a concepção** (privacy/security by design and
  by default).
- **Minimização de dados.** Coletar apenas o necessário para a finalidade.
- **Finalidade e transparência.** Toda coleta tem base legal e finalidade
  registrada.
- **Consentimento gerenciável.** Registrar consentimento com data, versão do
  termo e finalidade; permitir revogação.

## Dados sensíveis

Tratar como sensível e sujeito a controles reforçados:

- Prontuário clínico, diagnósticos, procedimentos, prescrições.
- Imagens e exames (radiografias, fotos intraorais, documentos).
- Dados de identificação de pacientes (CPF, contato, endereço).
- Dados financeiros e de convênio.

## Controles técnicos obrigatórios

- **Criptografia em repouso** com KMS para banco, S3 e backups.
- **Criptografia em trânsito** (TLS) em toda comunicação.
- **Segredos no Secrets Manager.** Nunca em código, logs, imagens de container
  ou variáveis planas. Resolver segredos em tempo de execução.
- **Controle de acesso baseado em papéis (RBAC)** e isolamento por tenant.
- **Trilha de auditoria** para acesso e alteração de dados sensíveis: quem,
  quando, o quê, de onde.
- **Retenção e descarte** conforme política e obrigações legais (prontuário
  odontológico tem prazo mínimo de guarda). Backups com retenção imutável.
- **Segregação de ambientes.** Dados reais de produção nunca em dev/homologação.
  Usar dados sintéticos ou anonimizados fora de produção.

## Direitos do titular

O produto deve suportar: acesso, correção, portabilidade, informação sobre
compartilhamento, e eliminação (respeitando obrigações legais de guarda de
prontuário). Toda operação sobre esses direitos é auditada.

## Regras para o agente (Kiro/Codex)

- Nunca logar dados sensíveis ou segredos em texto claro.
- Nunca ecoar valores de segredos em respostas ou arquivos. Referenciar por nome
  da chave.
- Usar placeholders genéricos para PII em exemplos, testes e seeds.
- Ao lidar com Secrets Manager, usar referências resolvidas em runtime, não
  buscar e imprimir valores.
- Validar e sanitizar toda entrada. Usar consultas parametrizadas.
- Sinalizar qualquer mudança que afete autenticação, autorização, criptografia
  ou tratamento de dados sensíveis, e aguardar confirmação antes de aplicar em
  ambientes compartilhados.
