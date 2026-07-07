import { NextResponse } from "next/server";
import { getAllMatches, refreshMatchScores } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Keep fixture data fresh on every page load (throttled to ≤1 Wikipedia
    // call/min). This ensures knockout teams appear without a re-login.
    await refreshMatchScores();
    const matches = await getAllMatches();
    return NextResponse.json({ matches, count: matches.length });
  } catch (error) {
    return NextResponse.json(
      {
        matches: [],
        count: 0,
        error: error instanceof Error ? error.message : "unknown",
      },
      { status: 500 },
    );
  }
}
