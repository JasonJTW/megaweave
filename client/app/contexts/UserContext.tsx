"use client";

import React, { createContext, useContext } from "react";
import useSWR, { KeyedMutator } from "swr";
import User from "../types/user";
import type { ApiError } from "@/lib/apiError";

interface UserContextType {
  user: User | null;
  loading: boolean;
  error: ApiError | null;
  mutate: KeyedMutator<{ user: User | null }>;
  refreshUser: () => Promise<void>;
  isAuthenticated: boolean;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { data, error, isLoading, mutate } = useSWR<
    { user: User | null },
    ApiError
  >("/api/currentUser", {
    shouldRetryOnError: false, // Don't retry if 401
    revalidateOnFocus: false,
    dedupingInterval: 30000,
  });

  // If 401, data might be undefined even if we caught it, or we handle it via error.
  // API likely returns { user: ... }
  const user: User | null = data?.user || null;

  // Explicitly check for 401 to determine "authenticated" vs "error"
  // If error is 401, it's just "not logged in", not a system error.
  const isUnauthorized = error?.status === 401;
  const actualError = isUnauthorized ? null : (error ?? null);

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
