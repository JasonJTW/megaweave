"use client";

//* 組織頁（PRD 0001 §5.1、ADR 0003 prototype 例外）：Internal／Members 物品只在這裡顯示，
//* 不進首頁 Feed 與搜尋。上方切換器一次看一個組織；看得到哪些層級由 server 依 membership 判斷。
//* 類別篩選只在畫面上過濾已載入的物品，不另打 API
import { Suspense, useState } from "react";
import { useTranslations } from "next-intl";
import useSWR from "swr";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getImageUrl } from "@/utils/imageUtils";
import { OrgNotice, OrgShell, orgTabs } from "@/components/org/OrgShell";
import { TierPill } from "@/components/org/TierPill";
import {
  hostName,
  OrgAccess,
  OrgPagePost,
  requestJson,
  useOrgItemCategories,
  useSelectedOrg,
} from "@/lib/orgApi";
import { orgPostsKey } from "@/lib/orgSwrKeys";
import { shownQuantity } from "@/lib/orgQuantity";

const ALL = "all";

function PostCardSkeleton() {
  return (
    <li aria-hidden className="overflow-hidden rounded-2xl bg-white">
      <div className="aspect-[4/3] bg-muted" />
      <div className="space-y-2 p-4">
        <div className="h-4 w-3/4 rounded bg-muted" />
        <div className="h-3 w-1/2 rounded bg-muted" />
      </div>
    </li>
  );
}

function OrgPosts({ org }: { org: OrgAccess }) {
  const t = useTranslations("Org");
  const categories = useOrgItemCategories();
  const [category, setCategory] = useState(ALL);
  const { data, error } = useSWR(orgPostsKey(hostName, org.id), (url: string) =>
    requestJson<{ posts: OrgPagePost[] }>(url),
  );

  if (error) return <OrgNotice tone="error">{t("loadFailed")}</OrgNotice>;
  if (!data) {
    return (
      <ul
        aria-label={t("loading")}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      >
        {Array.from({ length: 8 }, (_, i) => (
          <PostCardSkeleton key={i} />
        ))}
      </ul>
    );
  }
  if (data.posts.length === 0) {
    return (
      <OrgNotice>
        {t("empty")}
        {org.manageableUnits.length > 0 && (
          <>
            {" "}
            <Link
              href={`/org/items/new?org=${org.id}`}
              className="font-medium text-foreground underline underline-offset-4"
            >
              {t("listFirstItem")}
            </Link>
          </>
        )}
      </OrgNotice>
    );
  }

  const nameOf = (id: string | null) =>
    categories.find((c) => c.id === id)?.name ?? null;
  //* 只列出這個組織真的有物品的類別，依件數排序
  const counts = new Map<string, number>();
  for (const post of data.posts) {
    if (post.orgCategory) {
      counts.set(post.orgCategory, (counts.get(post.orgCategory) ?? 0) + 1);
    }
  }
  const chips = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const visible =
    category === ALL
      ? data.posts
      : data.posts.filter((p) => p.orgCategory === category);

  return (
    <div className="space-y-5">
      {chips.length > 1 && (
        <div
          role="group"
          aria-label={t("categoryFilter")}
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
        >
          {[[ALL, data.posts.length] as const, ...chips].map(([id, count]) => {
            const active = category === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                onClick={() => setCategory(id)}
                className={cn(
                  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  active
                    ? "border-primary bg-primary text-white"
                    : "border-primary-30 bg-white text-foreground hover:bg-primary-5",
                )}
              >
                {id === ALL ? t("allCategories") : (nameOf(id) ?? id)}
                <span
                  className={cn(
                    "tabular-nums",
                    active ? "text-white/80" : "text-muted-foreground",
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {visible.map((post) => {
          const categoryName = nameOf(post.orgCategory);
          const cover = post.s3Keys[0];
          return (
            <li key={post.id}>
              <Link
                href={`/item/${post.id}`}
                className="group block h-full overflow-hidden rounded-2xl bg-white transition-transform duration-200 hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              >
                <div className="relative aspect-[4/3] overflow-hidden bg-primary-15">
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={getImageUrl(cover, "original")}
                      alt=""
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                    />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-primary-75">
                      {categoryName ?? t("noPhoto")}
                    </span>
                  )}
                </div>
                <div className="space-y-1.5 p-4">
                  <h2 className="line-clamp-2 text-lg font-bold leading-snug text-megaweave-forest-dark group-hover:underline group-hover:underline-offset-4">
                    {post.title}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {post.unit.name}
                    {/* 顯示還能領的數量；交織完成後會減少，登記數量只留給報表 */}
                    {shownQuantity(post) !== null &&
                      ` · ${t("quantity", { count: shownQuantity(post) ?? 0 })}`}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <TierPill tier={post.audienceTier} />
                    {cover && categoryName && (
                      <span className="text-xs text-muted-foreground">
                        {categoryName}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function OrgPageContent() {
  const t = useTranslations("Org");
  const { orgs, org, error, isLoading } = useSelectedOrg();

  return (
    <OrgShell
      orgs={orgs}
      org={org}
      switchPath="/org"
      tabs={
        org
          ? orgTabs({
              isAdmin: org.isAdmin,
              canManage: org.manageableUnits.length > 0,
            })
          : []
      }
      current="items"
      title={org ? t("nav.items") : t("title")}
      subtitle={t("subtitle")}
      actions={
        org &&
        org.manageableUnits.length > 0 && (
          <Button asChild className="w-auto">
            <Link href={`/org/items/new?org=${org.id}`}>{t("listItem")}</Link>
          </Button>
        )
      }
    >
      {error && <OrgNotice tone="error">{t("loadFailed")}</OrgNotice>}
      {isLoading && <OrgNotice>{t("loading")}</OrgNotice>}
      {!isLoading && !error && orgs.length === 0 && (
        <OrgNotice>{t("noOrgs")}</OrgNotice>
      )}
      {org && <OrgPosts key={org.id} org={org} />}
    </OrgShell>
  );
}

export default function OrgPage() {
  return (
    <Suspense>
      <OrgPageContent />
    </Suspense>
  );
}
