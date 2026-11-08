import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { publisherDisplayName } from "@/lib/orgContact";

/**
 * 顯示發文者／對方名稱：組織設定匿名時 server 給的是代號（#140），翻成讀者語言的「匿名」
 */
export function useDisplayName() {
  const t = useTranslations("Publisher");
  return useCallback(
    <T extends string | null | undefined>(name: T) =>
      publisherDisplayName(name, t("anonymous")),
    [t],
  );
}
