"use client";

//* 組織切換器（PRD 0001 §5.1：一次看一個組織）；選擇存在網址的 `?org=`
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { OrgAccess } from "@/lib/orgApi";

export function OrgSwitcher({
  orgs,
  org,
  basePath,
}: {
  orgs: OrgAccess[];
  org: OrgAccess;
  basePath: string;
}) {
  const t = useTranslations("Org");
  const router = useRouter();
  if (orgs.length < 2) return null;
  return (
    <div className="max-w-xs space-y-1">
      <span className="text-sm font-medium">{t("orgLabel")}</span>
      <Select
        value={org.id}
        onValueChange={(id) => router.replace(`${basePath}?org=${id}`)}
      >
        <SelectTrigger aria-label={t("orgLabel")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {orgs.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
