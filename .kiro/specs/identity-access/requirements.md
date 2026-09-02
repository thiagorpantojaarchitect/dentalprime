# Requisitos — identity-access

## Introdução

O módulo identity-access é a fundação de segurança do DentalPrime. Provê
identidade, autenticação, autorização (RBAC), isolamento multi-tenant e trilha
de auditoria de acesso. Todos os demais módulos dependem dele para saber quem é
o usuário, a que tenant/unidade pertence e o que pode fazer.

Referências: `.kiro/steering/security-lgpd.md`, `.kiro/steering/architecture.md`,
`documentation/data-model.md`.

## Requisitos

### Requisito 1 — Identidade multi-tenant

**História:** Como operador da plataforma, quero que cada clínica ou rede seja um
tenant isolado, para que os dados de um cliente nunca sejam acessíveis por outro.

**Critérios de aceitação:**
1. QUANDO uma entidade de negócio é criada ENTÃO o sistema DEVE associá-la a um
   `tenant_id`.
2. QUANDO uma consulta a dados de negócio é feita ENTÃO o sistema DEVE aplicar o
   filtro por `tenant_id` do contexto autenticado.
3. SE uma requisição tentar acessar dados de outro tenant ENTÃO o sistema DEVE
   negar e registrar em auditoria.
4. QUANDO um tenant é uma rede ENTÃO o sistema DEVE suportar múltiplas unidades
   (`clinic_unit`) sob o mesmo tenant.

### Requisito 2 — Autenticação

**História:** Como usuário (equipe ou paciente), quero autenticar de forma
segura, para acessar apenas o que me é permitido.

**Critérios de aceitação:**
1. QUANDO um usuário se autentica com credenciais válidas ENTÃO o sistema DEVE
   emitir tokens de acesso e refresh.
2. QUANDO um token expira ENTÃO o sistema DEVE exigir renovação via refresh
   válido.
3. SE credenciais forem inválidas ENTÃO o sistema DEVE negar sem revelar qual
   fator falhou.
4. O sistema DEVE suportar MFA para papéis administrativos e clínicos.
5. O sistema NÃO DEVE persistir tokens em texto claro nem logar segredos.

### Requisito 3 — Autorização (RBAC)

**História:** Como proprietário da clínica, quero controlar o que cada papel
pode fazer, para proteger dados clínicos e financeiros.

**Critérios de aceitação:**
1. O sistema DEVE suportar os papéis: owner, manager, dentist, specialist,
   assistant, front-desk, patient.
2. QUANDO um usuário tenta uma ação ENTÃO o sistema DEVE verificar a permissão do
   papel no tenant e unidade correspondentes.
3. SE o usuário não tiver permissão ENTÃO o sistema DEVE negar e auditar.
4. QUANDO um usuário tem papéis em múltiplas unidades ENTÃO o sistema DEVE
   escopar a permissão por unidade.

### Requisito 4 — Gestão de usuários e papéis

**História:** Como gerente, quero convidar, ativar e desativar usuários e ajustar
seus papéis, para manter o acesso correto ao longo do tempo.

**Critérios de aceitação:**
1. QUANDO um gerente convida um usuário ENTÃO o sistema DEVE criar o usuário em
   estado pendente e enviar convite.
2. QUANDO um usuário é desativado ENTÃO o sistema DEVE encerrar sessões ativas e
   bloquear novo acesso.
3. Toda alteração de papel/permissão DEVE ser auditada.

### Requisito 5 — Auditoria de acesso

**História:** Como responsável por conformidade, quero registrar acessos e
alterações de dados sensíveis, para atender à LGPD e investigar incidentes.

**Critérios de aceitação:**
1. QUANDO um dado sensível é acessado ou alterado ENTÃO o sistema DEVE registrar
   quem, quando, o quê e origem.
2. O registro de auditoria NÃO DEVE conter segredos nem PII em texto claro além
   do necessário para identificação.
3. Registros de auditoria DEVEM ser imutáveis.

### Requisito 6 — Segurança e LGPD

**História:** Como titular de dados, quero que meus dados sejam protegidos por
padrão, conforme a LGPD.

**Critérios de aceitação:**
1. Dados sensíveis DEVEM ser criptografados em repouso (KMS) e em trânsito (TLS).
2. Segredos DEVEM vir do Secrets Manager, resolvidos em runtime.
3. Entradas DEVEM ser validadas e sanitizadas; consultas parametrizadas.
4. Mudanças em autenticação, autorização ou criptografia DEVEM ser sinalizadas e
   confirmadas antes de aplicar em ambientes compartilhados.
