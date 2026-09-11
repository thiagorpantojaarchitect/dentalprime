# patient-mobile — App do paciente (Expo / React Native)

App móvel do paciente do DentalPrime. Consome o backend via
`@dentalprime/mobile-core` (cliente HTTP, sessão e serviços tipados).

## Estado

- Estrutura, telas (login, meu prontuário, perfil) e integração com o backend
  estão implementadas.
- A **lógica testável** (cliente de API, sessão, serviços) vive em
  `packages/mobile-core` e tem testes automatizados (Vitest).
- A UI nativa **exige um device ou simulador** para rodar; não é executável
  neste ambiente de desenvolvimento sem o toolchain do Expo instalado.

## Fora do workspace npm da raiz

Este app **não** faz parte dos workspaces npm do monorepo. Ele usa Expo SDK 57
(React 19 / React Native 0.86), enquanto as apps web usam React 18. Manter os
dois no mesmo `node_modules` causaria conflito de versões de React. Por isso o
app é instalado e executado de forma independente.

## Como rodar (requer device/simulador)

```bash
cd apps/patient-mobile
npm install            # instala Expo, React Native e o link para mobile-core
npx expo start         # abre o Metro bundler
# pressione i (iOS), a (Android) ou use o Expo Go em um device
```

As URLs dos serviços vêm de `app.json > expo.extra` (identityUrl, patientUrl,
schedulingUrl). Ajuste para o ambiente desejado. Nenhum segredo no bundle.

## Segurança

- Tokens no Expo SecureStore (keychain/keystore do device), não em armazenamento
  simples.
- Mensagens de erro genéricas; sem PII em logs.
