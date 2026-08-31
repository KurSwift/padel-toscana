import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { UserRole } from '@/types'

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
    title: 'Reservar una cancha',
    visibleTo: ['all'],
    steps: [
      'En la pestaña "Horarios", elige el día que quieres jugar (usa las flechas para cambiar de día).',
      'Toca un horario libre — verás las duraciones disponibles (hasta 2 horas).',
      'Elige cuántas horas, cuántos jugadores en total (1 a 10 — 4 son los que caben jugando a la vez, el resto son suplentes o acompañantes) y confirma quién es el residente a cargo (por default eres tú, pero puedes cambiarlo si la va a usar alguien más de tu domicilio).',
      'Al confirmar, la app te dice cuánto pagar y la fecha límite. Paga directo al tesorero (fuera de la app) antes de esa fecha, o el horario se libera automáticamente.',
      'Revisa el estado de tus reservaciones en "Mis reservaciones": "Pendiente de pago" hasta que el tesorero confirme, luego "Confirmada".',
      'Puedes cancelar cualquier reservación tuya, pendiente o confirmada, desde "Mis reservaciones".',
    ],
    faq: [
      {
        q: '¿Cuántas reservaciones puedo tener a la vez?',
        a: 'Hasta que no se cancele o pase alguna, hay un máximo por colono (lo define el administrador, normalmente 2).',
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
        q: '¿Puedo reservar más de 2 horas?',
        a: 'No, el máximo por reservación es 2 horas.',
      },
      {
        q: '¿Qué significan las etiquetas de color en mis reservaciones?',
        a: '"Pendiente de pago" = falta que el tesorero confirme tu pago. "Confirmada" = ya se pagó. "Cancelada"/"Finalizada" = ya no aplica.',
      },
    ],
  },
  {
    title: 'Confirmar pagos (tesorero)',
    visibleTo: ['tesorero', 'admin', 'super-admin'],
    steps: [
      'Entra a "Pagos" en la barra de arriba.',
      'Verás la lista de reservaciones pendientes de pago, ordenadas de la más urgente a la menos urgente.',
      'Cuando alguien te pague (fuera de la app), busca su reservación en la lista y presiona "Confirmar pago".',
      'La reservación desaparece de tu lista y el colono ve su estado cambiar a "Confirmada".',
    ],
    faq: [
      {
        q: '¿Cómo sé quién me debe pagar?',
        a: 'Cada tarjeta de la lista muestra el nombre del residente a cargo, su domicilio y el horario — coteja contra lo que te llegó.',
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
      'Entra a "Admin" en la barra de arriba.',
      'Pestaña "Reservaciones": ve todas las reservaciones de un día (los 4 estados) y cambia el estado de cualquiera si hace falta.',
      'Pestaña "Canchas": activa/desactiva canchas, y ajusta horarios, duración, límites de anticipación, plazo de pago y el monto a cobrar.',
      'Pestaña "Usuarios": aprueba o rechaza solicitudes de registro nuevas, y agrega colonos nuevos directamente.',
    ],
    faq: [
      {
        q: '¿Cómo apruebo a un nuevo colono?',
        a: 'Pestaña Usuarios → sección "Pendientes de aprobación" → botón Aprobar o Rechazar.',
      },
      {
        q: '¿Cómo hago a alguien tesorero?',
        a: 'Asignar roles es exclusivo de super-admin, desde la pestaña "Avanzado" — si no tienes ese rol, pídeselo a un super-admin.',
      },
      {
        q: '¿Cómo cambio el monto que se cobra por reservación?',
        a: 'Pestaña Canchas → campo "Monto a pagar ($)" de la cancha correspondiente.',
      },
      {
        q: '¿Cómo agrego una cancha nueva?',
        a: 'Pestaña Canchas → botón "+ Agregar cancha".',
      },
    ],
  },
  {
    title: 'Panel avanzado (super-admin)',
    visibleTo: ['super-admin'],
    steps: [
      'Entra a "Admin" → pestaña "Avanzado" (solo visible para super-admin, no para admin normal).',
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
  const navigate = useNavigate()

  const sections = SECTIONS.filter(
    (s) => s.visibleTo.includes('all') || (profile && s.visibleTo.includes(profile.role)),
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm px-4 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-800">Ayuda</h1>
          <p className="text-xs text-gray-500">{profile?.name}</p>
        </div>
        <button
          onClick={() => navigate('/')}
          className="text-xs font-medium text-brand-600 hover:text-brand-700 px-3 py-1.5 rounded-lg hover:bg-brand-50 transition"
        >
          ← Volver
        </button>
      </header>

      <main className="max-w-lg mx-auto px-4 py-5 space-y-4">
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
          <p className="text-sm text-brand-700 mt-1">
            Escribe al grupo de WhatsApp "Reservaciones - La Toscana".
          </p>
        </div>
      </main>
    </div>
  )
}
