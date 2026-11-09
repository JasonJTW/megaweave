"use client";

//* 組織相關頁面的共用外框：上方是組織切換（範圍），接著是頁籤（物品／物品管理／組織後台／報表），
//* 再來是頁面標題列。頁籤只列出這個人能進的頁面；只剩一頁時不顯示頁籤
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { OrgSwitcher, type OrgOption } from "@/components/org/OrgSwitcher";

/** 列內與工具列的小按鈕：不撐滿寬度、維持品牌的圓角 */
export const compactButton = "w-auto rounded-full px-3 tracking-normal";

export type OrgTab = "items" | "manage" | "admin" | "report";

const TAB_PATHS: Record<OrgTab, string> = {
  items: "/org",
  manage: "/org/items",
  admin: "/org-admin",
  report: "/org-admin/report",
};

export function orgTabs(access: {
  isAdmin: boolean;
  canManage: boolean;
}): OrgTab[] {
  const tabs: OrgTab[] = ["items"];
  if (access.canManage || access.isAdmin) tabs.push("manage");
  if (access.isAdmin) tabs.push("admin", "report");
  return tabs;
}

export function OrgShell({
  orgs,
  org,
  switchPath,
  tabs,
  current,
  title,
  subtitle,
  actions,
  showSingleOrg = true,
  children,
}: {
  orgs: OrgOption[];
  org: OrgOption | null;
  /** 切換組織時要換到的頁面（同一頁、不同 `?org=`） */
  switchPath: string;
  tabs: OrgTab[];
  current: OrgTab | null;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** 只有一個組織時是否仍顯示組織名稱；標題本身就是組織名稱時不必重複 */
  showSingleOrg?: boolean;
  children: ReactNode;
}) {
  const t = useTranslations("Org.nav");
  const showSwitcher = org && (orgs.length > 1 || showSingleOrg);
  const showTabs = org && tabs.length > 1;

  return (
    //* 底色與主頁（HomeFeed）相同：固定層蓋滿視窗，外框本身也上色，整頁截圖與列印不會露白
    <div className="min-h-screen bg-primary-5 font-ddin text-dark">
      <div aria-hidden className="fixed inset-0 -z-10 bg-primary-5" />
      <div className="mx-auto w-full min-w-0 max-w-6xl px-4 pb-20 pt-8 sm:px-6">
        {(showSwitcher || showTabs) && (
          <div className="mb-6 space-y-3">
            {showSwitcher && (
              <OrgSwitcher orgs={orgs} org={org} basePath={switchPath} />
            )}
            {showTabs && (
              <nav
                aria-label={t("label")}
                className="-mx-4 overflow-x-auto border-b border-primary-15 px-4 sm:mx-0 sm:px-0"
              >
                <ul className="flex gap-6">
                  {tabs.map((tab) => {
                    const active = tab === current;
                    return (
                      <li key={tab} className="shrink-0">
                        <Link
                          href={`${TAB_PATHS[tab]}?org=${org.id}`}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "-mb-px inline-flex h-11 items-center border-b-[3px] text-base transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                            active
                              ? "border-primary font-bold text-megaweave-forest-dark"
                              : "border-transparent text-dark/60 hover:border-primary-30 hover:text-megaweave-forest-dark",
                          )}
                        >
                          {t(tab)}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </nav>
            )}
          </div>
        )}

        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-megaweave-forest-dark md:text-4xl">
              {title}
            </h1>
            {subtitle && (
              <p className="max-w-3xl text-base leading-relaxed text-dark/70">
                {subtitle}
              </p>
            )}
          </div>
          {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
        </div>

        {children}
      </div>
    </div>
  );
}

/** 區塊內的狀態訊息：保留區塊外框，一句話說明 */
export function OrgNotice({
  tone = "muted",
  children,
}: {
  tone?: "muted" | "error";
  children: ReactNode;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      className={cn(
        "rounded-2xl border border-dashed border-primary-30 bg-white/60 px-5 py-6 text-base",
        tone === "error"
          ? "border-destructive/40 text-destructive"
          : "text-dark/60",
      )}
    >
      {children}
    </div>
  );
}
