"use client";

//* 組織相關頁面的共用外框：上方是組織切換（範圍），接著是頁籤（物品／物品管理／組織後台／報表），
//* 再來是頁面標題列。頁籤只列出這個人能進的頁面；只剩一頁時不顯示頁籤
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
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
  children: ReactNode;
}) {
  const showTabs = org && tabs.length > 1;

  return (
    //* 底色與主頁（HomeFeed）相同：固定層蓋滿視窗，外框本身也上色，整頁截圖與列印不會露白
    <div className="min-h-screen bg-primary-5 font-ddin text-dark">
      <div aria-hidden className="fixed inset-0 -z-10 bg-primary-5" />
      <div className="mx-auto w-full min-w-0 max-w-6xl px-4 pb-20 pt-8 sm:px-6">
        {org && (
          <div className="mb-6 space-y-3">
            <OrgSwitcher orgs={orgs} org={org} basePath={switchPath} />
            {showTabs && (
              <OrgTabs orgId={org.id} tabs={tabs} current={current} />
            )}
          </div>
        )}

        {/* 換頁籤時內容淡入上移；key 讓切換組織時也重播一次 */}
        <div
          key={`${current}-${org?.id ?? ""}`}
          className="motion-safe:animate-in motion-safe:duration-300 motion-safe:ease-out motion-safe:fade-in motion-safe:slide-in-from-bottom-2"
        >
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
    </div>
  );
}

//* 每個頁籤是獨立的頁面，換頁時外框會重新掛載；把上一頁底線的位置記在模組層，
//* 新頁面掛載時從那裡滑到目前的頁籤
let lastIndicator: { left: number; width: number } | null = null;

function OrgTabs({
  orgId,
  tabs,
  current,
}: {
  orgId: string;
  tabs: OrgTab[];
  current: OrgTab | null;
}) {
  const t = useTranslations("Org.nav");
  const listRef = useRef<HTMLUListElement>(null);
  const [indicator, setIndicator] = useState<{
    left: number;
    width: number;
    animate: boolean;
  } | null>(null);

  useLayoutEffect(() => {
    const list = listRef.current;
    const active = list?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!list || !active) {
      setIndicator(null);
      return;
    }
    const measure = () => ({
      left: active.offsetLeft,
      width: active.offsetWidth,
    });
    const target = measure();
    const from = lastIndicator;
    lastIndicator = target;
    let frame = 0;
    if (!from || (from.left === target.left && from.width === target.width)) {
      setIndicator({ ...target, animate: false });
    } else {
      //* 先放在上一頁的位置，下一格畫面再滑過去
      setIndicator({ ...from, animate: false });
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() =>
          setIndicator({ ...target, animate: true }),
        );
      });
    }
    //* 字型載入或視窗改變寬度時重新對齊（略過 observe 當下的第一次回呼，免得打斷滑動）
    let first = true;
    const observer = new ResizeObserver(() => {
      if (first) {
        first = false;
        return;
      }
      const next = measure();
      if (
        next.left === lastIndicator?.left &&
        next.width === lastIndicator.width
      )
        return;
      lastIndicator = next;
      setIndicator({ ...next, animate: true });
    });
    observer.observe(list);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [current, tabs]);

  return (
    //* 底線畫在列表內（不再用 -mb-px 壓到 nav 的邊框），垂直方向不會溢出，就不會冒出捲軸；
    //* 手機上頁籤太多時仍可橫向滑動，但不顯示捲軸
    <nav
      aria-label={t("label")}
      className="-mx-4 overflow-x-auto overflow-y-hidden px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
    >
      <ul ref={listRef} className="relative flex gap-6">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-primary-15"
        />
        {tabs.map((tab) => {
          const active = tab === current;
          return (
            <li key={tab} className="shrink-0">
              <Link
                href={`${TAB_PATHS[tab]}?org=${orgId}`}
                aria-current={active ? "page" : undefined}
                draggable={false}
                className={cn(
                  "group relative inline-flex h-11 select-none items-center text-base transition-colors duration-200 [-webkit-user-drag:none] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  active
                    ? "font-bold text-megaweave-forest-dark"
                    : "text-dark/60 hover:text-megaweave-forest-dark",
                )}
              >
                {t(tab)}
                {!active && (
                  <span
                    aria-hidden
                    className="absolute inset-x-0 bottom-0 h-[3px] origin-center scale-x-0 bg-primary-30 transition-transform duration-200 group-hover:scale-x-100"
                  />
                )}
              </Link>
            </li>
          );
        })}
        {indicator && (
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute bottom-0 left-0 h-[3px] bg-primary",
              indicator.animate &&
                "motion-safe:transition-[transform,width] motion-safe:duration-300 motion-safe:ease-out",
            )}
            style={{
              width: indicator.width,
              transform: `translateX(${indicator.left}px)`,
            }}
          />
        )}
      </ul>
    </nav>
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
