-- P09.10, contract: what happens at a station is its type's capability flags,
-- and the course it presents is a tag (ADR-002). Every station has had a type
-- since P09.4 and every writer has kept it since P09.5; the kind, course and
-- flag columns and their enum types go.
ALTER TABLE "Station" ALTER COLUMN "typeId" SET NOT NULL;
ALTER TABLE "Station" DROP COLUMN "kind";
ALTER TABLE "Station" DROP COLUMN "courseCode";
ALTER TABLE "Station" DROP COLUMN "countsEntry";
ALTER TABLE "Station" DROP COLUMN "issuesStamp";
DROP TYPE "StationKind";
DROP TYPE "CourseCode";
