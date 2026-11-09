// Shared flat ESLint config. Packages extend this from their own eslint.config.mjs.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/.next/**", "**/coverage/**", "**/node_modules/**", "**/.expo/**", "**/*.config.js", "**/next-env.d.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "off"
    }
  },
  prettier
);
