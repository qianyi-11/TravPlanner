import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { newId } from "@/lib/server/ids";
import { recommendPlaceCount } from "@/lib/utils";
import type { TransportMode } from "@/lib/types";

export async function POST(req: Request) {
  const body = await req.json();
  const {
    groupId,
    name,
    destinations,
    startDate,
    endDate,
    budgetTotal,
    groupSize,
    dailyStart,
    dailyEnd,
    transport,
  } = body as {
    groupId: string;
    name: string;
    destinations: string[];
    startDate: string;
    endDate: string;
    budgetTotal: number;
    groupSize: number;
    dailyStart: string;
    dailyEnd: string;
    transport: TransportMode;
  };

  if (!groupId || !startDate || !endDate) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  const { count } = recommendPlaceCount({ startDate, endDate, dailyStart, dailyEnd });

  const id = newId("trip");
  await prisma.trip.create({
    data: {
      id,
      groupId,
      name: name?.trim() || "Untitled trip",
      destinationsJson: JSON.stringify(destinations ?? []),
      coverColor: "linear-gradient(135deg,#4C7BD9,#0E7C74)",
      startDate,
      endDate,
      budgetTotal,
      groupSize,
      dailyStart,
      dailyEnd,
      transport,
      stage: "preferences",
      recommendedPlaceCount: count,
      votesPerMember: 10,
      pricePressureJson: JSON.stringify({
        level: "LOW",
        reasons: ["Visit date is well in advance"],
        recommendation: "No rush yet",
      }),
    },
  });

  return NextResponse.json({ id });
}
