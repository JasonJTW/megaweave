import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import eslintConfigPrettier from "eslint-config-prettier";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  { ignores: [".next/**", ".next-e2e/**"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  eslintConfigPrettier,
  //* 瀏覽器呼叫自家 API 一律經過 lib/api（credentials、錯誤碼、SWR fetcher 都在那裡）
  {
    files: [
      "app/**/*.{ts,tsx}",
      "components/**/*.{ts,tsx}",
      "hooks/**/*.{ts,tsx}",
      "lib/**/*.{ts,tsx}",
      "services/**/*.{ts,tsx}",
      "utils/**/*.{ts,tsx}",
    ],
    ignores: [
      "lib/api.ts",
      //* server 端：route handler 與 metadata 在 Node 執行，錯誤不經 translateApiError
      "app/api/**",
      "app/**/metadata.ts",
    ],
    rules: {
      "no-restricted-globals": [
        "error",
        {
          name: "fetch",
          message:
            "Call the server through api() from @/lib/api. Only lib/api, server-side code and non-API hosts (S3, Next route handlers) may use fetch.",
        },
      ],
    },
  },
];

export default eslintConfig;
