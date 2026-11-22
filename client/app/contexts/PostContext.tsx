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
import { api } from "@/lib/api";

interface PostContextType {
  categories: Category[];
  conditions: Condition[];
  loading: boolean;
  //* ApiError 或網路錯誤；顯示時用 translateApiError
  error: unknown;
  refetchPostContext: () => Promise<void>;
}

const PostContext = createContext<PostContextType | null>(null);

interface MetaProviderProps {
  children: ReactNode;
}

export const PostProvider: React.FC<MetaProviderProps> = ({ children }) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const fetchPostContext = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [catData, condData] = await Promise.all([
        api<{ categories: Category[] }>("/api/categories"),
        api<{ conditions: Condition[] }>("/api/conditions"),
      ]);
      setCategories(catData.categories);
      setConditions(condData.conditions);
    } catch (err) {
      console.error("Error fetching meta data:", err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

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
