import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import prettier from "eslint-config-prettier";

export default [
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**", "**/cdk.out/**"],
  },
  js.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
      // Globais do runtime Node (Node 22) e de teste (Vitest injeta globals).
      globals: {
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
        crypto: "readonly",
        URL: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        NodeJS: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/explicit-function-return-type": [
        "warn",
        { allowExpressions: true },
      ],
      // Permite parametros/variaveis intencionalmente nao usados com prefixo "_".
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Frontend (clinic-web): roda no browser. Habilita globais de DOM/Web.
    files: ["apps/clinic-web/**/*.ts", "apps/clinic-web/**/*.tsx"],
    languageOptions: {
      globals: {
        window: "readonly",
        document: "readonly",
        localStorage: "readonly",
        fetch: "readonly",
        Response: "readonly",
        Request: "readonly",
        RequestInit: "readonly",
        RequestInfo: "readonly",
        Headers: "readonly",
        HTMLElement: "readonly",
        HTMLInputElement: "readonly",
        HTMLSelectElement: "readonly",
        HTMLTextAreaElement: "readonly",
        JSX: "readonly",
      },
    },
  },
  {
    // Testes e helpers de teste: nao exigir tipo de retorno explicito.
    files: ["**/*.test.ts", "**/*.test.tsx", "**/test-helpers.ts"],
    rules: {
      "@typescript-eslint/explicit-function-return-type": "off",
    },
  },
  prettier,
];
