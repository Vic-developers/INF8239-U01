# Comparación de datasets candidatos — LAB02

**INF-8239 Ciencia de Datos II · Unidad 01 · Ejercicio 01**

**Estado: PENDIENTE DE APROBACIÓN DEL DOCENTE**

Se investigaron candidatos de fuentes públicas académicamente
defendibles (UCI Machine Learning Repository). Toda la información
de abajo fue verificada directamente en las páginas oficiales de
UCI y con descarga/auditoría real de los archivos (ver
`data/raw/` y `scripts/audit_candidates.py`).

## Tabla comparativa

| Criterio          | Dataset A — Wine Quality | Dataset B — Bank Marketing |
| ----------------- | ------------------------ | -------------------------- |
| Nombre            | Wine Quality | Bank Marketing |
| Fuente            | UCI ML Repository (ID 186) | UCI ML Repository (ID 222) |
| URL               | https://archive.ics.uci.edu/dataset/186/wine+quality | https://archive.ics.uci.edu/dataset/222/bank+marketing |
| Descarga          | https://archive.ics.uci.edu/static/public/186/wine+quality.zip | https://archive.ics.uci.edu/static/public/222/bank+marketing.zip |
| Licencia          | CC BY 4.0 (verificada en UCI) | CC BY 4.0 (verificada en UCI) |
| Autor             | P. Cortez, A. Cerdeira, F. Almeida, T. Matos, J. Reis (2009) | S. Moro, P. Rita, P. Cortez (2014) |
| DOI               | 10.24432/C56S3T | 10.24432/C5K306 |
| Filas             | 1 599 (tinto) + 4 898 (blanco) | 45 211 (población completa) / 4 521 (muestra 10 %) |
| Columnas          | 12 (11 predictoras + target) | 17 (16 predictoras + target) |
| Target            | `quality` (puntuación sensorial 0–10) | `y` (suscripción a depósito a plazo: yes/no) |
| Clases            | 6 (tinto: 3–8) / 7 (blanco: 3–9), **desbalanceadas** | 2 (no: 88.5 %, yes: 11.5 %), desbalanceadas |
| Missing values    | 0 (verificado) | 0 (verificado) |
| Duplicados        | 240 (tinto) / 937 (blanco) — 15 %/19 % del total | 0 |
| Tipos             | Solo numéricas | Mixto: 7 numéricas + 10 categóricas |
| Riesgo de leakage | Bajo; el target es puntuación sensorial evaluada por expertos | **Variable `duration` documentada por UCI como post-outcome** (se excluye) |
| Viabilidad        | SVM viable incluso en 45 K filas | SVM viable en muestra 10 % (4 521 filas), recomendada por UCI |
| Pregunta          | ¿Pueden los análisis fisicoquímicos predecir la calidad sensorial del vino? | ¿Se puede predecir la suscripción a un depósito a plazo con datos disponibles antes del resultado? |

## Análisis de la comparación

**Dataset A (Wine Quality):** dataset clásico, limpio (sin
missing), pero con tres debilidades metodológicas: (1) target
multiclase ordenado y muy desbalanceado (calidades 5–6 concentran
~82 % de los casos), (2) duplicados exactos considerables
(15–19 %), (3) todas las variables son numéricas, por lo que no
ejercita preprocessing categórico.

**Dataset B (Bank Marketing):** problema binario con desbalance
realista (~11.5 % de positivos), mezcla de variables numéricas y
categóricas (ejercita `ColumnTransformer` completo), **sin
missing y sin duplicados**, y —decisivo para este ejercicio—
contiene una variable de leakage **documentada oficialmente**
(`duration`), lo que permite demostrar auditoría y prevención de
data leakage con evidencia verificable. Su pregunta de negocio es
clara y defendible.

## Decisión propuesta

**Se propone el Dataset B (Bank Marketing) como dataset final
del Ejercicio 01**, con:

- **Target:** `y` (yes = suscribió depósito a plazo)
- **Unidad de análisis:** cliente contactado en campaña de
  telemarketing
- **Exclusión por leakage:** `duration` (documentada por UCI)
- **Archivo de modelado:** `bank.csv` (10 % aleatorio, 4 521
  filas) — UCI lo provee específicamente para algoritmos
  computacionalmente demandantes como SVM; la auditoría documenta
  la población completa (`bank-full.csv`, 45 211 filas).

**PENDIENTE DE APROBACIÓN DEL DOCENTE.** Si el docente aprueba
otro dataset, el pipeline está parametrizado y se re-ejecuta con
`scripts/ejecutar_ejercicio01.py`.
