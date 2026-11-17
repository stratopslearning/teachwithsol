import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

import noLegacyAuthz from "./eslint-rules/no-legacy-authz.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

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
      "sol/no-legacy-authz": "error",
      // A bare '/api/...' path skips NEXT_PUBLIC_BASE_PATH and 404s on the
      // /learning deploy. Call app APIs with apiFetch('/api/...').
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.name='fetch'] > Literal.arguments:first-child[value=/^\\/api\\//]",
          message: "Call app APIs with apiFetch() from '@/lib/api/client'.",
        },
        {
          selector:
            "CallExpression[callee.name='fetch'] > TemplateLiteral.arguments:first-child[quasis.0.value.raw=/^\\/api\\//]",
          message: "Call app APIs with apiFetch() from '@/lib/api/client'.",
        },
        {
          selector:
            "CallExpression[callee.name='fetch'] > CallExpression.arguments:first-child[callee.name='apiUrl']",
          message: "Use apiFetch(path) from '@/lib/api/client' instead of fetch(apiUrl(path)).",
        },
        // One dialog / toast / refresh pattern (components/feedback/ConfirmDialog,
        // sonner, router.refresh()) instead of browser popups and full reloads.
        {
          selector: "CallExpression[callee.name=/^(confirm|alert)$/]",
          message: "Use confirmAction() from '@/components/feedback/ConfirmDialog' or toast from 'sonner'.",
        },
        {
          selector:
            "CallExpression[callee.object.name='window'][callee.property.name=/^(confirm|alert)$/]",
          message: "Use confirmAction() from '@/components/feedback/ConfirmDialog' or toast from 'sonner'.",
        },
        {
          selector: "CallExpression[callee.property.name='reload'][callee.object.property.name='location']",
          message: "Use router.refresh() to reload server data.",
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
