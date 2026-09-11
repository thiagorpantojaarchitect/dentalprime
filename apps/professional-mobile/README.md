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

## Fora do workspace npm da raiz

Este app **não** faz parte dos workspaces npm do monorepo (Expo SDK 57 /
React 19, enquanto as apps web usam React 18). É instalado e executado de forma
independente para evitar conflito de versões de React.

## Como rodar (requer device/simulador)

```bash
cd apps/professional-mobile
npm install
npx expo start
# pressione i (iOS), a (Android) ou use o Expo Go em um device
```

## Segurança clínica

- Registros clínicos são **append-only**: correções criam nova versão, sem
  apagar o histórico (o backend garante o versionamento).
- Tokens no Expo SecureStore. Mensagens de erro genéricas; sem PII em logs.
