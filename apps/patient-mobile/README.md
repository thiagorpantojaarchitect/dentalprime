# patient-mobile — App do paciente (Expo / React Native)

App móvel do paciente do DentalPrime. Consome o backend via
`@dentalprime/mobile-core` (cliente HTTP, sessão e serviços tipados).

## Estado

- Estrutura, telas (login, meu prontuário, perfil) e integração com o backend
  estão implementadas.
- A **lógica testável** (cliente de API, sessão, serviços) vive em
  `packages/mobile-core` e tem testes automatizados (Vitest).
- O prontuário é resolvido pela identidade autenticada (`/patients/me`); o app
  não solicita nem aceita o ID de outro paciente. Antes do primeiro acesso, a
  clínica vincula a conta convidada ao prontuário no clinic-web.
- A UI nativa **exige um device ou simulador** para rodar; não é executável
  neste ambiente de desenvolvimento sem o toolchain do Expo instalado.

## Workspace e instalação

Este app faz parte dos workspaces npm do monorepo. O npm mantém a versão React
19 exigida pelo Expo separada da React 18 dos portais web quando necessário.
Instale tudo uma única vez na raiz com `npm ci`.

## Como rodar (requer device/simulador)

```bash
npm run start --workspace @dentalprime/patient-mobile
# pressione i (iOS), a (Android) ou use o Expo Go em um device
```

Para uma API publicada, defina `EXPO_PUBLIC_API_BASE_URL` antes de iniciar ou
gerar o app (por exemplo, `https://<dominio-development>`). O `app.config.js`
acrescenta `/api/identity`, `/api/patients` e `/api/scheduling`. No simulador
iOS, o fallback local usa `localhost`; Android emulator/device físico deve usar
um host alcançável por meio dos overrides `EXPO_PUBLIC_*_URL`. Essas variáveis
são públicas e nunca devem conter segredos.

## Segurança

- Tokens no Expo SecureStore (keychain/keystore do device), não em armazenamento
  simples.
- Acesso clínico exclusivamente pelo vínculo tenant + usuário do token; sem
  seleção manual de prontuário.
- Mensagens de erro genéricas; sem PII em logs.
