import Link from "next/link";

const MERQUE_LOGO = "/logos/merquellantas.png";

export const metadata = {
  title: "Términos y Privacidad · Polla Mundialista Merquellantas",
  description:
    "Términos, condiciones y aviso de privacidad de la Polla Mundialista, el juego promocional gratuito de Merquellantas para sus clientes.",
};

export default function TerminosPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)] text-[var(--foreground)]">
      <header className="border-b border-[var(--line)] bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={MERQUE_LOGO} alt="Merquellantas" className="h-9 w-auto" />
            <span className="hidden text-sm font-semibold tracking-wide sm:inline">
              Polla Mundialista
            </span>
          </Link>
          <Link
            href="/login"
            className="text-sm font-medium text-[var(--foreground-soft)] hover:text-[var(--brand)]"
          >
            Ingresar
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--brand)]">
          Información legal
        </p>
        <h1 className="mt-3 text-3xl font-black uppercase leading-tight md:text-4xl">
          Términos y privacidad
        </h1>

        <div className="mt-8 space-y-8 text-[var(--foreground-soft)]">
          <section>
            <h2 className="text-lg font-bold text-[var(--foreground)]">
              ¿Qué es la Polla Mundialista?
            </h2>
            <p className="mt-2 leading-relaxed">
              La Polla Mundialista es un juego promocional{" "}
              <strong>gratuito</strong> organizado por Merquellantas para sus
              clientes. Consiste en pronosticar los resultados de los partidos
              del Mundial de fútbol y sumar puntos. No tiene ningún costo ni
              requiere pago alguno para participar.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[var(--foreground)]">
              Cómo se accede
            </h2>
            <p className="mt-2 leading-relaxed">
              El acceso es exclusivo para clientes inscritos por su asesor
              Merquellantas. Para ingresar se utiliza únicamente el número de
              cédula o NIT del cliente, como medio de identificación dentro del
              juego.{" "}
              <strong className="text-[var(--foreground)]">
                Nunca solicitamos contraseñas bancarias, números de tarjeta,
                claves ni datos de pago.
              </strong>
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[var(--foreground)]">
              Tratamiento de datos personales
            </h2>
            <p className="mt-2 leading-relaxed">
              Los únicos datos que se manejan son el nombre y el número de
              identificación (cédula/NIT) que el cliente entregó a su asesor, y
              se usan exclusivamente para administrar su participación en el
              juego (identificar al participante y mostrar su tabla de puntos).
              No se comparten con terceros con fines comerciales ni se utilizan
              para fines distintos a esta promoción.
            </p>
            <p className="mt-2 leading-relaxed">
              Para solicitar la actualización o eliminación de tus datos,
              escribe a tu asesor Merquellantas o al correo de servicio al
              cliente.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[var(--foreground)]">
              Contacto
            </h2>
            <p className="mt-2 leading-relaxed">
              Merquellantas ·{" "}
              <a
                href="https://www.merquellantas.com"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-[var(--brand)] underline-offset-4 hover:underline"
              >
                www.merquellantas.com
              </a>
            </p>
            {/* TODO: agrega aquí el NIT, dirección y correo de contacto reales */}
          </section>
        </div>

        <div className="mt-12 border-t border-[var(--line)] pt-6">
          <Link
            href="/login"
            className="inline-flex h-11 items-center justify-center bg-[var(--brand)] px-6 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-[var(--brand-dark)]"
          >
            Volver a ingresar
          </Link>
        </div>
      </main>

      <footer className="border-t border-[var(--line)] bg-white">
        <div className="mx-auto max-w-3xl px-6 py-6 text-xs text-[var(--foreground-muted)]">
          © {new Date().getFullYear()} Merquellantas · Polla Mundialista. Juego
          promocional gratuito para clientes.
        </div>
      </footer>
    </div>
  );
}
