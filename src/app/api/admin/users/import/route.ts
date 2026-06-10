import { NextResponse, type NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { isAdminRequest } from "@/lib/admin-auth";
import { bulkUpsertUsers, type BulkUserInput } from "@/lib/store";

export const dynamic = "force-dynamic";

// Normalizes a header cell so we can match regardless of accents/casing.
function norm(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

// Maps the expected columns to the keys we care about.
function classifyHeader(h: string): keyof BulkUserInput | "ignore" | null {
  const n = norm(h);
  if (!n) return null;
  if (n.includes("cedula") || n.includes("nit")) return "cedula";
  if (n.includes("etiqueta") || n === "nombre" || n.includes("nombre"))
    return "name";
  if (n.includes("acceso")) return "attemptsAllowed";
  if (n.includes("vendedor")) return "seller";
  if (n.includes("venta")) return "ignore";
  return "ignore";
}

export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let file: File | null = null;
  try {
    const form = await request.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  }
  if (!file) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  let rows: unknown[][];
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) {
      return NextResponse.json(
        { error: "El archivo no tiene hojas." },
        { status: 400 },
      );
    }
    rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      blankrows: false,
      defval: "",
    });
  } catch {
    return NextResponse.json(
      { error: "No pudimos leer el archivo. ¿Es un .xlsx válido?" },
      { status: 400 },
    );
  }

  if (rows.length < 2) {
    return NextResponse.json(
      { error: "El archivo no tiene filas de datos." },
      { status: 400 },
    );
  }

  // First row = headers. Map each column index to a field.
  const header = rows[0];
  const colMap = new Map<number, keyof BulkUserInput | "ignore">();
  header.forEach((cell, idx) => {
    const kind = classifyHeader(String(cell));
    if (kind && kind !== null) colMap.set(idx, kind);
  });

  // Require at least a cédula column.
  const hasCedula = Array.from(colMap.values()).includes("cedula");
  if (!hasCedula) {
    return NextResponse.json(
      {
        error:
          "No encontramos la columna CEDULA/NIT en la primera fila del archivo.",
      },
      { status: 400 },
    );
  }

  const parsed: BulkUserInput[] = [];
  let skipped = 0;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    let cedulaRaw = "";
    let name = "";
    let seller = "";
    let accesos = 1;
    colMap.forEach((kind, idx) => {
      const value = row[idx];
      if (kind === "cedula") cedulaRaw = String(value ?? "").trim();
      else if (kind === "name") name = String(value ?? "").trim();
      else if (kind === "seller") seller = String(value ?? "").trim();
      else if (kind === "attemptsAllowed") {
        const n = Math.floor(Number(String(value ?? "").replace(/[^\d.-]/g, "")));
        if (Number.isFinite(n) && n > 0) accesos = n;
      }
    });
    const nit = cedulaRaw.replace(/\D/g, "");
    if (nit.length < 6) {
      skipped++;
      continue;
    }
    parsed.push({
      nit,
      cedula: cedulaRaw || undefined,
      name: name || cedulaRaw,
      seller: seller || undefined,
      attemptsAllowed: accesos,
    });
  }

  if (parsed.length === 0) {
    return NextResponse.json(
      { error: "Ninguna fila tenía una cédula/NIT válida." },
      { status: 400 },
    );
  }

  try {
    const { count, created, updated } = await bulkUpsertUsers(parsed);
    return NextResponse.json({ imported: count, created, updated, skipped });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Database error";
    return NextResponse.json(
      { error: "Database error", detail: msg },
      { status: 500 },
    );
  }
}
