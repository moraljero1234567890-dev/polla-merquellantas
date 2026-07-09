import { NextResponse, type NextRequest } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { computeLeaderboard, POINTS } from "@/lib/scoring";
import { patchKnockoutWithRealFixtures } from "@/lib/bracket";
import {
  getAllMatches,
  listAllPredictions,
  listAllUsers,
} from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const [matches, predictions, users] = await Promise.all([
      getAllMatches(),
      listAllPredictions(),
      listAllUsers(),
    ]);
    const knockoutMatches = matches.filter((m) => m.stage !== "GROUP_STAGE");
    const patchedPredictions = predictions.map((p) => ({
      ...p,
      knockout: patchKnockoutWithRealFixtures(p.knockout, knockoutMatches),
    }));
    const rows = computeLeaderboard(
      matches,
      patchedPredictions,
      users.map((u) => ({
        email: u.email,
        name: u.name,
        attemptsAllowed: u.attemptsAllowed,
      })),
    );
    const finishedGroup = matches.filter(
      (m) => m.stage === "GROUP_STAGE" && m.status === "FINISHED",
    ).length;
    const finishedKnockout = matches.filter(
      (m) => m.stage !== "GROUP_STAGE" && m.status === "FINISHED",
    ).length;
    return NextResponse.json({
      rows,
      stats: {
        totalUsers: users.length,
        totalPredictions: predictions.length,
        finishedGroupMatches: finishedGroup,
        finishedKnockoutMatches: finishedKnockout,
      },
      points: POINTS,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Database error";
    return NextResponse.json(
      { error: "Database error", detail: msg },
      { status: 500 },
    );
  }
}
