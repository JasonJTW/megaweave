/**
 * Loading state of a post image whose thumbnail may not exist yet (the resizer
 * Lambda creates it after upload): retry the thumbnail with exponential backoff,
 * then fall back to the original upload.
 */

export const MAX_RETRIES = 4;
const BASE_DELAY_MS = 2000;

export type ImageStatus = "idle" | "retrying" | "failed";

export interface ImageRetryState {
  primarySrc: string | undefined;
  fallbackSrc: string | undefined;
  /** What the <Image> shows */
  src: string | undefined;
  /** "retrying" shows the shimmer overlay, "failed" the empty placeholder */
  status: ImageStatus;
  retries: number;
  onFallback: boolean;
}

export type ImageRetryEvent =
  | {
      type: "reset";
      primarySrc: string | undefined;
      fallbackSrc: string | undefined;
    }
  | { type: "error" }
  /** The backoff delay after an error has passed */
  | { type: "retry" }
  | { type: "load" };

export function initialImageRetry(
  primarySrc: string | undefined,
  fallbackSrc: string | undefined,
): ImageRetryState {
  return {
    primarySrc,
    fallbackSrc,
    src: primarySrc,
    status: "idle",
    retries: 0,
    onFallback: false,
  };
}

/** How long to wait before the next thumbnail attempt: 2s, 4s, 8s, 16s */
export function retryDelayMs(state: ImageRetryState): number {
  return BASE_DELAY_MS * Math.pow(2, state.retries - 1);
}

/** Whether a "retry" event is due after retryDelayMs (no timer while loading the fallback) */
export function isWaitingToRetry(state: ImageRetryState): boolean {
  return state.status === "retrying" && !state.onFallback;
}

export function imageRetryReducer(
  state: ImageRetryState,
  event: ImageRetryEvent,
): ImageRetryState {
  switch (event.type) {
    case "reset":
      return initialImageRetry(event.primarySrc, event.fallbackSrc);
    case "error":
      if (state.onFallback) return { ...state, status: "failed" };
      if (state.retries < MAX_RETRIES) {
        return { ...state, status: "retrying", retries: state.retries + 1 };
      }
      if (state.fallbackSrc) {
        return {
          ...state,
          src: state.fallbackSrc,
          onFallback: true,
          status: "retrying",
        };
      }
      return { ...state, status: "failed" };
    case "retry":
      if (!isWaitingToRetry(state)) return state;
      // A different URL makes next/image request it again
      return {
        ...state,
        src: `${state.primarySrc}?retry=${state.retries}`,
        status: "idle",
      };
    case "load":
      // Whatever is showing now loaded (in practice the original): drop the shimmer
      return state.status === "retrying" ? { ...state, status: "idle" } : state;
  }
}
