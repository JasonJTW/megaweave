"use client";

import { useTranslations } from "next-intl";
import type zhTW from "../messages/zh-TW.json";

type CategoryKey = keyof typeof zhTW.Categories;
type ConditionKey = keyof typeof zhTW.Conditions;
type ConditionField = keyof (typeof zhTW.Conditions)["1"];
type ConditionLeaf = `${ConditionKey}.${ConditionField}`;

/** The subset of a next-intl translator this module needs, so the logic stays testable. */
export interface NameCatalog {
  has: (key: string) => boolean;
  get: (key: string) => string;
}

/**
 * Categories and conditions are seeded reference data: only their ids are stable, so
 * the display names live in the translation catalogs keyed by id rather than in the DB.
 * `fallback` is the row's English name (`categories.name_en`, `conditions.name`), shown
 * when a locale has not been taught about that id yet.
 */
export function resolveReferenceName(
  catalog: NameCatalog,
  key: string | undefined,
  fallback: string | null | undefined,
): string {
  if (key && catalog.has(key)) return catalog.get(key);
  return fallback?.trim() || "";
}

const idKey = (id: number | null | undefined) =>
  id != null ? String(id) : undefined;

/** Display name of a category, by id. */
export function useCategoryName() {
  const t = useTranslations("Categories");

  return (
    category:
      { id?: number | null; name_en?: string | null } | null | undefined,
  ) =>
    resolveReferenceName(
      {
        has: (key) => t.has(key as CategoryKey),
        get: (key) => t(key as CategoryKey),
      },
      idKey(category?.id),
      category?.name_en,
    );
}

/** Display name and description of an item condition, by level. */
export function useConditionText() {
  const t = useTranslations("Conditions");
  const field = (name: ConditionField): NameCatalog => ({
    has: (key) => t.has(`${key}.${name}` as ConditionLeaf),
    get: (key) => t(`${key}.${name}` as ConditionLeaf),
  });

  return {
    name: (level: number | null | undefined, fallback?: string | null) =>
      resolveReferenceName(field("name"), idKey(level), fallback),
    description: (level: number | null | undefined, fallback?: string | null) =>
      resolveReferenceName(field("description"), idKey(level), fallback),
  };
}

/**
 * The condition label to show for a post. `condition_level` and `condition_name`
 * always travel together, so callers pass the post rather than both fields.
 */
export function usePostConditionName() {
  const conditionText = useConditionText();

  return (
    post:
      | { condition_level?: number | null; condition_name?: string | null }
      | null
      | undefined,
  ) => conditionText.name(post?.condition_level, post?.condition_name);
}
