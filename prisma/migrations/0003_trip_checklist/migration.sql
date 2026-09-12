-- CreateTable
CREATE TABLE "TripChecklistItem" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "assignedMemberId" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TripChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TripChecklistItem_tripId_idx" ON "TripChecklistItem"("tripId");
CREATE INDEX "TripChecklistItem_assignedMemberId_idx" ON "TripChecklistItem"("assignedMemberId");

-- AddForeignKey
ALTER TABLE "TripChecklistItem" ADD CONSTRAINT "TripChecklistItem_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TripChecklistItem" ADD CONSTRAINT "TripChecklistItem_assignedMemberId_fkey" FOREIGN KEY ("assignedMemberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
