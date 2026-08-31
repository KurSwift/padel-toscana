import { doc, setDoc } from 'firebase/firestore'
import { db } from '@/firebase'

// Solo super-admin (reforzado en firestore.rules, no aquí) — ver
// ThemeContext.tsx para quién lee este doc y cómo se aplica.
export async function setThemePalette(paletteId: string): Promise<void> {
  await setDoc(doc(db, 'settings', 'theme'), { paletteId })
}
