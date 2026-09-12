import PrivacyNoticeLink from '@/components/PrivacyNoticeLink'

/** Explica de forma pública y breve cómo se usan las métricas de Analytics. */
export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 text-gray-700">
      <article className="mx-auto max-w-2xl rounded-2xl bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Aviso de privacidad</h1>
        <div className="mt-5 space-y-4 text-sm leading-6">
          <p>
            Este portal usa métricas agregadas de uso para entender si sus funciones son sencillas y mejorarlas.
            La analítica se activa automáticamente al usar el portal; no hay una pantalla de consentimiento y su uso no se bloquea.
          </p>
          <p>
            No enviamos a Analytics nombres, teléfonos, domicilios, correos, UID, ni contenido ni identificadores de reservaciones.
            La analítica puede recopilar métricas de navegación e interacción agregada, como visitas a pantallas,
            desplazamientos y clics en enlaces externos.
          </p>
          <p>
            Estas métricas se usan únicamente para mejorar la experiencia del portal de reservaciones.
          </p>
        </div>
        <div className="mt-7 border-t border-gray-100 pt-4">
          <PrivacyNoticeLink />
        </div>
      </article>
    </main>
  )
}
