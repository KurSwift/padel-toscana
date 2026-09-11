/** Forma del archivo JSON que puede cargarse desde Configuración. */
export interface BulkColonoInput {
  calle: unknown
  numero_casa: unknown
  nombre_completo: unknown
  telefono: unknown
  email?: unknown
}

/** Parsea el archivo sin validar reglas de negocio; estas se aplican en el servidor. */
export function parseBulkColonosJson(text: string):
  | { ok: true; colonos: BulkColonoInput[] }
  | { ok: false; error: string } {
  try {
    const parsed: unknown = JSON.parse(text)
    if (typeof parsed !== 'object' || parsed === null || !Array.isArray((parsed as { colonos?: unknown }).colonos)) {
      return { ok: false, error: 'El archivo debe tener la forma { "colonos": [...] }.' }
    }
    const colonos = (parsed as { colonos: unknown[] }).colonos
    if (colonos.length === 0) return { ok: false, error: 'El archivo no contiene colonos.' }
    if (colonos.length > 100) return { ok: false, error: 'Puedes cargar hasta 100 colonos por archivo.' }
    if (colonos.some((colono) => typeof colono !== 'object' || colono === null || Array.isArray(colono))) {
      return { ok: false, error: 'Cada colono debe ser un objeto dentro de "colonos".' }
    }
    return { ok: true, colonos: colonos as BulkColonoInput[] }
  } catch {
    return { ok: false, error: 'El archivo no es JSON válido.' }
  }
}
