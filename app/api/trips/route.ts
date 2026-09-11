import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { newId } from "@/lib/server/ids";
import { recommendPlaceCount } from "@/lib/utils";
import { apiErrorResponse, ApiError } from "@/lib/server/api-error";
import { parseCreateTripInput, parseJsonObject } from "@/lib/server/validation";

export async function POST(req: Request) {
  try {
    const input = parseCreateTripInput(await parseJsonObject(req));
    const group = await prisma.group.findUnique({ where: { id: input.groupId } });
    if (!group) throw new ApiError(404, "GROUP_NOT_FOUND", "Group not found");
    const { count } = recommendPlaceCount(input);
    const id = newId("trip");
    await prisma.trip.create({
      data: {
        id,
        groupId: input.groupId,
        name: input.name || input.destinations.join(" & "),
        destinationsJson: JSON.stringify(input.destinations),
        coverColor: "linear-gradient(135deg,#4C7BD9,#0E7C74)",
        startDate: input.startDate,
        endDate: input.endDate,
        budgetTotal: input.budgetTotal,
        groupSize: input.groupSize,
        dailyStart: input.dailyStart,
        dailyEnd: input.dailyEnd,
        transport: input.transport,
        stage: "ideas",
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
  } catch (error) {
    return apiErrorResponse(error);
  }
}
