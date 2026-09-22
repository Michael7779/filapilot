import js from "@eslint/js";
import tseslint from "typescript-eslint";
import sonarjs from "eslint-plugin-sonarjs";
import security from "eslint-plugin-security";
import tailwind from "eslint-plugin-tailwindcss";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/build/**",
      "**/node_modules/**",
      "**/generated/**",
      "**/.stryker-tmp/**",
      "packages/backend/src/prisma/generated/**"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  sonarjs.configs.recommended,
  security.configs.recommended,
  {
    files: ["packages/frontend/**/*.{ts,tsx}"],
    ...(tailwind.configs["flat/recommended"] ?? tailwind.configs.recommended),
    settings: {
      tailwindcss: {
        cssConfigPath: "./packages/frontend/src/index.css",
        callees: ["classnames", "clsx", "cn"]
      }
    },
    rules: {
      "tailwindcss/no-custom-classname": "off"
    }
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "sonarjs/cognitive-complexity": ["error", 15],
      "security/detect-object-injection": "off"
    }
  },
  {
    // Test-Fixtures enthalten bewusst Test-Passwoerter, keine echten Secrets.
    files: ["**/tests/**/*.test.ts"],
    rules: {
      // eslint-disable-next-line sonarjs/no-hardcoded-passwords -- Regelname, kein Secret
      "sonarjs/no-hardcoded-passwords": "off"
    }
  },
  prettier
);
