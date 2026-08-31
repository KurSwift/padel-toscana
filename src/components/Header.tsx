import { ReactNode } from 'react'

interface HeaderProps {
  title: string
  // Home usa text-brand-700 (color de marca); el resto de las páginas usa
  // gray-800 — ver AGENTS.md, no hay una sola paleta de título hoy.
  titleClassName?: string
  subtitle?: ReactNode
  // Solo HomePage necesita que el header se quede fijo arriba al hacer
  // scroll (la grilla de horarios es larga) — el resto no.
  sticky?: boolean
  // Slot para el logo del sitio (issue 4/5 del Epic #43, todavía sin
  // implementar) — hoy ninguna página pasa nada aquí, así que no cambia
  // el look actual (sin logo, solo título + subtítulo).
  logo?: ReactNode
  children?: ReactNode
}

export default function Header({ title, titleClassName = 'text-gray-800', subtitle, sticky, logo, children }: HeaderProps) {
  return (
    <header
      className={`${sticky ? 'sticky top-0 z-10 ' : ''}bg-white shadow-sm px-4 py-4 flex items-center justify-between`}
    >
      <div className="flex items-center gap-3">
        {logo}
        <div>
          <h1 className={`text-lg font-bold ${titleClassName}`}>{title}</h1>
          {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </header>
  )
}
