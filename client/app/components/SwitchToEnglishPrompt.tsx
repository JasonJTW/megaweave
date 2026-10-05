"use client";

import { X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import {
  dismissEnglishPrompt,
  shouldOfferEnglish,
} from "@/i18n/languagePrompt";
import { useSwitchLocale } from "@/hooks/useSwitchLocale";

// Dismissible invitation to the English site for English-first browsers on zh-TW pages.
// Decided after mount because it depends on the browser's languages and cookies.
const SwitchToEnglishPrompt = () => {
  const locale = useLocale();
  const switchLocale = useSwitchLocale();
  const t = useTranslations("LanguagePrompt");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(
      shouldOfferEnglish({
        locale,
        languages: navigator.languages,
        cookie: document.cookie,
      }),
    );
  }, [locale]);

  if (!visible) return null;

  return (
    <aside
      aria-label={t("message")}
      lang="en"
      className="fixed inset-x-4 bottom-4 z-[70] mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-white px-4 py-3 font-ddin text-sm text-megaweave-forest-dark shadow-lg ring-1 ring-primary/20"
    >
      <span className="flex-1 font-medium">{t("message")}</span>
      <button
        type="button"
        onClick={() => switchLocale("en")}
        className="rounded-full bg-primary px-3 py-1.5 font-semibold text-white transition-colors hover:bg-primary/90"
      >
        {t("accept")}
      </button>
      <button
        type="button"
        aria-label={t("dismiss")}
        onClick={() => {
          dismissEnglishPrompt();
          setVisible(false);
        }}
        className="rounded-full p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
      >
        <X aria-hidden className="h-4 w-4" />
      </button>
    </aside>
  );
};

export default SwitchToEnglishPrompt;
