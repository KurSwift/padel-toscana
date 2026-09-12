import { Link } from 'react-router-dom'

/** Enlace reutilizable al aviso público que describe la analítica del portal. */
export default function PrivacyNoticeLink() {
  return (
    <Link
      to="/privacidad"
      className="text-xs font-medium text-gray-500 underline underline-offset-2 transition hover:text-brand-700"
    >
      Aviso de privacidad
    </Link>
  )
}
