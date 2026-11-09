"use client";

//* 沒有可管理的單位時的說明：Org Admin（含 Platform Admin）能管全部單位，清單是空的代表組織還沒建單位，
//* 要先到組織後台新增；其他人是真的不是任何單位的窗口
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { OrgAccess } from "@/lib/orgApi";
import { OrgNotice } from "@/components/org/OrgShell";

export function NoUnitsNotice({
  org,
  notContactMessage,
}: {
  org: OrgAccess;
  notContactMessage: string;
}) {
  const t = useTranslations("Org");
  if (!org.isAdmin) {
    return <OrgNotice>{notContactMessage}</OrgNotice>;
  }
  return (
    <OrgNotice>
      {t("noUnitsYet", { org: org.name })}{" "}
      <Link
        href={`/org-admin?org=${org.id}`}
        className="font-medium text-foreground underline underline-offset-4"
      >
        {t("goToOrgAdmin")}
      </Link>
    </OrgNotice>
  );
}
