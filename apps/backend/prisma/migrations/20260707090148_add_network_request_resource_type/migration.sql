-- AlterTable
ALTER TABLE "network_request_entries" ADD COLUMN     "resourceType" TEXT;

-- AlterTable
ALTER TABLE "report_board_columns" ALTER COLUMN "updatedAt" DROP DEFAULT;
