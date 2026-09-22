"use client";

import React, {
  forwardRef,
  type ComponentType,
  type CSSProperties,
} from "react";
import { useIsChromium } from "@/hooks/useIsChromium";
import { cn } from "@/lib/utils";

export interface RefractionOptions {
  radius: number;
  blur?: number;
  glassThickness?: number;
  bezelWidth?: number;
  refractiveIndex?: number;
  specularOpacity?: number;
  specularAngle?: number;
  bezelHeightFn?: (x: number) => number;
}

export interface RefractionProps {
  refraction: RefractionOptions;
}

/**
 * Higher-Order Component that adds an outer fallback blur layer for non-Chromium browsers.
 *
 * @hashintel/refractive relies on SVG displacement filters in `backdrop-filter: url(#...)`,
 * which only works in Chromium. Non-Chromium browsers (iOS Safari, desktop Safari, Firefox)
 * fail silently and render transparent without any glass or blur effect.
 *
 * When Chromium is detected (via UA-CH or fallback), the raw refractive component is rendered directly.
 * When unsupported, an outer wrapper with CSS backdrop-blur and saturation is applied over the
 * refractive component so mobile and Safari users get a clean, frosted liquid glass appearance.
 */
export function withRefractiveFallback<
  P extends object,
  E extends HTMLElement = HTMLElement,
>(RawComponent: ComponentType<P & RefractionProps>, displayName: string) {
  const ComponentWithFallback = forwardRef<E, P & RefractionProps>(
    function RefractiveWithFallback(props, ref) {
      const isChromium = useIsChromium();

      // On Chromium browsers, render the native refractive component with full liquid glass SVG effect
      if (isChromium) {
        return React.createElement(RawComponent, {
          ...(props as unknown as Record<string, unknown>),
          ref,
        } as unknown as P & RefractionProps);
      }

      // On unsupported browsers (Safari, iOS WebKit, Firefox):
      // Cover the outer layer of the refractive component with a fallback blur layer
      const { refraction, className, style } = props as unknown as {
        refraction: RefractionOptions;
        className?: string;
        style?: CSSProperties;
      };

      const radius = refraction?.radius;
      const blurAmount = Math.max((refraction?.blur ?? 4) * 4, 16);

      return (
        <div
          className={cn(
            "refractive-fallback-wrapper",
            "backdrop-blur-md backdrop-saturate-150",
            "[-webkit-backdrop-filter:blur(16px)_saturate(180%)]",
            // If caller did not provide any background color, apply a subtle glass tint
            typeof className === "string" &&
              !className.includes("bg-") &&
              "bg-white/10 dark:bg-black/10",
            className,
          )}
          style={{
            ...style,
            borderRadius: radius !== undefined ? `${radius}px` : undefined,
            WebkitBackdropFilter: `blur(${blurAmount}px) saturate(180%)`,
            backdropFilter: `blur(${blurAmount}px) saturate(180%)`,
          }}
        >
          {React.createElement(RawComponent, {
            ...(props as unknown as Record<string, unknown>),
            ref,
            className: "h-full w-full border-0 !bg-transparent shadow-none",
            style: {
              ...style,
              background: "transparent",
              borderColor: "transparent",
              boxShadow: "none",
            },
          } as unknown as P & RefractionProps)}
        </div>
      );
    },
  );

  ComponentWithFallback.displayName = `withRefractiveFallback(${displayName})`;
  return ComponentWithFallback;
}
