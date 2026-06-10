import { NextResponse, type NextRequest } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import {
  getAllMatches,
  listAllPredictions,
  listAllUsers,
} from "@/lib/store";
import type { KnockoutPick } from "@/lib/types";

export const dynamic = "force-dynamic";

function knockoutFilled(k: {
  r32: KnockoutPick[];
  r16: KnockoutPick[];
  qf: KnockoutPick[];
  sf: KnockoutPick[];
  third: KnockoutPick | null;
  final: KnockoutPick | null;
}): number {
  const all = [
    ...k.r32,
    ...k.r16,
    ...k.qf,
    ...k.sf,
    ...(k.third ? [k.third] : []),
    ...(k.final ? [k.final] : []),
  ];
  return all.filter((p) => p.home != null && p.away != null).length;
}

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
    const totalGroup = matches.filter((m) => m.stage === "GROUP_STAGE").length;
    const userByEmail = new Map(users.map((u) => [u.email, u]));

    const rows = predictions
      .map((p) => {
        const u = userByEmail.get(p.userEmail);
        const groupFilled = Object.keys(p.groupScores ?? {}).length;
        return {
          email: p.userEmail,
          name: u?.name ?? "(usuario eliminado)",
          cedula: u?.cedula ?? u?.nit ?? "",
          attempt: p.attempt,
          status: p.status,
          groupFilled,
          totalGroup,
          knockoutFilled: knockoutFilled(p.knockout),
          champion: p.champion?.name ?? null,
          updatedAt: p.updatedAt,
          completedAt: p.completedAt,
        };
      })
      .sort((a, b) => {
        const ta = new Date(a.updatedAt ?? 0).getTime();
        const tb = new Date(b.updatedAt ?? 0).getTime();
        return tb - ta;
      });

    const activeUsers = new Set(predictions.map((p) => p.userEmail)).size;

    return NextResponse.json({
      rows,
      stats: {
        totalUsers: users.length,
        usersWithPredictions: activeUsers,
        totalPredictions: predictions.length,
        totalGroup,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Database error";
    return NextResponse.json(
      { error: "Database error", detail: msg },
      { status: 500 },
    );
  }
}
