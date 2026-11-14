-- Rebuild posts.idx_search with the ngram parser so keyword search can use it
-- (server/src/services/postKeywordSearch.ts).
--
-- The old index used the default parser, which splits on whitespace and so indexed a
-- whole Chinese sentence as one word; no query used it. ngram indexes every 2-character
-- run (ngram_token_size, default 2), so a MATCH phrase search behaves like a substring
-- search for any term of two or more characters. One-character terms still use LIKE.
--
-- Stopwords are off for this index: the ngram parser drops every token that contains a
-- stopword, and the InnoDB list includes `a`, `i` and `in`, so "ai" or "in" would match
-- nothing. The setting is read when the index is built and stored with it
-- (INNODB_FT_CONFIG use_stopword = 0); later inserts and queries keep it.
--
-- DROP and ADD must be two statements: MySQL 8.0 treats one ALTER that drops and re-adds
-- a FULLTEXT index of the same name and columns as a no-op, and the parser never changes.
--
-- Adding a FULLTEXT index blocks writes to posts while it builds (LOCK=SHARED).
SET SESSION innodb_ft_enable_stopword = OFF;
ALTER TABLE `posts` DROP INDEX `idx_search`;
ALTER TABLE `posts` ADD FULLTEXT KEY `idx_search` (`title`, `content`, `tags`) WITH PARSER ngram;
SET SESSION innodb_ft_enable_stopword = ON;
