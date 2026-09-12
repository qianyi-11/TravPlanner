import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import type { TransportMode } from "@/lib/types";
import { daysBetween } from "@/lib/utils";

interface TripUpdateBody {
  name?: string;
  startDate?: string;
  endDate?: string;
  budgetTotal?: number;
  dailyStart?: string;
  dailyEnd?: string;
  transport?: TransportMode;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const body = (await req.json()) as TripUpdateBody;

  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });

  const data: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const trimmed = body.name.trim();
    if (!trimmed) return NextResponse.json({ error: "Trip name can't be empty" }, { status: 400 });
    data.name = trimmed;
  }

  const startDate = body.startDate ?? trip.startDate;
  const endDate = body.endDate ?? trip.endDate;
  if (body.startDate !== undefined || body.endDate !== undefined) {
    if (daysBetween(startDate, endDate) < 1) {
      return NextResponse.json({ error: "End date must be on or after the start date" }, { status: 400 });
    }
    data.startDate = startDate;
    data.endDate = endDate;
  }

  if (body.budgetTotal !== undefined) {
    if (!Number.isFinite(body.budgetTotal) || body.budgetTotal < 0) {
      return NextResponse.json({ error: "Budget must be a positive number" }, { status: 400 });
    }
    data.budgetTotal = Math.round(body.budgetTotal);
  }

  if (body.dailyStart !== undefined) data.dailyStart = body.dailyStart;
  if (body.dailyEnd !== undefined) data.dailyEnd = body.dailyEnd;
  if (body.transport !== undefined) data.transport = body.transport;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  await prisma.trip.update({ where: { id: tripId }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;

  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });

  // Cascades away its TripPlaces (and their Suggestions/Votes) and RescueEvents.
  await prisma.trip.delete({ where: { id: tripId } });

  return NextResponse.json({ ok: true });
}
