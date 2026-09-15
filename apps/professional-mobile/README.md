# professional-mobile — App do profissional (Expo / React Native)

App móvel do profissional (dentista/especialista) do DentalPrime. Consome o
backend via `@dentalprime/mobile-core`.

## Estado

- Estrutura, telas (login, atendimento com prontuário e registro de evolução,
  perfil) e integração com o backend estão implementadas.
- A **lógica testável** (cliente de API, sessão, serviços clínicos) vive em
  `packages/mobile-core` e tem testes automatizados (Vitest).
- A UI nativa **exige um device ou simulador** para rodar; não é executável
  neste ambiente de desenvolvimento sem o toolchain do Expo instalado.

## Workspace e instalação

Este app faz parte dos workspaces npm do monorepo. O npm mantém a versão React
19 exigida pelo Expo separada da React 18 dos portais web quando necessário.
Instale tudo uma única vez na raiz com `npm ci`.

## Como rodar (requer device/simulador)

```bash
npm run start --workspace @dentalprime/professional-mobile
# pressione i (iOS), a (Android) ou use o Expo Go em um device
```

Para consumir uma API publicada, defina `EXPO_PUBLIC_API_BASE_URL`; o
`app.config.js` compõe os caminhos públicos `/api/<domínio>`. Para Android
emulator ou device físico local, informe os overrides `EXPO_PUBLIC_*_URL` com
um host acessível. Nenhuma dessas variáveis públicas pode conter segredos.

## Segurança clínica

- Registros clínicos são **append-only**: correções criam nova versão, sem
  apagar o histórico (o backend garante o versionamento).
- Tokens no Expo SecureStore. Mensagens de erro genéricas; sem PII em logs.
