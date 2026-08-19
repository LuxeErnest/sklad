import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // Артефакты сборки: собранный фронтенд, вывод cargo и сгенерированные
    // Tauri ресурсы. Раньше игнорировался только dist, из-за чего линтер
    // пытался разбирать бинарные файлы из src-tauri/target и выдавал под сотню
    // мнимых ошибок разбора.
    ignores: ["dist", "src-tauri/target", "src-tauri/gen"],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-unused-vars": "off",
      // Осознанный долг: остаются места с any. Каждое требует осмысленного
      // типа, а не механической замены, поэтому вынесено в отдельную задачу.
      // Уровень предупреждения оставляет их на виду и при этом позволяет
      // команде check ловить новые ошибки других видов.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  }
);
