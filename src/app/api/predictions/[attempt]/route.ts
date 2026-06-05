import { NextResponse, type NextRequest } from "next/server";
import { emptyAttemptScore, scorePredictions } from "@/lib/scoring";
import {
  getAllMatches,
  getPrediction,
  getUserByEmail,
  isTournamentLocked,
  listAllPredictions,
  upsertPrediction,
} from "@/lib/store";
import {
  buildKnockoutFromGroup,
  championFromFinal,
  computeGroupStandings,
  isGroupStageComplete,
} from "@/lib/bracket";
import type {
  GroupScore,
  KnockoutPick,
  PredictionDoc,
} from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { attempt: string };

function parseAttempt(value: string): number | null {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 10) return null;
  return n;
}

function emptyPrediction(email: string, attempt: number): PredictionDoc {
  return {
    _id: `${email}#${attempt}`,
    userEmail: email,
    attempt,
    status: "draft",
    groupScores: {},
    knockout: { r32: [], r16: [], qf: [], sf: [], third: null, final: null },
    champion: null,
    updatedAt: new Date(),
    completedAt: null,
  };
}

async function loadOrCreate(
  email: string,
  attempt: number,
): Promise<PredictionDoc> {
  const existing = await getPrediction(email, attempt);
  return existing ?? emptyPrediction(email, attempt);
}

async function recomputeKnockout(
  prediction: PredictionDoc,
): Promise<PredictionDoc> {
  const matches = await getAllMatches();
  const groupMatches = matches.filter((m) => m.stage === "GROUP_STAGE");
  if (!isGroupStageComplete(groupMatches, prediction.groupScores)) {
    return {
      ...prediction,
      knockout: { r32: [], r16: [], qf: [], sf: [], third: null, final: null },
      champion: null,
    };
  }
  const standings = computeGroupStandings(
    groupMatches,
    prediction.groupScores,
  );
  const knockout = buildKnockoutFromGroup(standings, prediction.knockout);
  const champion = championFromFinal(knockout.final);
  return { ...prediction, knockout, champion };
}

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<Params> },
) {
  const { attempt: rawAttempt } = await ctx.params;
  const attempt = parseAttempt(rawAttempt);
  if (attempt == null) {
    return NextResponse.json({ error: "Invalid attempt" }, { status: 400 });
  }
  const email = (
    request.nextUrl.searchParams.get("email") ?? ""
  )
    .trim()
    .toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Missing email" }, { status: 400 });
  }
  const user = await getUserByEmail(email);
  if (!user) {
    return NextResponse.json({ error: "Unknown user" }, { status: 404 });
  }
  if (attempt > user.attemptsAllowed) {
    return NextResponse.json(
      { error: "Attempt exceeds allowed quota" },
      { status: 403 },
    );
  }
  const prediction = await loadOrCreate(email, attempt);
  // Scored against the full prediction pool so unique-exact bonuses are right.
  const [matches, allPredictions] = await Promise.all([
    getAllMatches(),
    listAllPredictions(),
  ]);
  const scores = scorePredictions(matches, allPredictions);
  const score = scores.get(prediction._id) ?? emptyAttemptScore();
  return NextResponse.json({ prediction, score });
}

type PostBody =
  | {
      kind: "group";
      email: string;
      matchId: string;
      home: number;
      away: number;
    }
  | {
      kind: "knockout";
      email: string;
      matchId: string;
      home: number | null;
      away: number | null;
      penaltyWinner?: "home" | "away" | null;
    };

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<Params> },
) {
  const { attempt: rawAttempt } = await ctx.params;
  const attempt = parseAttempt(rawAttempt);
  if (attempt == null) {
    return NextResponse.json({ error: "Invalid attempt" }, { status: 400 });
  }
  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const email = (body.email ?? "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Missing email" }, { status: 400 });
  }
  const user = await getUserByEmail(email);
  if (!user) {
    return NextResponse.json({ error: "Unknown user" }, { status: 404 });
  }
  if (attempt > user.attemptsAllowed) {
    return NextResponse.json(
      { error: "Attempt exceeds allowed quota" },
      { status: 403 },
    );
  }
  if (await isTournamentLocked()) {
    return NextResponse.json({ error: "Tournament locked" }, { status: 423 });
  }

  let prediction = await loadOrCreate(email, attempt);
  if (prediction.status === "locked") {
    return NextResponse.json({ error: "Prediction locked" }, { status: 423 });
  }

  if (body.kind === "group") {
    const home = Number(body.home);
    const away = Number(body.away);
    if (
      !Number.isInteger(home) ||
      !Number.isInteger(away) ||
      home < 0 ||
      away < 0 ||
      home > 20 ||
      away > 20
    ) {
      return NextResponse.json({ error: "Invalid score" }, { status: 400 });
    }
    const next: GroupScore = { home, away };
    prediction = {
      ...prediction,
      groupScores: { ...prediction.groupScores, [body.matchId]: next },
    };
  } else if (body.kind === "knockout") {
    const home = body.home == null ? null : Number(body.home);
    const away = body.away == null ? null : Number(body.away);
    if (
      home != null &&
      (!Number.isInteger(home) || home < 0 || home > 20)
    ) {
      return NextResponse.json({ error: "Invalid score" }, { status: 400 });
    }
    if (
      away != null &&
      (!Number.isInteger(away) || away < 0 || away > 20)
    ) {
      return NextResponse.json({ error: "Invalid score" }, { status: 400 });
    }
    const nextKnockout: PredictionDoc["knockout"] = {
      r32: [...prediction.knockout.r32],
      r16: [...prediction.knockout.r16],
      qf: [...prediction.knockout.qf],
      sf: [...prediction.knockout.sf],
      third: prediction.knockout.third,
      final: prediction.knockout.final,
    };
    const penaltyWinner = body.penaltyWinner ?? null;
    const arrayStages: Array<"r32" | "r16" | "qf" | "sf"> = [
      "r32",
      "r16",
      "qf",
      "sf",
    ];
    let found = false;
    for (const stage of arrayStages) {
      const arr = nextKnockout[stage];
      const idx = arr.findIndex((p) => p.matchId === body.matchId);
      if (idx >= 0) {
        arr[idx] = { ...arr[idx], home, away, penaltyWinner };
        found = true;
        break;
      }
    }
    if (!found && nextKnockout.third?.matchId === body.matchId) {
      nextKnockout.third = {
        ...nextKnockout.third,
        home,
        away,
        penaltyWinner,
      };
      found = true;
    }
    if (!found && nextKnockout.final?.matchId === body.matchId) {
      nextKnockout.final = {
        ...nextKnockout.final,
        home,
        away,
        penaltyWinner,
      };
      found = true;
    }
    if (!found) {
      return NextResponse.json(
        { error: "Unknown knockout match" },
        { status: 404 },
      );
    }
    prediction = { ...prediction, knockout: nextKnockout };
  } else {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }

  prediction = await recomputeKnockout(prediction);
  prediction.updatedAt = new Date();
  await upsertPrediction(prediction);
  return NextResponse.json({ prediction });
}
