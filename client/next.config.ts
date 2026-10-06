import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// E2E only (npm run dev:e2e): images come from the local S3 mock, see docs/e2e.md
const e2eImageOrigin = process.env.E2E_IMAGE_ORIGIN
  ? new URL(process.env.E2E_IMAGE_ORIGIN)
  : undefined;

const nextConfig: NextConfig = {
  /* config options here */
  output: "standalone",
  // A separate build dir lets the E2E dev server run alongside `npm run dev`
  distDir: process.env.NEXT_DIST_DIR || ".next",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "assets.megaweaving.net",
        port: "",
        pathname: "/**",
      },
      ...(e2eImageOrigin
        ? [
            {
              protocol: e2eImageOrigin.protocol.replace(":", "") as "https",
              hostname: e2eImageOrigin.hostname,
              port: e2eImageOrigin.port,
              pathname: "/**",
            },
          ]
        : []),
    ],
    // The local S3 mock resolves to a loopback IP, which the optimizer blocks by default
    dangerouslyAllowLocalIP: Boolean(e2eImageOrigin),
  },
  turbopack: {
    root: __dirname,
  },
  // Strip console.log (and other non-essential console.*) in production builds.
  // console.error and console.warn are preserved for Sentry and runtime diagnostics.
  compiler: {
    removeConsole:
      process.env.NODE_ENV === "production"
        ? { exclude: ["error", "warn"] }
        : false,
  },
};

export default withSentryConfig(withNextIntl(nextConfig), {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "megaweaving",

  project: "javascript-nextjs",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  // Automatically tree-shake Sentry logger statements to reduce bundle size
  disableLogger: true,

  // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
  // See the following for more information:
  // https://docs.sentry.io/product/crons/
  // https://vercel.com/docs/cron-jobs
  automaticVercelMonitors: true,
});
