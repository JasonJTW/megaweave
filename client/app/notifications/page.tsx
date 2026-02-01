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
      router.push("/signin");
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="min-h-screen pt-24 pb-12 px-4 flex items-center justify-center bg-megaweave-cream">
        <div className="animate-pulse flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-megaweave-forest border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-megaweave-forest font-medium">
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
      <div className="bg-[#f5f4f3] inset-0 " />
      <div className="min-h-screen pt-8 pb-12 px-4 font-ddin">
        <div className="max-w-7xl mx-auto">
          <div className="mb-10 text-center">
            <h1 className="type-h4 text-megaweave-forest-dark mb-3">
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
