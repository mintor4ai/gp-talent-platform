// Knowledge Base articles — add / edit entries here to update the Help panel.
// Each article has a stable `id`, a `category`, a short `title`, and `content`
// written in Markdown-flavoured plain text (rendered with whitespace-pre-wrap).

export type KbArticle = {
  id: string;
  category: string;
  title: string;
  content: string; // plain text / light markdown
  publishedAt: string; // ISO datetime string, e.g. "2026-10-26T14:30:00"
  modules: string[];   // platform modules this article applies to
};

export const KB_ARTICLES: KbArticle[] = [
  // ── Exportaciones ──────────────────────────────────────────────────────────
  {
    id: "exports-overview",
    category: "Exportaciones",
    title: "Archivos que genera la plataforma",
    publishedAt: "2026-10-26T14:30:00",
    modules: ["Motor de Matching", "Cobertura", "Planes de Carrera", "Expediente Individual"],
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
    publishedAt: "2026-10-26T14:30:00",
    modules: ["Motor de Matching", "Cobertura", "Planes de Carrera"],
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
    id: "matching-overview",
    category: "Motor de Matching",
    title: "¿Qué es el Motor de Matching?",
    publishedAt: "2026-10-26T15:00:00",
    modules: ["Motor de Matching"],
    content: `El Motor de Matching es el núcleo del proceso de sucesión. Identifica y registra las posibles relaciones entre colaboradores y puestos del catálogo, ya sea de forma automática o manual.

CÓMO SE GENERAN LOS MATCHES
─────────────────────────────────────────────────
El motor combina tres fuentes de señal:

1. Aspiración del colaborador
   El propio colaborador indica en su perfil a qué puesto aspira.
   → genera un match de tipo "Aspiración"

2. Propuesta del director o CH
   Un director o Capital Humano propone a un colaborador como sucesor
   de un puesto específico.
   → genera un match de tipo "Propuesta"

3. Cruce bidireccional automático
   Cuando un colaborador aspira a un puesto Y alguien lo propone para
   ese mismo puesto, el motor fusiona ambas señales.
   → genera un match de tipo "Bidireccional" (la señal más fuerte)

4. Gap Crítico
   Un puesto marcado como crítico no tiene sucesores activos.
   El motor registra automáticamente este riesgo como match de tipo
   "Gap Crítico". Se auto-descarta cuando alguien es validado para
   ese puesto.

5. Manual
   CH crea el plan de sucesión directamente desde la Carpeta
   Individual del colaborador, sin pasar por propuesta previa.
   → genera un match de tipo "Manual"

CICLOS
─────────────────────────────────────────────────
Cada match pertenece a un ciclo (año). Los ciclos permiten comparar
la evolución de la cobertura de sucesión año con año.
La vista puede filtrarse por ciclo o mostrar todos.

FILTROS DISPONIBLES
─────────────────────────────────────────────────
• Ciclo (año)
• UEN / Organización
• Tipo de match
• Estado: Pendiente | Validado | Descartado
• Texto libre (nombre, puesto)
• Solo puestos críticos`,
  },

  {
    id: "matching-estados",
    category: "Motor de Matching",
    title: "Estados de un match y flujo de validación",
    publishedAt: "2026-10-26T14:30:00",
    modules: ["Motor de Matching", "Carpeta Individual → Sucesión"],
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

  // ── Planes de Sucesión ─────────────────────────────────────────────────────
  {
    id: "plan-sucesion-overview",
    category: "Planes de Sucesión",
    title: "¿Qué es un Plan de Sucesión?",
    publishedAt: "2026-10-26T15:00:00",
    modules: ["Carpeta Individual → Sucesión", "Motor de Matching"],
    content: `Un Plan de Sucesión es el registro formal de que un colaborador específico
está siendo preparado para ocupar un puesto específico, en un ciclo determinado.

Se distingue del match en que el match es la señal (aspiración o propuesta),
mientras que el plan es el compromiso formal documentado y firmado.

CUÁNDO SE CREA UN PLAN
─────────────────────────────────────────────────
Un plan se crea de dos formas:

1. Automáticamente al validar un match en el Motor de Matching
   CH aprueba el match → el plan queda en estado "Aprobado" de inmediato.

2. Manualmente desde la Carpeta Individual del colaborador
   CH ingresa a la Carpeta → pestaña Sucesión → "Agregar plan"
   Elige el puesto del catálogo y el ciclo.
   El plan inicia en "Borrador" y puede validarse después.

ESTRUCTURA DE UN PLAN
─────────────────────────────────────────────────
• Colaborador (sucesor)
• Puesto objetivo (del catálogo)
• Titular al que reemplazaría
• Ciclo (año)
• Readiness: Inmediato | Mediano Plazo | Largo Plazo
• Tiempo estimado (texto libre complementario)
• Estado (ver artículo de estados)
• Notas internas de CH`,
  },

  {
    id: "plan-sucesion-estados",
    category: "Planes de Sucesión",
    title: "Estados y flujo de aprobación",
    publishedAt: "2026-10-26T15:00:00",
    modules: ["Carpeta Individual → Sucesión", "Motor de Matching"],
    content: `ESTADOS DE UN PLAN DE SUCESIÓN
─────────────────────────────────────────────────

• Borrador
  El plan fue creado manualmente. Aún no ha sido revisado ni aprobado.
  CH puede editarlo libremente.

• Aprobado
  Capital Humano validó el match o aprobó el plan directamente.
  Este estado vincula el plan con el expediente de talento (Plan de
  Carrera) del colaborador.
  → El match correspondiente queda marcado como validado_ch = true.

• Descartado
  CH descartó el plan. Requiere un motivo escrito.
  El match correspondiente queda marcado como descartado = true.
  Un plan descartado puede reactivarse (vuelve a Borrador).

• Revertido (acción, no estado final)
  CH deshace una validación previa desde la Carpeta Individual.
  El plan regresa a Borrador y el campo validado_ch del match
  se limpia (queda nulo = Pendiente).

FLUJO NORMAL
─────────────────────────────────────────────────

  Motor detecta señal
        ↓
  Match generado (Pendiente)
        ↓
  CH revisa en Motor de Matching
        ↓
  ┌─── Valida ──────────────────→ Aprobado → Expediente de Talento
  └─── Descarta (con motivo) ──→ Descartado

FLUJO MANUAL (sin match previo)
─────────────────────────────────────────────────

  CH abre Carpeta Individual → Sucesión
        ↓
  "Agregar plan" → elige puesto + ciclo
        ↓
  Plan en Borrador
        ↓
  CH valida → Aprobado → Expediente de Talento

CÓMO REVERTIR UNA VALIDACIÓN
─────────────────────────────────────────────────
  Carpeta Individual → pestaña Sucesión
  → fila con estado "Aprobado"
  → botón "↩ Revertir"

  Esto hace dos cosas simultáneamente:
  1. Regresa el plan a estado Borrador
  2. Limpia validado_ch / validado_por / fecha_validacion en el match`,
  },

  {
    id: "cobertura-overview",
    category: "Cobertura por Puesto",
    title: "Vista de Cobertura — qué muestra y cómo leerla",
    publishedAt: "2026-10-26T15:00:00",
    modules: ["Cobertura"],
    content: `La vista de Cobertura muestra el estado de sucesión de cada puesto del
catálogo: quién lo ocupa hoy, quién podría ocuparlo mañana, y qué tan
expuesta está la organización si ese puesto queda vacante.

QUÉ MUESTRA CADA TARJETA DE PUESTO
─────────────────────────────────────────────────

• Titulares — quién ocupa el puesto actualmente
  (puede estar vacante si no hay titular asignado)

• Aspirantes — colaboradores que aspiran a ese puesto
  (señal de interés, sin validar)

• Matches validados — colaboradores que CH ya validó como sucesores,
  con su readiness indicado

• Sucesores formales — colaboradores con Plan de Sucesión aprobado
  para ese puesto (el nivel más formal)

NIVELES DE RIESGO DE COBERTURA
─────────────────────────────────────────────────

🔴 Sin sucesor
   El puesto tiene titular pero ningún sucesor validado ni plan activo.
   Riesgo alto: si el titular sale, no hay reemplazo identificado.

🟡 3+ años
   Hay sucesores, pero todos con readiness de Largo Plazo (3+ años).
   Riesgo medio: hay continuidad, pero requiere tiempo de preparación.

🟢 Con sucesor
   Al menos un sucesor tiene readiness Inmediato o Mediano Plazo.
   Cobertura adecuada.

⚪ Vacante
   El puesto no tiene titular ni sucesor. Puede ser un puesto nuevo o
   que aún no se ha cubierto.

PUESTOS CRÍTICOS
─────────────────────────────────────────────────
Los puestos marcados como "Crítico" en el catálogo reciben tratamiento
especial:
• Se resaltan visualmente en la cobertura
• Si quedan sin sucesor, el motor genera automáticamente un match de
  tipo "Gap Crítico" como alerta
• En el Excel de cobertura aparecen en la columna "Es Crítico: Sí"

FILTROS DISPONIBLES
─────────────────────────────────────────────────
• Ciclo (año)
• Solo puestos críticos
• Nivel de riesgo
• UEN / Organización
• Búsqueda por nombre de puesto`,
  },

  // ── Expedientes de talento ─────────────────────────────────────────────────
  {
    id: "expediente-secciones",
    category: "Expedientes de Talento",
    title: "Secciones del hilo de entradas",
    publishedAt: "2026-10-26T14:30:00",
    modules: ["Planes de Carrera", "Expediente Individual"],
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
  "Motor de Matching",
  "Planes de Sucesión",
  "Cobertura por Puesto",
  "Expedientes de Talento",
  "Exportaciones",
];
