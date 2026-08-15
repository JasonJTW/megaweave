/**
 * generatePostText.ts
 *
 * Assembles a post's structured data into a natural-language English string
 * for OpenAI text-embedding-3-small to generate semantic vectors.
 *
 * Output example:
 *   "[Share][Books] Used Biology Textbook (Good condition)
 *    Description: Almost-new General Biology with answer book.
 *    Tags: textbook, biology, university
 *    Items: General Biology x2, Answer Book x1
 *    Location: Da'an District, Taipei"
 */

import { PostType, PostTextInput } from "../types/post";
export type { PostTextInput };

const TYPE_LABEL: Record<PostType, string> = {
  share: "Share",
  wish: "Wish",
  commons: "Commons",
};

/**
 * Builds the embedding text for a post.
 * Optional fields are omitted entirely when blank to avoid wasting tokens.
 */
export function generatePostText(post: PostTextInput): string {
  const parts: string[] = [];

  // Header: [Type][Category] Title (Condition)
  const typeLabel = TYPE_LABEL[post.type] ?? post.type;
  const categoryPart = post.category_name ? `[${post.category_name}]` : "";
  const conditionPart = post.condition_name ? `(${post.condition_name})` : "";
  parts.push(
    `[${typeLabel}]${categoryPart} ${post.title} ${conditionPart}`.trim(),
  );

  // Description
  if (post.content?.trim()) {
    parts.push(`Description: ${post.content.trim()}`);
  }

  // Tags (comma-separated string)
  if (post.tags?.trim()) {
    parts.push(`Tags: ${post.tags.trim()}`);
  }

  // Item list
  if (post.items && post.items.length > 0) {
    const itemsText = post.items
      .map((item) => `${item.title} x${item.quantity}`)
      .join(", ");
    parts.push(`Items: ${itemsText}`);
  }

  // Location
  const locationParts = [post.city, post.province].filter(Boolean);
  if (locationParts.length > 0) {
    parts.push(`Location: ${locationParts.join(", ")}`);
  }

  return parts.join("\n");
}
