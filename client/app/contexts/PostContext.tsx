"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useCallback,
  useMemo,
} from "react";
import { Category, Condition } from "@/app/types/schema";

interface PostContextType {
  categories: Category[];
  conditions: Condition[];
  loading: boolean;
  error: string | null;
  refetchPostContext: () => Promise<void>;
}

const PostContext = createContext<PostContextType | null>(null);

interface MetaProviderProps {
  children: ReactNode;
}

export const PostProvider: React.FC<MetaProviderProps> = ({ children }) => {
  const hostName = process.env.NEXT_PUBLIC_HOSTNAME;
  const [categories, setCategories] = useState<Category[]>([]);
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPostContext = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [catRes, condRes] = await Promise.all([
        fetch(`${hostName}/api/categories`),
        fetch(`${hostName}/api/conditions`),
      ]);
      const catData = await catRes.json();
      const condData = await condRes.json();

      if (catRes.ok) setCategories(catData.categories);
      else
        throw new Error(catData.errorMessage || "Failed to fetch categories");

      if (condRes.ok) setConditions(condData.conditions);
      else
        throw new Error(condData.errorMessage || "Failed to fetch conditions");
    } catch (err) {
      console.error("Error fetching meta data:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [hostName]);

  useEffect(() => {
    fetchPostContext();
  }, [fetchPostContext]);

  const value: PostContextType = useMemo(
    () => ({
      categories,
      conditions,
      loading,
      error,
      refetchPostContext: fetchPostContext,
    }),
    [categories, conditions, loading, error, fetchPostContext],
  );

  return <PostContext.Provider value={value}>{children}</PostContext.Provider>;
};

export const usePost = (): PostContextType => {
  const context = useContext(PostContext);
  if (!context) throw new Error("useMeta must be used within a MetaProvider");
  return context;
};
