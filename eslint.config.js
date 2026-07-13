export default [
  {
    files: ["**/*.js", "**/*.mjs"],
    ignores: ["runtime/**", "vendor/**", "node_modules/**"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        AbortSignal: "readonly",
        fetch: "readonly",
        FormData: "readonly",
        localStorage: "readonly",
        document: "readonly",
        window: "readonly",
        crypto: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly"
      }
    },
    rules: {
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }
      ],
      "no-undef": "error"
    }
  }
];
