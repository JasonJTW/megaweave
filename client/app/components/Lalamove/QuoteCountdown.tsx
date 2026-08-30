"use client";

import React, { useEffect, useRef } from "react";
import { CheckCircle2 } from "lucide-react";

export interface QuoteCountdownProps {
  expiresAt?: string;
  labelCountdown?: string;
  labelExpired?: string;
  onExpireChange?: (isExpired: boolean) => void;
  className?: string;
}

/**
 * 獨立倒數計時元件：使用 ref 直接操作 DOM，完全繞過 React state，
 * 確保計時器每秒的更新零 React re-render、零 DevTools 框框。
 */
export const QuoteCountdown = React.memo(function QuoteCountdown({
  expiresAt,
  labelCountdown = "報價保留倒數：",
  labelExpired = "報價已過期",
  onExpireChange,
  className = "flex items-center gap-1.5 text-xs text-gray-500",
}: QuoteCountdownProps) {
  const countdownSpanRef = useRef<HTMLSpanElement>(null);
  const rowRef = useRef<HTMLSpanElement>(null);
  const expiredSpanRef = useRef<HTMLSpanElement>(null);

  // Compute initial formatted string for SSR / first paint
  const computeInitial = () => {
    if (!expiresAt) return "5:00";
    const remaining = Math.max(
      0,
      Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000),
    );
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  useEffect(() => {
    const format = (sec: number) => {
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return `${m}:${s.toString().padStart(2, "0")}`;
    };

    const setExpiredDisplay = (isExpired: boolean) => {
      if (rowRef.current)
        rowRef.current.style.display = isExpired ? "none" : "inline";
      if (expiredSpanRef.current)
        expiredSpanRef.current.style.display = isExpired ? "inline" : "none";
    };

    if (!expiresAt) {
      setExpiredDisplay(false);
      onExpireChange?.(false);
      if (countdownSpanRef.current)
        countdownSpanRef.current.textContent = "5:00";
      return;
    }

    const exp = new Date(expiresAt).getTime();
    let lastFormatted = "";

    // Tick function — only touches DOM, never calls React setState
    const tick = () => {
      const remaining = Math.max(0, Math.floor((exp - Date.now()) / 1000));
      if (remaining > 0) {
        setExpiredDisplay(false);
        onExpireChange?.(false);
        const formatted = format(remaining);
        if (countdownSpanRef.current && formatted !== lastFormatted) {
          lastFormatted = formatted;
          countdownSpanRef.current.textContent = formatted;
        }
      } else {
        if (countdownSpanRef.current && lastFormatted !== "0:00") {
          lastFormatted = "0:00";
          countdownSpanRef.current.textContent = "0:00";
        }
        setExpiredDisplay(true);
        onExpireChange?.(true);
      }
    };

    tick(); // immediate first paint
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [expiresAt, onExpireChange]);

  return (
    <div className={className}>
      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
      {/* rowRef hides when expired; expiredSpanRef shows */}
      <span ref={rowRef}>
        {labelCountdown}{" "}
        <span
          ref={countdownSpanRef}
          className="font-mono font-bold text-orange-600"
        >
          {computeInitial()}
        </span>
      </span>
      <span
        ref={expiredSpanRef}
        style={{ display: "none" }}
        className="font-semibold text-red-500"
      >
        {labelExpired}
      </span>
    </div>
  );
});

export default QuoteCountdown;
