CREATE TABLE "report_board_columns" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "color" TEXT NOT NULL DEFAULT 'primary',
  "order" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "report_board_columns_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "report_board_columns_workspaceId_key_key"
  ON "report_board_columns"("workspaceId", "key");

CREATE INDEX "report_board_columns_workspaceId_order_idx"
  ON "report_board_columns"("workspaceId", "order");

ALTER TABLE "report_board_columns"
  ADD CONSTRAINT "report_board_columns_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "report_board_columns" (
  "id",
  "workspaceId",
  "key",
  "title",
  "description",
  "color",
  "order",
  "createdAt",
  "updatedAt"
)
SELECT
  'rbc_' || substr(md5("id" || ':backlog'), 1, 24),
  "id",
  'backlog',
  'Backlog',
  'Fresh captures land here until someone triages them.',
  'cool',
  1000,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "workspaces"
UNION ALL
SELECT
  'rbc_' || substr(md5("id" || ':in-progress'), 1, 24),
  "id",
  'in-progress',
  'In progress',
  'Actively being investigated or fixed.',
  'primary',
  2000,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "workspaces"
UNION ALL
SELECT
  'rbc_' || substr(md5("id" || ':review'), 1, 24),
  "id",
  'review',
  'Review',
  'Needs QA, product, or engineering confirmation.',
  'warning',
  3000,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "workspaces"
UNION ALL
SELECT
  'rbc_' || substr(md5("id" || ':done'), 1, 24),
  "id",
  'done',
  'Done',
  'Resolved and verified.',
  'success',
  4000,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "workspaces";
