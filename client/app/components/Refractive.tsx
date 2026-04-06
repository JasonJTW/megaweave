"use client";

/**
 * Raw refractive exports — DO NOT import this file directly.
 * Use `@/app/components/Refractive.client` instead.
 */
import { refractive } from "@hashintel/refractive";
import { Button } from "@/components/ui/button";

export const RefractiveDiv = refractive.div;
export const RefractiveSpan = refractive.span;
export const RefractiveNav = refractive.nav;
export const RefractiveButton = refractive(Button);
