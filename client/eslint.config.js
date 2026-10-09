import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  {
    files: ["**/*.ts", "**/*.tsx"],
    extends: [tseslint.configs.recommended, react.configs.recommended],
    languageOptions: {
      parserOptions: { project: "./tsconfig.json" },
      globals: { window: true, document: true, console: true, navigator: true },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react/jsx-no-target-blank": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
    settings: { react: { version: "18.3" } },
  },
  { ignores: ["dist/**", "node_modules/**"] },
);
