import { useAuth } from '@/context/AuthContext'
import { useSiteSettings } from '@/context/SiteSettingsContext'
import { UserRole } from '@/types'
import PrivacyNoticeLink from '@/components/PrivacyNoticeLink'

interface HelpSection {
  title: string
  // 'all' = todos los roles. Un rol se agrega aquí si esa función es algo
  // que ese rol puede hacer en la app — es acumulativo: admin ve esta
  // sección Y la de tesorero Y la de colono, porque de hecho puede hacer
  // las tres cosas (reservar, confirmar pagos, administrar).
  visibleTo: ('all' | UserRole)[]
  steps: string[]
  faq: { q: string; a: string }[]
}

const SECTIONS: HelpSection[] = [
  {
    title: 'Reservar Cancha o Casa Club',
    visibleTo: ['all'],
    steps: [
      'En la pestaña "Calendario", usa el selector Cancha / Casa Club de arriba para elegir qué quieres reservar.',
      'Elige el día que quieres (usa las flechas para cambiar de día).',
      'Cancha: toca un horario libre — verás las duraciones disponibles (hasta 2 horas). Casa Club: la reservación es de día completo, no hay horario que elegir.',
      'Elige cuántas personas en total (Cancha: jugadores, 1 a 10 — 4 son los que caben jugando a la vez, el resto son suplentes o acompañantes; Casa Club: invitados, hasta el aforo configurado) y confirma quién es el residente a cargo (por default eres tú, pero puedes cambiarlo si la va a usar alguien más de tu domicilio).',
      'Al confirmar, la app te dice cuánto pagar (en Casa Club, el depósito) y la fecha límite. Paga directo al tesorero (fuera de la app) antes de esa fecha, o el horario se libera automáticamente.',
      'Revisa el estado de tus reservaciones en "Reservaciones": "Pendiente de pago" hasta que el tesorero confirme, luego "Confirmada". Al terminar una Casa Club, el tesorero resuelve el depósito y verás "Depósito devuelto" o "Depósito retenido".',
      'Puedes cancelar cualquier reservación tuya, pendiente o confirmada, desde "Reservaciones" — Casa Club solo se puede cancelar respetando el plazo mínimo de cancelación configurado.',
    ],
    faq: [
      {
        q: '¿En qué se diferencia Casa Club de Cancha?',
        a: 'Casa Club se reserva por día completo (no eliges horario), pide número de invitados en vez de jugadores, y requiere un depósito además del pago de reservación. El tesorero devuelve o retiene la parte reembolsable del depósito al terminar el evento.',
      },
      {
        q: '¿Cuántas reservaciones puedo tener a la vez?',
        a: 'Hasta que no se cancele o pase alguna, hay un máximo por colono (lo define el administrador, normalmente 2). Casa Club además puede tener un tope de reservaciones por usuario al mes.',
      },
      {
        q: '¿Con cuánta anticipación tengo que reservar?',
        a: 'Al menos 24 horas antes del horario que quieres (puede variar si el administrador lo cambia), y no más de unos días hacia adelante.',
      },
      {
        q: '¿Qué pasa si no pago a tiempo?',
        a: 'El horario se libera automáticamente y cualquier otro colono lo puede reservar.',
      },
      {
        q: '¿A quién le pago?',
        a: 'Al tesorero, directamente (efectivo, transferencia, etc. — fuera de la app). Si tienes dudas de a quién contactar, pregunta en el grupo de WhatsApp.',
      },
      {
        q: '¿Puedo reservar más de 2 horas en cancha?',
        a: 'No, el máximo por reservación es 2 horas.',
      },
      {
        q: '¿Qué pasa si cancelo Casa Club a última hora?',
        a: 'Si ya no alcanzas el plazo mínimo de cancelación (lo define el administrador), la app no te deja cancelar — contacta al administrador si es un caso especial.',
      },
      {
        q: '¿Qué significan las etiquetas de color en mis reservaciones?',
        a: '"Pendiente de pago" = falta que el tesorero confirme tu pago. "Confirmada" = ya se pagó. "Cancelada"/"Finalizada" = ya no aplica. En Casa Club, al terminar el evento el tesorero marca el depósito como "Depósito devuelto" o "Depósito retenido".',
      },
    ],
  },
  {
    title: 'Confirmar pagos (tesorero)',
    visibleTo: ['tesorero', 'admin', 'super-admin'],
    steps: [
      'Abre la pestaña "Pagos" en la navegación principal.',
      'Verás la lista de reservaciones pendientes de pago (Cancha y Casa Club), ordenadas de la más urgente a la menos urgente.',
      'Cuando alguien te pague (fuera de la app), busca su reservación en la lista y presiona "Confirmar pago".',
      'La reservación desaparece de tu lista y el colono ve su estado cambiar a "Confirmada".',
      'Debajo verás "Depósitos por resolver": Casa Club ya finalizada, esperando que devuelvas o retengas la parte reembolsable del depósito.',
    ],
    faq: [
      {
        q: '¿Cómo sé quién me debe pagar?',
        a: 'Cada tarjeta de la lista muestra el nombre del residente a cargo, su domicilio y el horario (o "Día completo" en Casa Club) — coteja contra lo que te llegó.',
      },
      {
        q: '¿Qué son los "Depósitos por resolver"?',
        a: 'Reservaciones de Casa Club ya finalizadas donde falta decidir si se devuelve o se retiene el depósito reembolsable (por ejemplo, si hubo daños). Aparecen debajo de la lista de pagos pendientes.',
      },
      {
        q: '¿Qué pasa si confirmo un pago por error?',
        a: 'Pide a un administrador que lo corrija desde el panel admin — puede cambiar el estado de cualquier reservación.',
      },
      {
        q: '¿Tengo que revisar la lista todos los días?',
        a: 'No es obligatorio — las reservaciones no pagadas a tiempo se liberan solas, no se quedan "atoradas" esperando que las revises.',
      },
    ],
  },
  {
    title: 'Panel de administración',
    visibleTo: ['admin', 'super-admin'],
    steps: [
      'Abre "Configuración" en la navegación principal.',
      'Pestaña "Reservaciones": ve todas las reservaciones de un día, de Cancha y Casa Club (los 6 estados), y cambia el estado de cualquiera si hace falta.',
      'En esa misma pestaña, "Reservar para un colono" te deja buscar a un colono por nombre o domicilio y reservarle Cancha o Casa Club — el residente a cargo se precarga con su nombre pero lo puedes editar.',
      'Pestaña "Canchas": activa/desactiva recursos y crea uno nuevo eligiendo tipo (Cancha o Casa Club). Cancha muestra horarios y duración; Casa Club muestra depósito, reembolsable, aforo y plazo de cancelación. Ambos comparten límites de anticipación, plazo de pago y monto a cobrar (Casa Club agrega el tope mensual por usuario).',
      'Pestaña "Usuarios": aprueba o rechaza solicitudes de registro nuevas, y agrega colonos nuevos directamente.',
    ],
    faq: [
      {
        q: '¿Cómo apruebo a un nuevo colono?',
        a: 'Pestaña Usuarios → sección "Pendientes de aprobación" → botón Aprobar o Rechazar.',
      },
      {
        q: '¿Cómo reservo Cancha o Casa Club a nombre de un colono?',
        a: 'Pestaña Reservaciones → "Reservar para un colono" → búscalo por nombre o domicilio → sigue el mismo flujo de reservación normal. Queda registrado que tú la creaste, pero los límites (máximo de activas, tope mensual, etc.) aplican al colono, no a ti.',
      },
      {
        q: '¿Cómo hago a alguien tesorero?',
        a: 'Asignar roles es exclusivo de super-admin, desde la pestaña "Avanzado" — si no tienes ese rol, pídeselo a un super-admin.',
      },
      {
        q: '¿Cómo cambio el monto que se cobra por reservación?',
        a: 'Pestaña Canchas → campo "Monto a pagar ($)" del recurso correspondiente.',
      },
      {
        q: '¿Cómo cambio el depósito o el plazo de cancelación de Casa Club?',
        a: 'Pestaña Canchas → el recurso de tipo Casa Club muestra sus campos exclusivos: Depósito ($), Reembolsable ($), Plazo de cancelación (horas) y Aforo (personas).',
      },
      {
        q: '¿Cómo agrego una cancha o una Casa Club nueva?',
        a: 'Pestaña Canchas → botón "+ Agregar cancha" → elige el tipo (Cancha o Casa Club).',
      },
    ],
  },
  {
    title: 'Panel avanzado (super-admin)',
    visibleTo: ['super-admin'],
    steps: [
      'Abre "Configuración" → sección "Avanzado" (solo visible para super-admin, no para admin normal).',
      'Asignar roles: usa el selector de rol junto al nombre de cada usuario activo (Colono/Admin/Tesorero/Super Admin).',
    ],
    faq: [
      {
        q: '¿Puedo cambiarme mi propio rol?',
        a: 'No — por seguridad, ni un admin ni un super-admin pueden modificar su propio rol. Pide a otro super-admin que lo haga.',
      },
    ],
  },
]

export default function HelpPage() {
  const { profile } = useAuth()
  const { whatsappUrl } = useSiteSettings()

  const sections = SECTIONS.filter(
    (s) => s.visibleTo.includes('all') || (profile && s.visibleTo.includes(profile.role)),
  )

  return (
    <main className="mx-auto min-h-full max-w-5xl space-y-4 px-4 py-6 pb-24 md:px-8 md:pb-8">
      <div className="max-w-2xl">
        <h2 className="mb-1 text-2xl font-bold tracking-tight text-gray-900">Ayuda</h2>
        <p className="mb-6 text-sm text-gray-500">Guías y respuestas para usar la app.</p>
        {sections.map((section) => (
          <div key={section.title} className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800">{section.title}</h2>
            </div>
            <div className="px-4 py-4 space-y-4">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Cómo hacerlo
                </p>
                <ol className="space-y-1.5 text-sm text-gray-700 list-decimal list-inside">
                  {section.steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Preguntas frecuentes
                </p>
                <div className="space-y-2">
                  {section.faq.map((item) => (
                    <details
                      key={item.q}
                      className="group border border-gray-200 rounded-xl px-3 py-2"
                    >
                      <summary className="text-sm font-medium text-gray-700 cursor-pointer list-none flex items-center justify-between gap-2">
                        <span>{item.q}</span>
                        <span className="text-gray-400 shrink-0 transition group-open:rotate-180">⌄</span>
                      </summary>
                      <p className="text-sm text-gray-500 mt-2">{item.a}</p>
                    </details>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}

        <div className="bg-brand-50 border border-brand-200 rounded-2xl p-4 text-center">
          <p className="text-sm text-brand-800 font-medium">¿Tienes dudas o algo no funciona?</p>
          {whatsappUrl ? (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-sm text-brand-700 mt-1 font-semibold underline underline-offset-2"
            >
              Escríbenos por WhatsApp
            </a>
          ) : (
            <p className="text-sm text-brand-700 mt-1">
              Escribe al grupo de WhatsApp "Reservaciones - La Toscana".
            </p>
          )}
        </div>
        <div className="pt-1 text-center">
          <PrivacyNoticeLink />
        </div>
      </div>
    </main>
  )
}
