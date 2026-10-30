"use client";

import { useRouter } from "@/i18n/navigation";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import NotificationList from "@/app/components/Notification";
import toast from "react-hot-toast";
import { useUser } from "@/app/contexts/UserContext";
import { signinUrlForCurrentPage } from "@/lib/returnTo";

export default function NotificationsPage() {
  const { user, loading } = useUser();
  const router = useRouter();
  const t = useTranslations("Notifications");

  // Redirect to signin if user is not authenticated after loading
  useEffect(() => {
    if (!loading && !user) {
      toast.error(t("signInToView"));
      router.push(signinUrlForCurrentPage());
    }
  }, [loading, user, router, t]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-megaweave-cream px-4 pb-12 pt-24">
        <div className="flex animate-pulse flex-col items-center">
          <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-megaweave-forest border-t-transparent"></div>
          <p className="font-medium text-megaweave-forest">{t("loading")}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <>
      <div className="inset-0 bg-[#f5f4f3]" />
      <div className="min-h-screen px-4 pb-12 pt-8 font-ddin">
        <div className="mx-auto max-w-7xl">
          <div className="mb-10 text-center">
            <h1 className="type-h4 mb-3 text-megaweave-forest-dark">
              {t("title")}
            </h1>
          </div>

          <div className="w-full">
            <NotificationList />
          </div>
        </div>
      </div>
    </>
  );
}
