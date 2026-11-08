"use client";

//* 物品流轉時間軸（PRD 0001 §5.1 E9-1）：上架、層級變更、交接、申請、核可、交接完成，每一步有操作者與時間。
//* server 組好順序（orgTimelineService）；這裡只負責顯示。不認得的 kind（之後新增的紀錄，例如 #140 的待公開）
//* 仍顯示時間、操作者與 kind 本身，不必改這裡就看得到
import { useFormatter, useTranslations } from "next-intl";
import useSWR from "swr";
import { hostName, OrgTimelineEntry, requestJson } from "@/lib/orgApi";

const KNOWN_KINDS = [
  "listed",
  "tier_changed",
  "handed_over",
  "requested",
  "approved",
  "declined",
  "withdrawn",
  "cancelled",
  "confirmed",
  "completed",
  "deleted",
] as const;
type KnownKind = (typeof KNOWN_KINDS)[number];

const TIERS = ["internal", "members", "public"] as const;
type Tier = (typeof TIERS)[number];

function isTier(value: unknown): value is Tier {
  return (TIERS as readonly unknown[]).includes(value);
}

function isKnown(kind: string): kind is KnownKind {
  return (KNOWN_KINDS as readonly string[]).includes(kind);
}

function str(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}

function nameOf(value: unknown): string {
  return value && typeof value === "object" && "name" in value
    ? str((value as { name: unknown }).name)
    : "";
}

function useDetail() {
  const t = useTranslations("Org");
  const tierLabel = (tier: unknown) =>
    isTier(tier) ? t(`tier.${tier}`) : str(tier);

  return (entry: OrgTimelineEntry): string | null => {
    const weaveId = str(entry.weaveId);
    const quantity = str(entry.quantity);
    const unit = nameOf(entry.receiverUnit);
    switch (entry.kind) {
      case "listed": {
        const asset = str(entry.assetNumber);
        const parts = [
          t("timeline.listedDetail", { unit: nameOf(entry.unit) }),
        ];
        if (asset) parts.push(t("timeline.assetNumber", { asset }));
        return parts.join("・");
      }
      case "tier_changed":
        return t("timeline.tierDetail", {
          from: tierLabel(entry.fromTier),
          to: tierLabel(entry.toTier),
        });
      case "handed_over": {
        const names = { from: nameOf(entry.from), to: nameOf(entry.to) };
        return entry.weaveId == null
          ? t("timeline.handoverItem", names)
          : t("timeline.handoverWeave", { ...names, weaveId });
      }
      case "requested":
        return unit
          ? t("timeline.requestOnBehalf", { weaveId, unit, quantity })
          : t("timeline.requestPersonal", { weaveId, quantity });
      case "completed": {
        const name = nameOf(entry.receiver);
        return unit
          ? t("timeline.completedUnit", { weaveId, unit, name, quantity })
          : t("timeline.completedPerson", { weaveId, name, quantity });
      }
      case "approved":
      case "declined":
      case "withdrawn":
      case "cancelled":
      case "confirmed":
        return t("timeline.weaveStep", { weaveId });
      default:
        return null;
    }
  };
}

export function ItemTimeline({
  orgId,
  itemId,
}: {
  orgId: string;
  itemId: string;
}) {
  const t = useTranslations("Org");
  const format = useFormatter();
  const detailOf = useDetail();
  const { data, error } = useSWR(
    `${hostName}/api/orgs/${orgId}/items/${itemId}/timeline`,
    (url: string) => requestJson<{ timeline: OrgTimelineEntry[] }>(url),
  );

  if (error) {
    return <p className="text-sm text-destructive">{t("loadFailed")}</p>;
  }
  if (!data) {
    return <p className="text-sm text-muted-foreground">{t("loading")}</p>;
  }
  if (data.timeline.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">{t("timeline.empty")}</p>
    );
  }

  return (
    <section aria-label={t("timeline.title")} className="space-y-2">
      <h3 className="text-sm font-semibold">{t("timeline.title")}</h3>
      <ol className="space-y-2 border-l pl-4">
        {data.timeline.map((entry, index) => {
          const detail = detailOf(entry);
          const actor =
            entry.actor === null
              ? t("timeline.unknownActor")
              : entry.actor.type === "system"
                ? t("timeline.system")
                : entry.actor.name;
          return (
            <li
              key={`${entry.kind}-${entry.at}-${index}`}
              data-kind={entry.kind}
              className="text-sm"
            >
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">
                  {isKnown(entry.kind)
                    ? t(`timeline.kind.${entry.kind}`)
                    : `${t("timeline.kind.other")}（${entry.kind}）`}
                </span>
                <span>{actor}</span>
                <time dateTime={entry.at} className="text-muted-foreground">
                  {format.dateTime(new Date(entry.at), {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </time>
              </div>
              {detail && <p className="text-muted-foreground">{detail}</p>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
