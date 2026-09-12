import { NextResponse } from "next/server";
import { apiErrorResponse, ApiError } from "@/lib/server/api-error";
import { requireTripActor } from "@/lib/server/authorization";
import { prisma } from "@/lib/server/prisma";
import { validateSplitBill, validateSplitBillRevision } from "@/lib/split-bill";
import { parseJsonObject, requireId } from "@/lib/server/validation";

export async function GET(_request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const tripId = requireId((await params).tripId, "tripId");
    await requireTripActor(tripId);
    const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId }, select: { splitBillJson: true, splitBillRevision: true } });
    let state = null;
    try {
      state = trip.splitBillJson ? validateSplitBill(JSON.parse(trip.splitBillJson)) : null;
    } catch {
      state = null;
    }
    if (trip.splitBillJson && !state) throw new ApiError(409, "INVALID_SPLIT_BILL_DATA", "Saved split bill data is invalid");
    return NextResponse.json({ ok: true, state, revision: trip.splitBillRevision });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const tripId = requireId((await params).tripId, "tripId");
    await requireTripActor(tripId);
    const body = await parseJsonObject(request);
    const expectedRevision = validateSplitBillRevision(body.expectedRevision);
    if (expectedRevision === null) throw new ApiError(400, "INVALID_SPLIT_BILL_REVISION", "expectedRevision must be a positive integer");
    const state = validateSplitBill(body.state);
    if (!state) throw new ApiError(400, "INVALID_SPLIT_BILL", "Split bill data is invalid");
    const updated = await prisma.trip.updateMany({
      where: { id: tripId, splitBillRevision: expectedRevision },
      data: { splitBillJson: JSON.stringify(state), splitBillRevision: { increment: 1 } },
    });
    if (updated.count !== 1) throw new ApiError(409, "STALE_SPLIT_BILL", "This split bill changed. Refresh before saving again.");
    return NextResponse.json({ ok: true, state, revision: expectedRevision + 1 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
