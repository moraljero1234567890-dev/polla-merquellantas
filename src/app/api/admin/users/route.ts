import { NextResponse, type NextRequest } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { createUser, listAllUsers } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const users = await listAllUsers();
    return NextResponse.json({
      users: users.map((u) => ({
        email: u.email,
        nit: u.nit,
        cedula: u.cedula,
        name: u.name,
        seller: u.seller,
        attemptsAllowed: u.attemptsAllowed,
        createdAt: u.createdAt,
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Database error";
    return NextResponse.json(
      { error: "Database error", detail: msg },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: {
    email?: string;
    nit?: string;
    cedula?: string;
    name?: string;
    seller?: string;
    attemptsAllowed?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const email = (body.email ?? "").trim().toLowerCase();
  const nit = (body.nit ?? "").replace(/\D/g, "");
  const name = (body.name ?? "").trim();
  const attemptsAllowed = Number(body.attemptsAllowed);
  // Email is optional — one is synthesized from the cédula when omitted.
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }
  if (nit.length < 6) {
    return NextResponse.json(
      { error: "NIT must be at least 6 digits" },
      { status: 400 },
    );
  }
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (
    !Number.isFinite(attemptsAllowed) ||
    attemptsAllowed < 1 ||
    attemptsAllowed > 20
  ) {
    return NextResponse.json(
      { error: "attemptsAllowed must be between 1 and 20" },
      { status: 400 },
    );
  }
  try {
    const user = await createUser({
      email: email || undefined,
      nit,
      cedula: body.cedula?.trim() || undefined,
      name,
      seller: body.seller?.trim() || undefined,
      attemptsAllowed,
    });
    return NextResponse.json({
      user: {
        email: user.email,
        nit: user.nit,
        cedula: user.cedula,
        name: user.name,
        seller: user.seller,
        attemptsAllowed: user.attemptsAllowed,
        createdAt: user.createdAt,
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
