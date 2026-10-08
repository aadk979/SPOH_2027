-- P11.5 prerequisite (role grants, release A): per-event role grants as data
-- (ADR-005 §2). One row per Editable action an event grants a role; nothing
-- enforces from them until P11.5 replaces the capability matrix.

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "role" "CommitteeRole" NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_eventId_role_action_key" ON "RolePermission"("eventId", "role", "action");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_eventId_id_key" ON "RolePermission"("eventId", "id");

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
