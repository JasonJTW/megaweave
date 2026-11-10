import { useCallback, useEffect, useReducer } from "react";
import {
  imageRetryReducer,
  initialImageRetry,
  isWaitingToRetry,
  retryDelayMs,
} from "@/utils/imageRetry";

/**
 * Shows a resized image that may not exist yet: retries primarySrc with
 * exponential backoff, then falls back to fallbackSrc (see utils/imageRetry).
 * Wire onError/onLoad to the <img> or next/image.
 */
export function useImageWithRetry(
  primarySrc: string | undefined,
  fallbackSrc: string | undefined,
) {
  const [state, dispatch] = useReducer(
    imageRetryReducer,
    initialImageRetry(primarySrc, fallbackSrc),
  );

  // 當 primarySrc 變更（例如切換貼文）時，重置所有狀態
  useEffect(() => {
    dispatch({ type: "reset", primarySrc, fallbackSrc });
  }, [primarySrc, fallbackSrc]);

  // 等待退避時間後重試縮圖；unmount 或狀態改變時清除計時器
  const waiting = isWaitingToRetry(state);
  const delay = retryDelayMs(state);
  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => dispatch({ type: "retry" }), delay);
    return () => clearTimeout(timer);
  }, [waiting, delay]);

  const onError = useCallback(() => dispatch({ type: "error" }), []);
  const onLoad = useCallback(() => dispatch({ type: "load" }), []);

  return { src: state.src, status: state.status, onError, onLoad };
}
