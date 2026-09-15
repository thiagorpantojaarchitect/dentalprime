# apps/

Aplicações cliente do DentalPrime. Os portais web consomem o contrato público
same-origin `/api/<domínio>`; no desenvolvimento, o Vite encaminha esse contrato
às portas locais sem gravar `localhost` no bundle destinado à AWS.

- **clinic-web** — aplicação principal da clínica (agenda, prontuário,
  financeiro, gestão).
- **patient-mobile** — app do paciente (agendamento, lembretes, documentos).
- **professional-mobile** — app do profissional (agenda e prontuário em
  consulta).
- **admin-portal** — administração de tenants, planos e configuração de rede.

Todos os quatro apps fazem parte dos workspaces npm da raiz. Com as dependências
instaladas, os comandos de validação são:

```bash
npm run build:web
npm run test:apps
```

O segundo comando testa os dois portais e executa o typecheck dos dois apps
Expo. A execução visual mobile ainda requer simulador ou device. Padrões em
`.kiro/steering/coding-standards.md`: TypeScript strict, testes obrigatórios e
português na interface.
