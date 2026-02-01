"use client";

import React, { createContext, useContext } from "react";
import useSWR, { KeyedMutator } from "swr";
import User from "../types/user";

interface UserContextType {
  user: User | null;
  loading: boolean;
  error: (Error & { status?: number }) | null;
  mutate: KeyedMutator<{ user: User | null }>;
  refreshUser: () => Promise<void>;
  isAuthenticated: boolean;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

// Generic fetcher for SWR
const fetcher = async (url: string) => {
  const res = await fetch(url, { credentials: "include" });
  const data = await res.json();
  console.log("fetcher data:", data);

  if (!res.ok) {
    if (res.status === 401) {
      const error: Error & { info?: unknown; status?: number } = new Error("An error occurred while fetching the data.");
      error.info = res.status;
      error.status = res.status;
      throw error;
    }
    throw new Error(data.errorMessage || "Failed to fetch user");
  }
  return data;
};

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const hostName = process.env.NEXT_PUBLIC_HOSTNAME;

  const { data, error, isLoading, mutate } = useSWR(
    `${hostName}/api/currentUser`,
    fetcher,
    {
       shouldRetryOnError: false, // Don't retry if 401
       revalidateOnFocus: true,
       dedupingInterval: 30000,
    }
  );

  // If 401, data might be undefined even if we caught it, or we handle it via error.
  // API likely returns { user: ... }
  const user: User | null = data?.user || null;
  
  // Explicitly check for 401 to determine "authenticated" vs "error"
  // If error is 401, it's just "not logged in", not a system error.
  const isUnauthorized = error?.status === 401;
  const actualError = isUnauthorized ? null : error;
  
  const loading = isLoading;

  const refreshUser = async () => {
    await mutate();
  };

  return (
    <UserContext.Provider
      value={{
        user,
        loading,
        error: actualError,
        mutate,
        refreshUser,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
};
