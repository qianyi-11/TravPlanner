import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { ApiError, apiErrorResponse } from "@/lib/server/api-error";
import { requireCompetitionDemoSafe, requireTripOrganizer } from "@/lib/server/authorization";
import { parseJsonObject, requireId } from "@/lib/server/validation";
import { isValidDateRange, isValidDateString, isValidDayWindow, isValidTimeString } from "@/lib/date-time";
import { TRANSPORT_MODES, type TransportMode } from "@/lib/types";
import { computeBookingPressure } from "@/lib/booking-pressure";

const ALLOWED_FIELDS = new Set(["name", "startDate", "endDate", "budgetTotal", "dailyStart", "dailyEnd", "transport"]);
const PLANNING_FIELDS = ["startDate", "endDate", "dailyStart", "dailyEnd", "transport"] as const;

export async function PATCH(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const tripId = requireId((await params).tripId, "tripId");
    const actor = await requireTripOrganizer(tripId);
    const { trip } = actor;
    requireCompetitionDemoSafe(actor.memberId);
    const body = await parseJsonObject(request);
    const fields = Object.keys(body);
    if (!fields.length || fields.some((field) => !ALLOWED_FIELDS.has(field))) {
      throw new ApiError(400, "INVALID_REQUEST", "Request contains unsupported trip fields");
    }

    const data: {
      name?: string;
      startDate?: string;
      endDate?: string;
      budgetTotal?: number;
      dailyStart?: string;
      dailyEnd?: string;
      transport?: string;
      pricePressureJson?: string;
    } = {};
    if (body.name !== undefined) {
      if (typeof body.name !== "string") throw new ApiError(400, "INVALID_TRIP_NAME", "name must be a string");
      const name = body.name.trim();
      if (!name || name.length > 120) throw new ApiError(400, "INVALID_TRIP_NAME", "name must be 1 to 120 characters");
      data.name = name;
    }

    for (const field of ["startDate", "endDate"] as const) {
      if (body[field] !== undefined) {
        if (!isValidDateString(body[field])) throw new ApiError(400, "INVALID_DATE", `${field} must be a real date in YYYY-MM-DD format`);
        data[field] = body[field];
      }
    }
    const startDate = (data.startDate as string | undefined) ?? trip.startDate;
    const endDate = (data.endDate as string | undefined) ?? trip.endDate;
    if (!isValidDateRange(startDate, endDate)) throw new ApiError(400, "INVALID_DATE_RANGE", "startDate must be on or before endDate");

    if (body.budgetTotal !== undefined) {
      if (typeof body.budgetTotal !== "number" || !Number.isFinite(body.budgetTotal) || !Number.isInteger(body.budgetTotal) || body.budgetTotal < 0) {
        throw new ApiError(400, "INVALID_BUDGET", "budgetTotal must be a non-negative integer");
      }
      data.budgetTotal = body.budgetTotal;
    }

    for (const field of ["dailyStart", "dailyEnd"] as const) {
      if (body[field] !== undefined) {
        if (!isValidTimeString(body[field])) throw new ApiError(400, "INVALID_TIME", `${field} must use HH:MM`);
        data[field] = body[field];
      }
    }
    const dailyStart = (data.dailyStart as string | undefined) ?? trip.dailyStart;
    const dailyEnd = (data.dailyEnd as string | undefined) ?? trip.dailyEnd;
    if (!isValidDayWindow(dailyStart, dailyEnd)) throw new ApiError(400, "INVALID_DAY_WINDOW", "dailyStart must be before dailyEnd");

    if (body.transport !== undefined) {
      if (typeof body.transport !== "string" || !TRANSPORT_MODES.includes(body.transport as TransportMode)) {
        throw new ApiError(400, "INVALID_TRANSPORT", "transport is invalid");
      }
      data.transport = body.transport;
    }

    const planningChanged = PLANNING_FIELDS.some((field) => data[field] !== undefined && data[field] !== trip[field]);
    if (planningChanged && (JSON.parse(trip.itineraryJson) as unknown[]).length) {
      throw new ApiError(409, "TRIP_REPLAN_REQUIRED", "Clear or explicitly replan the itinerary before changing schedule or transport");
    }
    if (data.startDate !== undefined && data.startDate !== trip.startDate) {
      data.pricePressureJson = JSON.stringify(computeBookingPressure(data.startDate));
    }

    const updated = await prisma.trip.update({ where: { id: tripId }, data });
    return NextResponse.json({ ok: true, trip: updated });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const tripId = requireId((await params).tripId, "tripId");
    const actor = await requireTripOrganizer(tripId);
    requireCompetitionDemoSafe(actor.memberId);

    // Cascades away its TripPlaces (and their Suggestions/Votes) and RescueEvents.
    await prisma.trip.delete({ where: { id: tripId } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
