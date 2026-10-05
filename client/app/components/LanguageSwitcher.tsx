"use client";

import { Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { useSwitchLocale } from "@/hooks/useSwitchLocale";
import { cn } from "@/lib/utils";

type LanguageSwitcherProps = {
  className?: string;
  iconClassName?: string;
  onSwitch?: () => void;
};

// Links to the current page in the other language, labelled in that language
const LanguageSwitcher = ({
  className,
  iconClassName,
  onSwitch,
}: LanguageSwitcherProps) => {
  const locale = useLocale();
  const pathname = usePathname();
  const switchLocale = useSwitchLocale();
  const t = useTranslations("LanguageSwitcher");
  const target = routing.locales.find((l) => l !== locale) ?? locale;

  return (
    <Link
      href={pathname}
      locale={target}
      hrefLang={target}
      title={t("label")}
      onClick={(event) => {
        event.preventDefault();
        onSwitch?.();
        switchLocale(target);
      }}
      className={cn("inline-flex items-center gap-2", className)}
    >
      <Languages aria-hidden className={cn("h-4 w-4", iconClassName)} />
      <span lang={target}>{t(target)}</span>
    </Link>
  );
};

export default LanguageSwitcher;
