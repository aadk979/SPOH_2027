-- The CloudWatch audit copy's cursor (P08.8, P15.7). The app advances it in the same
-- transaction as the scheduled action that delivered the batch.
CREATE TABLE "AuditShipment" (
    "logGroup" TEXT NOT NULL,
    "lastCreatedAt" TIMESTAMPTZ(3) NOT NULL,
    "lastId" TEXT NOT NULL,
    "shipped" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AuditShipment_pkey" PRIMARY KEY ("logGroup")
);

-- Paging the audit trail in shipping order.
CREATE INDEX "AuditLog_createdAt_id_idx" ON "AuditLog"("createdAt", "id");
