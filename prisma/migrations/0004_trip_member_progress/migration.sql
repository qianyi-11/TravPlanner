-- CreateTable
CREATE TABLE "TripMemberProgress" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "submittedSuggestions" BOOLEAN NOT NULL DEFAULT false,
    "submittedVotes" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TripMemberProgress_pkey" PRIMARY KEY ("id")
);

-- Preserve existing submission state while moving it to the trip scope.
INSERT INTO "TripMemberProgress" ("id", "tripId", "memberId", "submittedSuggestions", "submittedVotes", "createdAt", "updatedAt")
SELECT md5(t."id" || ':' || gm."memberId"), t."id", gm."memberId", m."hasSubmittedSuggestions", m."hasSubmittedVotes", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Trip" t
JOIN "GroupMember" gm ON gm."groupId" = t."groupId"
JOIN "Member" m ON m."id" = gm."memberId";

-- CreateIndex
CREATE UNIQUE INDEX "TripMemberProgress_tripId_memberId_key" ON "TripMemberProgress"("tripId", "memberId");
CREATE INDEX "TripMemberProgress_tripId_idx" ON "TripMemberProgress"("tripId");
CREATE INDEX "TripMemberProgress_memberId_idx" ON "TripMemberProgress"("memberId");

-- AddForeignKey
ALTER TABLE "TripMemberProgress" ADD CONSTRAINT "TripMemberProgress_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TripMemberProgress" ADD CONSTRAINT "TripMemberProgress_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
