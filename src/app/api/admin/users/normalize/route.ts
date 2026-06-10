import { NextResponse, type NextRequest } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { normalizeAllCedulas } from "@/lib/store";

export const dynamic = "force-dynamic";

// One-time cleanup endpoint: removes the verification digit from every
// stored cédula/NIT and re-keys users (moving their predictions).
export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await normalizeAllCedulas();
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Database error";
    return NextResponse.json(
      { error: "Database error", detail: msg },
      { status: 500 },
    );
  }
}
