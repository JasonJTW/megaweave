"use client";

import { useEffect } from "react";
import NotificationList from "@/app/components/Notification";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useUser } from "../contexts/UserContext";

export default function NotificationsPage() {
  const { user, loading } = useUser();
  const router = useRouter();

  // Redirect to signin if user is not authenticated after loading
  useEffect(() => {
    if (!loading && !user) {
      toast.error("Please sign in to view notifications");
      router.push(
        `/signin?returnTo=${encodeURIComponent(window.location.href)}`,
      );
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-megaweave-cream px-4 pb-12 pt-24">
        <div className="flex animate-pulse flex-col items-center">
          <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-megaweave-forest border-t-transparent"></div>
          <p className="font-medium text-megaweave-forest">
            Loading notifications...
          </p>
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
              Notification
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
