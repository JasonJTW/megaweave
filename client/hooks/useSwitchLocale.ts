"use client";

import { usePathname, useRouter } from "@/i18n/navigation";
import { dismissEnglishPrompt } from "@/i18n/languagePrompt";
import type { Locale } from "@/i18n/routing";
import { useUser } from "@/app/contexts/UserContext";

const hostName = process.env.NEXT_PUBLIC_HOSTNAME;

/**
 * Explicit language switch: moves to the same page (path, query, hash) in the target
 * locale and, for signed-in users, saves it as the account language. Visiting a
 * /en URL directly never goes through here, so it never changes the account language.
 */
export function useSwitchLocale() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useUser();

  return (locale: Locale) => {
    // The visitor has picked a language, so the English prompt is no longer needed
    dismissEnglishPrompt();

    if (user) {
      // keepalive lets the request finish while the page navigates away
      fetch(`${hostName}/api/me/locale`, {
        method: "PUT",
        credentials: "include",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale }),
      }).catch((error) =>
        console.error("Failed to save account language:", error),
      );
    }

    const { search, hash } = window.location;
    router.push(`${pathname}${search}${hash}`, { locale });
  };
}
