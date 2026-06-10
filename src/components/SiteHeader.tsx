"use client";

import Link from "next/link";
import { useState } from "react";

const MERQUE_LOGO = "/logos/merquellantas.png";

const navLinks = [
  { href: "#participar", label: "Cómo participar" },
  { href: "#puntuacion", label: "Puntuación" },
  { href: "#asesor", label: "Habla con tu asesor" },
];

export default function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[var(--background)]/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="flex items-center gap-3"
          onClick={() => setOpen(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={MERQUE_LOGO} alt="Merquellantas" className="h-9 w-auto" />
          <span className="hidden h-6 w-px bg-[var(--line)] sm:block" />
          <span className="hidden text-sm font-semibold tracking-wide sm:inline">
            Polla Mundialista
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden gap-8 text-sm font-medium text-[var(--foreground-soft)] md:flex">
          {navLinks.map((link) => (
            <a key={link.href} href={link.href} className="hover:text-[var(--brand)]">
              {link.label}
            </a>
          ))}
        </nav>

        {/* Desktop actions */}
        <div className="hidden items-center gap-3 md:flex">
          <Link
            href="/login"
            className="text-sm font-semibold text-[var(--foreground)] hover:text-[var(--brand)]"
          >
            Iniciar sesión
          </Link>
          <a
            href="#asesor"
            className="rounded-sm bg-[var(--brand)] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-dark)]"
          >
            Quiero participar
          </a>
        </div>

        {/* Mobile actions: always-visible login + hamburger */}
        <div className="flex items-center gap-2 md:hidden">
          <Link
            href="/login"
            className="rounded-sm border border-[var(--line)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--brand)] hover:text-[var(--brand)]"
          >
            Iniciar sesión
          </Link>
          <button
            type="button"
            aria-label={open ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-sm border border-[var(--line)] text-[var(--foreground)] transition hover:border-[var(--brand)] hover:text-[var(--brand)]"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              {open ? (
                <>
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="18" y1="6" x2="6" y2="18" />
                </>
              ) : (
                <>
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile dropdown panel */}
      {open && (
        <nav
          id="mobile-menu"
          className="border-t border-[var(--line)] bg-[var(--background)] md:hidden"
        >
          <div className="mx-auto flex max-w-6xl flex-col gap-1 px-6 py-4">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-sm px-2 py-3 text-base font-medium text-[var(--foreground-soft)] transition hover:bg-[var(--surface)] hover:text-[var(--brand)]"
              >
                {link.label}
              </a>
            ))}
            <div className="mt-2 flex flex-col gap-2 border-t border-[var(--line)] pt-4">
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="inline-flex h-11 items-center justify-center rounded-sm border border-[var(--line)] text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--brand)] hover:text-[var(--brand)]"
              >
                Iniciar sesión
              </Link>
              <a
                href="#asesor"
                onClick={() => setOpen(false)}
                className="inline-flex h-11 items-center justify-center rounded-sm bg-[var(--brand)] text-sm font-semibold text-white transition hover:bg-[var(--brand-dark)]"
              >
                Quiero participar
              </a>
            </div>
          </div>
        </nav>
      )}
    </header>
  );
}
