// server/src/services/postKeywordSearch.ts
// 貼文關鍵字搜尋（語意搜尋失敗時的 fallback、GET /api/posts?search=）的 WHERE 條件。
//
// posts.idx_search 是 ngram FULLTEXT 索引（ngram_token_size 預設 2，見
// db/migrations/2026-11-14-posts-search-ngram.sql）。查詢以空白切成多個詞，每個詞都必須出現：
// - 兩個字以上、只含文字與數字的詞 → MATCH ... AGAINST('+"詞"' IN BOOLEAN MODE)。
//   片語查詢要求 bigram 相鄰，結果等同子字串比對，且走索引。
// - 單字（「椅」）或含標點的詞（「iPhone-15」）→ LIKE '%詞%'。ngram 搜不到比 token 短的詞，
//   標點又會被 FULLTEXT parser 當成分隔符，這兩種只能逐列比對。

import type { SqlFragment } from "./postVisibility";

const FULLTEXT_TERM = /^[\p{L}\p{N}]{2,}$/u;

function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** 回傳 null 表示沒有可搜尋的詞（空字串或只有空白） */
export function buildPostKeywordSearchCondition(search: string): SqlFragment | null {
  const terms = search.trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return null;

  const fulltextTerms = terms.filter((t) => FULLTEXT_TERM.test(t));
  const likeTerms = terms.filter((t) => !FULLTEXT_TERM.test(t));

  const conditions: string[] = [];
  const params: string[] = [];

  if (fulltextTerms.length > 0) {
    conditions.push("MATCH(p.title, p.content, p.tags) AGAINST(? IN BOOLEAN MODE)");
    params.push(fulltextTerms.map((t) => `+"${t}"`).join(" "));
  }
  for (const term of likeTerms) {
    const pattern = `%${escapeLike(term)}%`;
    conditions.push("(p.title LIKE ? OR p.content LIKE ? OR p.tags LIKE ?)");
    params.push(pattern, pattern, pattern);
  }

  return { sql: `(${conditions.join(" AND ")})`, params };
}
