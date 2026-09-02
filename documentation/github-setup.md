# Publicar no GitHub

O repositório já foi inicializado localmente com um commit inicial na branch
`main`. Estes passos publicam o código no GitHub. Nada aqui foi executado
automaticamente: rode você mesmo quando quiser publicar.

## Antes de publicar

1. **Confira a identidade do git.** Foi definida uma identidade local de
   placeholder apenas neste repositório:

   ```bash
   git config user.name    # DentalPrime Dev
   git config user.email   # dev@dentalprime.local
   ```

   Ajuste para a sua identidade real (recomendado):

   ```bash
   git config user.name "Seu Nome"
   git config user.email "seu-email@exemplo.com"
   ```

2. **Revise o que foi commitado.** Nenhum segredo ou `node_modules` entrou
   (bloqueados pelo `.gitignore`).

   ```bash
   git log --oneline
   git show --stat HEAD
   ```

## Opção A — GitHub CLI (recomendado)

Se você tem o `gh` instalado e autenticado (`gh auth login`):

```bash
# cria o repositorio remoto (privado) e faz o push da branch main
gh repo create dentalprime --private --source=. --remote=origin --push
```

## Opção B — Manual

1. Crie um repositório vazio no GitHub (sem README, sem .gitignore, sem
   licença), por exemplo `dentalprime`.
2. Ligue o remoto e faça o push:

   ```bash
   git remote add origin git@github.com:SUA_ORG/dentalprime.git
   git push -u origin main
   ```

   (Use a URL HTTPS `https://github.com/SUA_ORG/dentalprime.git` se preferir
   autenticação por token em vez de SSH.)

## Fluxo de trabalho a partir daqui

- Trabalhe por branch de funcionalidade; não commite direto em `main`
  (ver `.kiro/steering/coding-standards.md`).

  ```bash
  git checkout -b feat/identity-access
  # ... implementar conforme .kiro/specs/identity-access/tasks.md ...
  git push -u origin feat/identity-access
  ```

- Abra Pull Request com resumo do que mudou, o que foi testado e riscos.
- CI (a configurar) deve rodar `npm ci`, `npm run lint`, `npm run build` e
  `npm test`.

## Comandos do monorepo

```bash
npm install        # instala dependencias (workspaces)
npm run build      # compila todos os pacotes (tsc --build)
npm run lint       # ESLint
npm run format     # Prettier (escreve)
npm test           # Vitest (roda uma vez)
```
