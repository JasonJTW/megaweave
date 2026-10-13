export type WeavingRole = "offer" | "give" | "request";

export interface WeavingBanner {
  /** What the current user does in this Weave; null for messages sent before post type was recorded. */
  role: WeavingRole | null;
  /** The single item being woven, or null when the Weave covers the whole post. */
  itemTitle: string | null;
}

/**
 * What the "Start weaving…" divider in a chat says. The Giver is the author of a Share or
 * Commons and the non-author of a Wish; on a Wish the Giver offers rather than gives.
 */
export function weavingBanner({
  postType,
  isPostAuthor,
  itemTitle,
  itemId,
}: {
  postType: string | null | undefined;
  isPostAuthor: boolean;
  itemTitle: string | null | undefined;
  itemId: string | number | null | undefined;
}): WeavingBanner {
  const title = itemTitle?.trim() ?? "";
  const isWholePost =
    !title ||
    title.toLowerCase() === "all" ||
    itemId == null ||
    String(itemId).toLowerCase() === "all";

  return {
    role: postType ? weavingRole(postType, isPostAuthor) : null,
    itemTitle: isWholePost ? null : title,
  };
}

/** What the current user does in a Weave on a post of this type. */
export function weavingRole(
  postType: string,
  isPostAuthor: boolean,
): WeavingRole {
  const isGiver =
    postType === "share" || postType === "commons"
      ? isPostAuthor
      : !isPostAuthor;
  if (!isGiver) return "request";
  return postType === "wish" ? "offer" : "give";
}
