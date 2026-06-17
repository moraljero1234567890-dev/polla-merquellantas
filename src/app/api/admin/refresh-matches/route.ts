import { NextResponse, type NextRequest } from "next/server";
import { matchesCollection } from "@/lib/mongodb";
import { fetchLatestFromConfiguredProvider } from "@/lib/providers";
import { refreshMatchScores } from "@/lib/store";

export const dynamic = "force-dynamic";

function authorized(request: NextRequest): boolean {
  const bearer = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  // Vercel Cron automatically sends `Authorization: Bearer <CRON_SECRET>`.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && bearer === cronSecret) return true;

  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return false;
  const got = bearer ?? request.nextUrl.searchParams.get("token") ?? "";
  return got === expected;
}

// Score-only refresh: updates existing fixtures in place (no upsert) and
// reports how many provider rows mapped to stored matches. Use this to verify
// the live-results pipeline that login triggers — if `updated` is 0 while
// `unmatched` is high, the stored and provider _id schemes don't line up.
async function handleScoreRefresh(): Promise<Response> {
  const result = await refreshMatchScores({ force: true });
  const status = result.skipped === "error" ? 502 : 200;
  return NextResponse.json(result, { status });
}

async function handleRefresh(): Promise<Response> {
  let provider;
  try {
    provider = await fetchLatestFromConfiguredProvider();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Provider error" },
      { status: 502 },
    );
  }

  if (!provider.docs.length) {
    return NextResponse.json(
      {
        source: provider.source,
        upserts: 0,
        warning: "Provider returned 0 matches",
      },
      { status: 200 },
    );
  }

  const col = await matchesCollection();
  let upserts = 0;
  for (const d of provider.docs) {
    await col.replaceOne({ _id: d._id }, d, { upsert: true });
    upserts++;
  }
  await col.createIndex({ utcDate: 1 });
  await col.createIndex({ stage: 1, group: 1, matchday: 1 });

  return NextResponse.json({ source: provider.source, upserts });
}

function dispatch(request: NextRequest): Promise<Response> {
  // ?mode=scores → safe in-place score update (what login runs).
  // default     → full upsert/re-seed from the provider.
  return request.nextUrl.searchParams.get("mode") === "scores"
    ? handleScoreRefresh()
    : handleRefresh();
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return dispatch(request);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return dispatch(request);
}
