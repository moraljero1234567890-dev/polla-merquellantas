import { NextResponse } from "next/server";
import { scorePredictions } from "@/lib/scoring";
import {
  getAllMatches,
  getUserByEmail,
  listAllPredictions,
  listPredictionsForUser,
} from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const email = (searchParams.get("email") ?? "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Missing email" }, { status: 400 });
  }
  const user = await getUserByEmail(email);
  if (!user) {
    return NextResponse.json({ error: "Unknown user" }, { status: 404 });
  }
  const [predictions, matches, allPredictions] = await Promise.all([
    listPredictionsForUser(email),
    getAllMatches(),
    listAllPredictions(),
  ]);
  // Scored against the full prediction pool so unique-exact bonuses are right.
  const scores = scorePredictions(matches, allPredictions);
  return NextResponse.json({
    user: {
      email: user.email,
      name: user.name,
      attemptsAllowed: user.attemptsAllowed,
    },
    predictions: predictions.map((p) => ({
      attempt: p.attempt,
      status: p.status,
      champion: p.champion,
      updatedAt: p.updatedAt,
      completedAt: p.completedAt,
      groupCount: Object.keys(p.groupScores ?? {}).length,
      points: scores.get(p._id)?.breakdown.total ?? 0,
    })),
  });
}
