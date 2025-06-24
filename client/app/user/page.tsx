"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import User from "../types/user";
import { googleLogout } from "@react-oauth/google";
// import { Button } from "@/components/ui/button";
const hostName = process.env.NEXT_PUBLIC_HOSTNAME;

const UserPage = () => {
  //* Get user data from cookie session
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const fetchUser = async () => {
    try {
      const response = await fetch(`${hostName}/api/currentUser`, {
        cache: "no-store",
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        const errorMessage = await response.json();
        console.error("Error fetching user data:", errorMessage.errorMessage);
        //* Handle HTTP errors
        if (response.status === 401) {
          router.push("/signin");
          setRedirecting(true);
        }

        throw new Error(` ${errorMessage.errorMessage}`);
      }
      const userData = await response.json();
      console.log("Fetched User: ", userData);
      setUser(userData);
    } catch (error) {
      console.error("Error fetching user data:", error);
      setError(
        error instanceof Error ? error.message : "An unexpected error occurred"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      //* Sign out from Google OAuth
      try {
        googleLogout();
      } catch (googleError) {
        console.warn("Error during Google logout:", googleError);
      }

      //* Sign out from the server
      const response = await fetch(`${hostName}/api/signout`, {
        cache: "no-store",
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        if (response.status === 401) {
          alert("You are not signed in");
          return;
        }

        const errorMessage = await response.json();
        console.error("Error signing out:", errorMessage.errorMessage);
        throw new Error(` ${errorMessage.errorMessage}`);
      }

      console.log("Sign out successful");
      setUser(null);
      setRedirecting(true);
      router.push("/signin");
    } catch (error) {
      console.error("Error signing out:", error);
      setError(
        error instanceof Error ? error.message : "An unexpected error occurred"
      );
    }
  };

  useEffect(() => {
    fetchUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading || redirecting) {
    return (
      <div className="min-h-screen bg-primary-800 flex items-center justify-center">
        <h1 className="text-primary-300 text-3xl font-semibold font-mono tracking-wide">
          Loading...
        </h1>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-primary-800 flex items-center justify-center">
        <h1 className="text-primary-300 text-3xl font-semibold font-mono tracking-wide">
          Error fetching user data: {error}
        </h1>
      </div>
    );
  }

  if (!user) {
    setRedirecting(true);
    router.push("/signin");
    return;
  }

  return (
    <>
      <div className="min-h-screen bg-primary-800">
        <motion.div
          initial={{ opacity: 0, y: -60 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          <div className="pl-20 pt-40 flex-row">
            <div className="flex">
              <h1 className="text-primary-300 text-3xl font-semibold font-mono tracking-wide">
                UserPage
              </h1>
            </div>
            <div className="flex items-center justify-center rounded-full backdrop-blur-md bg-white bg-opacity-[3%] border-primary-700 border-[0.5px] text-primary-300 text-opacity-65 font-semibold tracking-wider text-xs pt-2 pb-2 pl-4 pr-4 mt-2 w-fit leading-none">
              {user.role}
            </div>
            <div className="mt-4">
              <div className="text-primary-300">name: {user.username}</div>
              <div className="text-primary-300">email: {user.email}</div>
            </div>
          </div>
          <div className="pl-20 pt-40 flex-row">
            <button
              className="flex items-center justify-center rounded-full backdrop-blur-md bg-pink-500 bg-opacity-[30%] border-primary-700 border-[0.5px] text-primary-300 text-opacity-65 font-semibold tracking-wider text-xs pt-2 pb-2 pl-4 pr-4 mt-2 w-fit leading-none"
              onClick={handleSignOut}
            >
              sign out
            </button>
          </div>
        </motion.div>
      </div>
    </>
  );
};

export default UserPage;
