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

export interface OrgOption {
  id: string;
  name: string;
}

export function OrgSwitcher({
  orgs,
  org,
  basePath,
}: {
  orgs: OrgOption[];
  org: OrgOption;
  basePath: string;
}) {
  const t = useTranslations("Org");
  const router = useRouter();
  //* 只有一個組織時沒得切換，但仍要讓人知道現在看的是哪個組織
  if (orgs.length < 2) {
    return (
      <p className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">{t("orgLabel")}</span>
        <span className="font-medium">{org.name}</span>
      </p>
    );
  }
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 text-sm text-muted-foreground">
        {t("orgLabel")}
      </span>
      <Select
        value={org.id}
        onValueChange={(id) => router.replace(`${basePath}?org=${id}`)}
      >
        <SelectTrigger
          aria-label={t("orgLabel")}
          className="h-8 w-auto min-w-0 max-w-64 gap-2 text-sm font-medium"
        >
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
