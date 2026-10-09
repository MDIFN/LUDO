import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    files: ["**/*.ts"],
    extends: [tseslint.configs.recommended],
    languageOptions: {
      parserOptions: { project: "./tsconfig.json" },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-console": "off",
    },
  },
  {
    ignores: ["dist/**", "node_modules/**"],
  },
);
