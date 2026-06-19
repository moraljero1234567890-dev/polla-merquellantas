import { NextResponse, type NextRequest } from "next/server";
import { computeLeaderboard } from "@/lib/scoring";
import {
  getAllMatches,
  getUserByEmail,
  listAllPredictions,
  listAllUsers,
} from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Public (participant-facing) leaderboard. Returns only the position, display
 * name and points of each boleta — never a cédula/NIT or email, which are
 * sensitive. Gated to known users so the participant list isn't scrapable by
 * anonymous traffic; `isYou` lets the caller highlight their own rows without
 * exposing anyone else's identity.
 */
export async function GET(request: NextRequest) {
  const email = (request.nextUrl.searchParams.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Missing email" }, { status: 400 });
  }
  const requester = await getUserByEmail(email);
  if (!requester) {
    return NextResponse.json({ error: "Unknown user" }, { status: 401 });
  }

  try {
    const [matches, predictions, users] = await Promise.all([
      getAllMatches(),
      listAllPredictions(),
      listAllUsers(),
    ]);
    const ranked = computeLeaderboard(
      matches,
      predictions,
      users.map((u) => ({
        email: u.email,
        name: u.name,
        attemptsAllowed: u.attemptsAllowed,
      })),
    );

    // Standard competition ranking: equal points share a position.
    let lastPoints: number | null = null;
    let lastRank = 0;
    const rows = ranked.map((r, i) => {
      const points = r.breakdown.total;
      const rank = points === lastPoints ? lastRank : i + 1;
      lastPoints = points;
      lastRank = rank;
      return {
        rank,
        name: r.name,
        attempt: r.attempt,
        totalAttempts: r.totalAttempts,
        points,
        isYou: r.email === email,
      };
    });

    return NextResponse.json({ rows, total: rows.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Database error";
    return NextResponse.json(
      { error: "Database error", detail: msg },
      { status: 500 },
    );
  }
}
