"use client";

//* 層級標示：同一個色相的三個深淺，越往外層越綠（Internal → Members → Public）
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { AudienceTier } from "@/lib/orgApi";

const TONES: Record<AudienceTier, string> = {
  internal: "bg-secondary text-dark",
  members: "bg-primary-15 text-primary",
  public: "bg-primary text-white",
};

export function TierPill({
  tier,
  className,
}: {
  tier: AudienceTier;
  className?: string;
}) {
  const t = useTranslations("Org");
  return (
    <span
      className={cn(
        "inline-flex h-6 flex-none items-center whitespace-nowrap rounded-full px-2.5 text-xs font-medium",
        TONES[tier],
        className,
      )}
    >
      {t(`tier.${tier}`)}
    </span>
  );
}
