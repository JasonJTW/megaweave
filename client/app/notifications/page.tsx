"use client";

import { useEffect, useState } from "react";
import NotificationTest from "@/app/components/NotificationTest";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import User from "../types/user";

export default function NotificationsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const hostName = process.env.NEXT_PUBLIC_HOSTNAME;

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await fetch(`${hostName}/api/currentUser`, {
          cache: "no-store",
          method: "GET",
          credentials: "include",
        });

        if (!response.ok) {
          if (response.status === 401) {
            router.push("/signin");
            return;
          }
          throw new Error("Failed to fetch user");
        }

        const userData = await response.json();
        setUser(userData.user);
      } catch (error) {
        console.error("Error fetching user:", error);
        toast.error("Failed to load user data");
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [hostName, router]);

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
          <p className="text-megaweave-forest font-medium">Loading notifications...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
  <>
    <div className="bg-[#f5f4f3] inset-0 "/>
    <div className="min-h-screen pt-8 pb-12 px-4 font-ddin">
      <div className="max-w-7xl mx-auto">
        <div className="mb-10 text-center">
          <h1 className="type-h4 text-megaweave-forest-dark mb-3">Notification</h1>
        </div>
        
        <div className="w-full">
          <NotificationTest userId={user.userId} />
        </div>
      </div>
    </div>
  </>
  );
}
