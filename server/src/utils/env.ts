// server/src/utils/env.ts

/**
 * Reads a required environment variable, throwing if it is missing or blank.
 *
 * Used for values where a hardcoded fallback would be dangerous — e.g. payment
 * gateway credentials, where silently falling back to a public sandbox key
 * would let anyone forge a valid payment callback signature.
 */
export function requireEnv(
  name: string,
  scope: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const value = env[name];

  if (!value || value.trim() === "") {
    throw new Error(
      `[${scope}] Missing required env var "${name}". ` +
        `Set it in your .env file before starting the process — ` +
        `this value has no safe default.`,
    );
  }

  return value;
}
