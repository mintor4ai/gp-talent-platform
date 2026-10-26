// Knowledge Base articles — add / edit entries here to update the Help panel.
// Each article has a stable `id`, a `category`, a short `title`, and `content`
// written in Markdown-flavoured plain text (rendered with whitespace-pre-wrap).

export type KbArticle = {
  id: string;
  category: string;
  title: string;
  content: string; // plain text / light markdown
  updatedAt: string; // ISO date string, for display
};

export const KB_ARTICLES: KbArticle[] = [
  // ── Exportaciones ──────────────────────────────────────────────────────────
  {
    id: "exports-overview",
    category: "Exportaciones",
    title: "Archivos que genera la plataforma",
    updatedAt: "2026-10-26",
    content: `La plataforma genera 4 archivos Excel y 1 PDF por colaborador. Todos los archivos incluyen IDs (UUID) para poder cruzarlos entre sí en Excel, Power BI o con un LLM.

─── ARCHIVOS EXCEL ───────────────────────────────────

1. matches_{ciclo}.xlsx
   Botón: Motor de Matching → Matches → "↓ Exportar Excel"
   Respeta los filtros activos (ciclo, estado, UEN, tipo, búsqueda).
   Una hoja · una fila por match.

   Columnas principales:
   • Match ID — clave primaria del match
   • Ciclo — año del proceso
   • Puesto ID / Puesto / UEN / Segmento / Es Crítico
   • Tipo Match: Bidireccional | Aspiración | Propuesta | Gap Crítico | Manual
   • Colaborador ID / ID Empleado / Colaborador / Área / Org
   • Titulares (separados por ";", con [Baja] si aplica)
   • Readiness: Inmediato | Mediano Plazo | Largo Plazo
   • Validado: Sí | No | Pendiente — Validado Por — Fecha Validación
   • Descartado — Descartado Por — Fecha Descarte — Motivo Descarte
   • Plan Carrera Estado
   • Creado el

2. cobertura_{ciclo}.xlsx
   Botón: Motor de Matching → Cobertura → "↓ Exportar Excel"
   Respeta el filtro de ciclo activo.
   Una hoja · una fila por PUESTO × SUCESOR
   (si un puesto tiene 3 sucesores → 3 filas para ese puesto).

   Columnas principales:
   • Puesto ID / Clave / Puesto / UEN / Área / Segmento / Tipo Vacante / Es Crítico
   • Riesgo Cobertura: Sin sucesor | 3+ años | Con sucesor | Vacante
   • # Titulares / Titulares IDs / Titulares
   • Aspirantes IDs / Aspirantes
   • Matches Validados IDs / Matches Validados (con readiness)
   • Sucesor ID / Sucesor Nombre
   • Titular ID Plan / Titular Plan
   • Readiness / Tiempo Estimado / Estado Plan

3. planes_carrera.xlsx
   Botón: Planes de Carrera (lista) → "↓ Exportar Excel"
   Respeta filtros activos (UEN, estado, búsqueda).
   Una hoja · resumen, una fila por expediente.

   Columnas:
   • Plan ID — clave primaria del expediente
   • Colaborador ID / Colaborador / Puesto Actual / UEN
   • Ciclo / Estado: Activo | Pausado | Cerrado | Eliminado
   • Objetivo Principal / Org Objetivo
   • # Objetivos / # Sesiones / Creado el

4. planes_carrera_completo.xlsx
   Botón: Planes de Carrera (lista) → "↓ Con notas"
   Sin filtro — exporta TODOS los expedientes con su contenido completo.
   Generado en el servidor (puede tardar unos segundos).

   Hoja 1 — Planes de Carrera (igual que archivo #3, sin filtro)

   Hoja 2 — Hilo de Entradas (una fila por nota/sesión)
   • Nota ID / Plan ID ← usar Plan ID para unir con Hoja 1
   • Tipo: Expediente creado | Sesión documentada | Sistema
   • Autor
   • Fortalezas
   • Áreas de Desarrollo
   • Logros / Experiencias
   • Experiencias Requeridas
   • Observaciones
   • Editado el / Editado por
   • Creado el

─── PDF INDIVIDUAL ───────────────────────────────────

5. PDF — Expediente de talento
   Botón: dentro de cada expediente → "↓ Exportar PDF"
   Abre una pestaña nueva lista para Ctrl+P o "Guardar como PDF".

   Contiene (en orden):
   • Foto + nombre + puesto + nivel
   • Chips: UEN, área, depto, segmento, razón social, antigüedad (años),
     ciclo del plan, estado
   • Posiciones objetivo (numeradas; #1 marcada como "Principal")
   • Hilo de entradas completo: tipo, autor, fecha/hora y las 5 secciones`,
  },

  {
    id: "exports-crossref",
    category: "Exportaciones",
    title: "Cómo cruzar los archivos entre sí",
    updatedAt: "2026-10-26",
    content: `Todos los archivos comparten IDs (UUID) que permiten unirlos en Excel (BUSCARV / XLOOKUP), Power Query, Power BI, o pasárselos a un LLM junto con los datos.

RELACIONES CLAVE
─────────────────────────────────────────────────
matches.xlsx
  └─ Puesto ID ──────────────→ cobertura.xlsx (columna "Puesto ID")
  └─ Colaborador ID ─────────→ planes_carrera_completo.xlsx Hoja 1 (columna "Colaborador ID")

planes_carrera.xlsx / Hoja 1 de completo
  └─ Plan ID ────────────────→ planes_carrera_completo.xlsx Hoja 2 (columna "Plan ID")
  └─ Colaborador ID ─────────→ matches.xlsx (columna "Colaborador ID")

cobertura.xlsx
  └─ Puesto ID ──────────────→ matches.xlsx (columna "Puesto ID")

EJEMPLO DE USO CON LLM
─────────────────────────────────────────────────
1. Exporta matches_{ciclo}.xlsx y planes_carrera_completo.xlsx
2. Súbelos al chat con el LLM
3. Pide: "Identifica colaboradores con Readiness=Inmediato que aún no
   tienen sesiones documentadas en su expediente"
   El LLM une ambos archivos por Colaborador ID para responder.

EJEMPLO CON POWER BI / EXCEL
─────────────────────────────────────────────────
• En Power Query: combina matches + cobertura por Puesto ID
• En el modelo: relaciona Plan ID entre Hoja 1 y Hoja 2 de completo
• Resultado: un tablero que muestra puesto → riesgo → sucesor
  → estado del expediente → última sesión documentada`,
  },

  // ── Motor de Matching ──────────────────────────────────────────────────────
  {
    id: "matching-estados",
    category: "Motor de Matching",
    title: "Estados de un match y flujo de validación",
    updatedAt: "2026-10-26",
    content: `Un match puede estar en uno de estos estados:

• Pendiente — generado por el motor, sin revisión de CH
• Validado (✓) — Capital Humano lo aprobó; se crea o vincula un expediente
• Descartado — CH lo descartó (requiere motivo)
• Revertido — CH deshizo una validación previa; el match vuelve a Pendiente

FLUJO NORMAL
  Motor genera match → CH revisa → Valida → Expediente se crea

CÓMO DESHACER UNA VALIDACIÓN
  Carpeta Individual → pestaña Sucesión → fila con estado "Aprobado"
  → botón "↩ Revertir"
  Esto regresa el plan de sucesión a Borrador Y limpia el campo
  validado_ch en sucesion_matches.

READINESS (tiempo estimado del sucesor)
  • Inmediato (listo_ahora) — puede tomar el puesto hoy
  • Mediano Plazo (uno_dos_anios) — en 1-2 años
  • Largo Plazo (tres_mas_anios) — en 3 o más años`,
  },

  // ── Expedientes de talento ─────────────────────────────────────────────────
  {
    id: "expediente-secciones",
    category: "Expedientes de Talento",
    title: "Secciones del hilo de entradas",
    updatedAt: "2026-10-26",
    content: `Cada sesión documentada en un expediente tiene 5 secciones de contenido libre:

1. Fortalezas observadas y por consolidar
   Competencias y comportamientos que el colaborador ya domina o está
   consolidando.

2. Áreas de desarrollo / comportamientos esperados
   Habilidades, competencias o actitudes que debe desarrollar para
   alcanzar la posición objetivo.

3. Logros o experiencias observadas
   Hitos, proyectos o situaciones concretas que evidencian su potencial.

4. Experiencias requeridas o sugeridas
   Qué tipo de rotaciones, proyectos o exposiciones recomienda el
   Director o CH para preparar al colaborador.

5. Observaciones generales / Compromiso del Director de área
   Acuerdos, contexto adicional, compromisos del director con el plan.

TIPOS DE ENTRADA EN EL HILO
• Expediente creado — se genera automáticamente al crear el plan
• Sesión documentada — registrada por CH o el Director
• Sistema — eventos automáticos de la plataforma`,
  },
];

// Categories in display order
export const KB_CATEGORIES = [
  "Exportaciones",
  "Motor de Matching",
  "Expedientes de Talento",
];
