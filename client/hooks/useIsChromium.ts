"use client";

import { useState, useEffect } from "react";
import { isChromiumSupported } from "@/utils/browserDetection";

/**
 * React hook to detect whether the user is on a Chromium-based browser.
 * SSR-safe, avoids hydration mismatch, and evaluates immediately on client.
 */
export function useIsChromium(): boolean {
  const [isChromium, setIsChromium] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return isChromiumSupported();
    }
    return false;
  });

  useEffect(() => {
    setIsChromium(isChromiumSupported());
  }, []);

  return isChromium;
}
