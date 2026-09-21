CREATE TYPE "AttendanceMethod" AS ENUM ('ROOT', 'QR', 'PIN');

CREATE TABLE "Attendance" (
  "id" TEXT NOT NULL,
  "volunteerId" TEXT NOT NULL,
  "eventDayId" TEXT NOT NULL,
  "verifiedById" TEXT,
  "method" "AttendanceMethod" NOT NULL,
  "presentAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Attendance_volunteerId_eventDayId_key" ON "Attendance"("volunteerId", "eventDayId");
CREATE INDEX "Attendance_eventDayId_presentAt_idx" ON "Attendance"("eventDayId", "presentAt");
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_volunteerId_fkey" FOREIGN KEY ("volunteerId") REFERENCES "Volunteer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "Volunteer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_eventDayId_fkey" FOREIGN KEY ("eventDayId") REFERENCES "EventDay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "AttendanceChallenge" (
  "id" TEXT NOT NULL,
  "issuerId" TEXT NOT NULL,
  "eventDayId" TEXT NOT NULL,
  "pinHash" TEXT NOT NULL,
  "campusNetwork" BOOLEAN NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "AttendanceChallenge_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AttendanceChallenge_pinHash_key" ON "AttendanceChallenge"("pinHash");
CREATE UNIQUE INDEX "AttendanceChallenge_issuerId_eventDayId_key" ON "AttendanceChallenge"("issuerId", "eventDayId");
CREATE INDEX "AttendanceChallenge_expiresAt_idx" ON "AttendanceChallenge"("expiresAt");
ALTER TABLE "AttendanceChallenge" ADD CONSTRAINT "AttendanceChallenge_issuerId_fkey" FOREIGN KEY ("issuerId") REFERENCES "Volunteer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceChallenge" ADD CONSTRAINT "AttendanceChallenge_eventDayId_fkey" FOREIGN KEY ("eventDayId") REFERENCES "EventDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AttendanceAttempt" (
  "volunteerId" TEXT NOT NULL,
  "windowStart" TIMESTAMPTZ(3) NOT NULL,
  "attempts" INTEGER NOT NULL,
  CONSTRAINT "AttendanceAttempt_pkey" PRIMARY KEY ("volunteerId")
);
ALTER TABLE "AttendanceAttempt" ADD CONSTRAINT "AttendanceAttempt_volunteerId_fkey" FOREIGN KEY ("volunteerId") REFERENCES "Volunteer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
