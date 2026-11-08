"use client";

//* 組織頁（PRD 0001 §5.1、ADR 0003 prototype 例外）：Internal／Members 物品只在這裡顯示，
//* 不進首頁 Feed 與搜尋。上方切換器一次看一個組織；看得到哪些層級由 server 依 membership 判斷。
import { Suspense } from "react";
import { useTranslations } from "next-intl";
import useSWR from "swr";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getImageUrl } from "@/utils/imageUtils";
import { OrgSwitcher } from "@/components/org/OrgSwitcher";
import {
  hostName,
  OrgAccess,
  OrgPagePost,
  requestJson,
  useOrgItemCategories,
  useSelectedOrg,
} from "@/lib/orgApi";

function OrgPosts({ org }: { org: OrgAccess }) {
  const t = useTranslations("Org");
  const categories = useOrgItemCategories();
  const { data, error } = useSWR(
    `${hostName}/api/orgs/${org.id}/posts`,
    (url: string) => requestJson<{ posts: OrgPagePost[] }>(url),
  );

  if (error)
    return <p className="text-sm text-destructive">{t("loadFailed")}</p>;
  if (!data)
    return <p className="text-sm text-muted-foreground">{t("loading")}</p>;
  if (data.posts.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  }

  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {data.posts.map((post) => {
        const category = categories.find((c) => c.id === post.orgCategory);
        const cover = post.s3Keys[0];
        return (
          <li key={post.id}>
            <Link href={`/item/${post.id}`} className="block h-full">
              <Card className="h-full overflow-hidden transition-shadow hover:shadow-md">
                {cover && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={getImageUrl(cover, "original")}
                    alt=""
                    className="aspect-[4/3] w-full object-cover"
                  />
                )}
                <CardContent className="space-y-2 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">
                      {t(`tier.${post.audienceTier}`)}
                    </Badge>
                    {category && (
                      <Badge variant="outline">{category.name}</Badge>
                    )}
                  </div>
                  <h2 className="font-semibold">{post.title}</h2>
                  <p className="text-sm text-muted-foreground">
                    {post.unit.name}
                    {post.quantity !== null &&
                      ` · ${t("quantity", { count: post.quantity })}`}
                  </p>
                </CardContent>
              </Card>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function OrgPageContent() {
  const t = useTranslations("Org");
  const { orgs, org, error, isLoading } = useSelectedOrg();

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{org ? org.name : t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {error && <p className="text-sm text-destructive">{t("loadFailed")}</p>}
      {isLoading && (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      )}
      {!isLoading && !error && orgs.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("noOrgs")}</p>
      )}

      {org && (
        <>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <OrgSwitcher orgs={orgs} org={org} basePath="/org" />
            {org.manageableUnits.length > 0 && (
              <div className="flex gap-2">
                <Button asChild>
                  <Link href={`/org/items/new?org=${org.id}`}>
                    {t("listItem")}
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href={`/org/items?org=${org.id}`}>
                    {t("manageItems")}
                  </Link>
                </Button>
              </div>
            )}
          </div>
          <OrgPosts key={org.id} org={org} />
        </>
      )}
    </div>
  );
}

export default function OrgPage() {
  return (
    <Suspense>
      <OrgPageContent />
    </Suspense>
  );
}
