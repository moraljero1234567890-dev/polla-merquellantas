import { NextResponse } from "next/server";
import { canonicalNit, findUserByNit } from "@/lib/store";

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
