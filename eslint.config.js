import { defineConfig } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier/flat";

export default defineConfig([
  { files: ["src/**/*.ts"], plugins: { js }, extends: ["js/recommended"] },
  tseslint.configs.strict,
  tseslint.configs.stylistic,
  eslintConfigPrettier,
  {
    ignores: ["node_modules/", "src/new/templates/"],
  },
]);
