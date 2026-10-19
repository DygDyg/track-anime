-- Search acceleration: pg_trgm GIN indexes for ILIKE '%…%'
-- Apply on Postgres (prod/local): psql "$DATABASE_URL" -f scripts/search-trgm-indexes.sql
-- Safe to re-run (IF NOT EXISTS).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "AnimeTitleAlias_title_trgm_idx"
  ON "AnimeTitleAlias" USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "AnimeCatalog_title_trgm_idx"
  ON "AnimeCatalog" USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "AnimeCatalog_titleOrig_trgm_idx"
  ON "AnimeCatalog" USING gin ("titleOrig" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "AnimeCatalog_description_trgm_idx"
  ON "AnimeCatalog" USING gin (description gin_trgm_ops);
