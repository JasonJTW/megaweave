import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");

    // Next.js dev server's internal proxy (proxy-request.js) adds multiple
    // 'close' listeners to ServerResponse for each proxied request in order to
    // detect client disconnects. With concurrent page loads the default limit
    // of 10 listeners is exceeded, producing false MaxListeners warnings.
    // Raising the limit here suppresses the noise without hiding real leaks.
    const http = await import("http");
    http.ServerResponse.prototype.setMaxListeners(50);
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
