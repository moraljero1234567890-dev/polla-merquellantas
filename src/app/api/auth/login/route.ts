import { NextResponse } from "next/server";
import { canonicalNit, findUserByNit, refreshMatchScores } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { nit?: string; cedula?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // The cédula/NIT is both the username and the password. The verification
  // digit (after a hyphen) is ignored so "800130426-3" and "800130426" match.
  const nit = canonicalNit(body.nit ?? body.cedula ?? "");
  const password = canonicalNit(body.password ?? "");
  if (nit.length < 6) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 400 });
  }
  // Password must match the cédula/NIT.
  if (password !== nit) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  try {
    const user = await findUserByNit(nit);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 401 });
    }
    // A successful login is our cue to pull the latest results from Wikipedia
    // so points are current. It's throttled (≤1 fetch/min) and never throws,
    // so it adds no meaningful latency on most logins and can't break sign-in.
    const refresh = await refreshMatchScores();
    if (refresh.refreshed && refresh.unmatched) {
      // Group fixtures that didn't bridge by team identity → the stored team
      // codes and Wikipedia's differ for those teams. Surface it in the logs
      // instead of silently leaving those matches unscored.
      console.warn(
        `refreshMatchScores: ${refresh.unmatched} Wikipedia match(es) did ` +
          `not map to a stored group fixture (updated=${refresh.updated}, ` +
          `inserted=${refresh.inserted}). Check team-code mapping.`,
      );
    }
    return NextResponse.json({
      user: {
        email: user.email,
        nit: user.nit,
        name: user.name,
        attemptsAllowed: user.attemptsAllowed,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Database error";
    console.error("Login DB error:", err);
    return NextResponse.json(
      { error: "Database error", detail: msg },
      { status: 500 },
    );
  }
}
