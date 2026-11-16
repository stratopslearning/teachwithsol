import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

import noLegacyAuthz from "./eslint-rules/no-legacy-authz.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

const legacyAllowlist = JSON.parse(
  readFileSync(join(__dirname, "eslint-legacy-authz-allowlist.json"), "utf8"),
);

// Wave 4 (24): lib/ai/gateway.ts is the sole OpenAI entry point.
const openAiRestrictedPaths = [
  {
    name: "@/lib/ai/openai",
    message:
      "Use getAiClient()/runAi() from '@/lib/ai/gateway' — createOpenAIClient is gateway-only.",
  },
  {
    name: "openai",
    message:
      "Construct OpenAI clients via '@/lib/ai/gateway' only (use `import type` for types).",
    allowTypeImports: true,
  },
];

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "brag-output/**",
      "coverage/**",
      "drizzle/**",
      "load-test/**",
      "scripts/**",
      "evals/**",
      "tests/**",
      // Legacy isometric figure kits (predate lint; not request path).
      "components/iso/**",
      "components/figures/**",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    plugins: {
      sol: {
        rules: {
          "no-legacy-authz": noLegacyAuthz,
        },
      },
    },
    rules: {
      // Warn until the backlog is cleared; `_` prefixes remain intentional.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-expressions": "off",
      "prefer-const": "warn",
      "react-hooks/exhaustive-deps": "warn",
      "sol/no-legacy-authz": ["error", { allowlist: legacyAllowlist }],
      // A bare '/api/...' path skips NEXT_PUBLIC_BASE_PATH and 404s on the
      // /learning deploy. Wrap it: fetch(apiUrl('/api/...')).
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.name='fetch'] > Literal.arguments:first-child[value=/^\\/api\\//]",
          message: "Wrap API paths with apiUrl() from '@/lib/basePath'.",
        },
        {
          selector:
            "CallExpression[callee.name='fetch'] > TemplateLiteral.arguments:first-child[quasis.0.value.raw=/^\\/api\\//]",
          message: "Wrap API paths with apiUrl() from '@/lib/basePath'.",
        },
        // Next adds basePath to redirect() and next/link itself, so these
        // produce /learning/learning/... on the /learning deploy.
        {
          selector:
            "CallExpression[callee.name=/^(redirect|permanentRedirect)$/] > CallExpression.arguments:first-child[callee.name='withBasePath']",
          message: "Use appRedirect(path) from '@/lib/serverRedirect' (Next adds basePath).",
        },
        {
          selector:
            "JSXOpeningElement[name.name='Link'] > JSXAttribute[name.name='href'] CallExpression[callee.name='withBasePath']",
          message: "Use appPath() for next/link hrefs (Next adds basePath).",
        },
        {
          selector:
            "CallExpression[callee.property.name=/^(push|replace|prefetch)$/] > CallExpression.arguments:first-child[callee.name=/^(withBasePath|apiUrl)$/]",
          message: "Use appPath() with router.push/replace (Next adds basePath).",
        },
      ],
      "no-restricted-imports": ["error", { paths: openAiRestrictedPaths }],
    },
  },
  {
    // The gateway and its factory are the only legitimate importers.
    files: ["lib/ai/gateway.ts", "lib/ai/openai.ts"],
    rules: { "no-restricted-imports": "off" },
  },
  {
    // Page gates redirect; inside an API route the redirect is caught and
    // becomes a 500. API routes use '@/lib/api/sessionAuth' (or
    // requireProfessorApi), which throw ApiError → 401/402/403.
    files: ["app/api/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            ...openAiRestrictedPaths,
            {
              name: "@/lib/auth",
              message:
                "Page gates redirect. Use '@/lib/api/sessionAuth' in API routes.",
              allowTypeImports: true,
            },
            {
              name: "@/lib/authz/gates",
              importNames: [
                "requireTeachingAccess",
                "requireLearningAccess",
                "requireWorkspaceAdminAccess",
                "requirePlatformStaff",
                "requirePermission",
              ],
              message:
                "Page gates redirect. Use '@/lib/api/sessionAuth' in API routes.",
            },
          ],
        },
      ],
    },
  },
];
