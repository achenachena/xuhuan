module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: "./tsconfig.json"
  },
  env: {
    node: true,
    es2022: true
  },
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  rules: {
    "@typescript-eslint/explicit-function-return-type": [
      "error",
      { allowExpressions: true }
    ],
    "@typescript-eslint/consistent-type-definitions": ["error", "type"],
    "no-console": ["warn", { allow: ["error"] }]
  }
};

