"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { writeSession } from "@/lib/session";

const HERO_IMAGE =
  "https://media.cnn.com/api/v1/images/stellar/prod/221219105607-messi-crowd-world-cup-121822.jpg?q=w_3000,c_fill";

const MERQUE_LOGO = "/logos/merquellantas.png";

export default function LoginPage() {
  const router = useRouter();
  const [cedula, setCedula] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const cleanCedula = cedula.replace(/\D/g, "");

    if (cleanCedula.length < 6) {
      setError("Ingresa tu cédula/NIT (al menos 6 dígitos).");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The cédula/NIT is the only credential (it doubles as the password).
        body: JSON.stringify({ nit: cleanCedula, password: cleanCedula }),
      });
      if (!res.ok) {
        setError(
          "No encontramos una cuenta con esa cédula/NIT. Pregúntale a tu asesor Merquellantas.",
        );
        setSubmitting(false);
        return;
      }
      const data = (await res.json()) as {
        user: {
          email: string;
          nit: string;
          name: string;
          attemptsAllowed: number;
        };
      };
      writeSession(data.user);
      router.push("/dashboard");
    } catch {
      setError("No pudimos validar tu sesión. Intenta de nuevo.");
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
      {/* Visual panel */}
      <aside className="relative isolate hidden overflow-hidden bg-[var(--foreground)] text-white lg:block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={HERO_IMAGE}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 -z-10 h-full w-full object-cover opacity-50"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-gradient-to-b from-[var(--foreground)]/65 via-[var(--foreground)]/55 to-[var(--foreground)]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_bottom_left,rgba(255,153,0,0.3),transparent_55%)]"
        />
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full text-white/15"
          preserveAspectRatio="xMidYMid slice"
          viewBox="0 0 1600 900"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <line x1="800" y1="0" x2="800" y2="900" />
          <circle cx="800" cy="450" r="120" />
          <circle cx="800" cy="450" r="3" fill="currentColor" stroke="none" />
          <rect x="0" y="280" width="160" height="340" />
          <rect x="1440" y="280" width="160" height="340" />
        </svg>

        <div className="relative flex h-full flex-col justify-between p-10">
          <Link href="/" className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={MERQUE_LOGO}
              alt="Merquellantas"
              className="h-8 w-auto brightness-0 invert"
            />
            <span className="h-6 w-px bg-white/30" />
            <span className="text-sm font-semibold tracking-wide">
              Polla Mundialista
            </span>
          </Link>

          <div className="max-w-md">
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--brand)]">
              Acceso · Edición Mundial 2026
            </p>
            <h2 className="mt-5 text-4xl font-black uppercase leading-[0.95] tracking-tight md:text-5xl">
              Entra a tu
              <br />
              <span className="text-[var(--brand)]">boleta</span> de
              pronósticos.
            </h2>
            <p className="mt-5 text-white/75">
              Ingresa con tu cédula o NIT registrado con tu asesor
              Merquellantas. Tu contraseña es la misma cédula/NIT. Si no
              recuerdas tus datos, tu asesor puede entregártelos de nuevo.
            </p>
          </div>

          <div className="inline-flex w-fit items-center gap-3 border border-white/15 bg-black/30 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.28em] text-white/70 backdrop-blur">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--brand)]" />
            FIFA World Cup · 2026
          </div>
        </div>
      </aside>

      {/* Form panel */}
      <main className="flex flex-col bg-[var(--background)]">
        <header className="flex items-center justify-between border-b border-[var(--line)] px-6 py-4 lg:hidden">
          <Link href="/" className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={MERQUE_LOGO} alt="Merquellantas" className="h-8 w-auto" />
            <span className="text-sm font-semibold">Polla Mundialista</span>
          </Link>
          <Link
            href="/"
            className="text-sm font-medium text-[var(--foreground-soft)] hover:text-[var(--brand)]"
          >
            Volver
          </Link>
        </header>

        <div className="flex flex-1 items-center justify-center px-6 py-16 lg:px-16">
          <div className="w-full max-w-md">
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--brand)]">
              Acceso de participantes
            </p>
            <h1 className="mt-3 text-3xl font-black leading-tight md:text-4xl">
              Ingresa a la Polla Mundialista
            </h1>
            <p className="mt-3 text-[var(--foreground-soft)]">
              Juego promocional <strong>gratuito</strong> de Merquellantas para
              sus clientes. Solo necesitas el número de cédula/NIT con el que tu
              asesor te inscribió.
            </p>

            <div className="mt-5 rounded-sm border border-emerald-600/40 bg-emerald-50 p-4 text-sm text-emerald-900">
              <p className="font-semibold">Este sitio es seguro</p>
              <p className="mt-1 leading-relaxed">
                Portal oficial de Merquellantas.{" "}
                <strong>
                  Nunca pedimos contraseñas bancarias, datos de tarjetas ni
                  pagos
                </strong>
                . Tu cédula/NIT solo se usa para identificarte dentro del juego.
              </p>
            </div>

            <form
              onSubmit={handleSubmit}
              className="mt-8 space-y-5"
              noValidate
            >
              <div>
                <label
                  htmlFor="cedula"
                  className="flex items-baseline justify-between font-mono text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--foreground-muted)]"
                >
                  <span>Número de cédula / NIT</span>
                  <span className="text-[10px] tracking-[0.2em]">
                    para participar
                  </span>
                </label>
                <input
                  id="cedula"
                  name="cedula"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  required
                  value={cedula}
                  onChange={(e) =>
                    setCedula(e.target.value.replace(/[^0-9-]/g, ""))
                  }
                  placeholder="Ej. 800130426"
                  className="mt-2 h-12 w-full border border-[var(--line)] bg-white px-4 font-mono text-base tabular-nums text-[var(--foreground)] outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20"
                />
                <p className="mt-2 text-xs text-[var(--foreground-muted)]">
                  Ese mismo número es tu acceso. No se requiere contraseña
                  aparte.
                </p>
              </div>

              {error && (
                <div
                  role="alert"
                  className="border-l-4 border-[var(--brand)] bg-[var(--brand-soft)] px-4 py-3 text-sm text-[var(--brand-dark)]"
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex h-12 w-full items-center justify-center rounded-sm bg-[var(--brand)] px-6 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-[var(--brand-dark)] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {submitting ? "Entrando…" : "Entrar al juego"}
              </button>
            </form>

            <div className="mt-6 text-sm text-[var(--foreground-soft)]">
              <p className="font-semibold text-[var(--foreground)]">
                ¿No tienes acceso?
              </p>
              <p className="mt-1">
                La Polla Mundialista es por invitación. Pregúntale a tu asesor
                Merquellantas si ya cumples con los requisitos.{" "}
                <Link
                  href="/#asesor"
                  className="font-semibold text-[var(--brand)] underline-offset-4 hover:underline"
                >
                  Ver más
                </Link>
              </p>
            </div>

            <p className="mt-6 border-t border-[var(--line)] pt-4 text-xs text-[var(--foreground-muted)]">
              © {new Date().getFullYear()} Merquellantas ·{" "}
              <a
                href="https://www.merquellantas.com"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[var(--brand)]"
              >
                merquellantas.com
              </a>{" "}
              ·{" "}
              <Link href="/terminos" className="hover:text-[var(--brand)]">
                Términos y privacidad
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
