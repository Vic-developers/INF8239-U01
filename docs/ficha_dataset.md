# Ficha del dataset — LAB02

**INF-8239 Ciencia de Datos II · Unidad 01 · Ejercicio 01**

**Estado: PENDIENTE DE APROBACIÓN DEL DOCENTE**

## Identificación

| Campo | Valor |
| ----- | ----- |
| Nombre | Bank Marketing |
| Fuente | UCI Machine Learning Repository |
| Identificador UCI | Dataset 222 |
| URL | https://archive.ics.uci.edu/dataset/222/bank+marketing |
| URL de descarga | https://archive.ics.uci.edu/static/public/222/bank+marketing.zip |
| DOI | 10.24432/C5K306 |
| Licencia | Creative Commons Attribution 4.0 International (CC BY 4.0) — verificada en la página oficial de UCI |
| Procedencia | Donado a UCI el 13/02/2012 |
| Autores | Sérgio Moro, Paulo Cortez, Rita (Universidad del Minho, Portugal) |
| Artículo | *A data-driven approach to predict the success of bank telemarketing*, Decision Support Systems, 2014 |
| Versión usada | `bank.csv` (muestra aleatoria del 10 %, 4 521 filas) para modelado; `bank-full.csv` (45 211 filas) para auditoría de población |

## Descripción

Datos relacionados con campañas de marketing directo
(llamadas telefónicas) de una institución bancaria
portuguesa. El objetivo de clasificación es predecir si
el cliente suscribirá un depósito a plazo (variable `y`).
Suele requerirse más de un contacto con el mismo cliente
para saber si suscribió o no el producto.

## Unidad de análisis y población

- **Unidad de análisis:** cliente contactado durante una
  campaña de telemarketing.
- **Población:** 45 211 contactos de la campaña completa
  (mayo 2008 – noviembre 2010, ordenado por fecha). El
  archivo `bank.csv` contiene una muestra aleatoria del
  10 % (4 521 filas) que UCI provee explícitamente "to
  test more computationally demanding machine learning
  algorithms (e.g., SVM)".

## Variables (resumen)

- **Cliente:** `age`, `job`, `marital`, `education`,
  `default`, `balance`, `housing`, `loan`.
- **Último contacto:** `contact`, `day`, `month`,
  `duration` (**excluida por leakage**).
- **Campaña:** `campaign`, `pdays`, `previous`, `poutcome`.
- **Target:** `y` (yes/no).

Diccionario completo: `docs/diccionario_datos.md`.

## Target y clases

- **Target:** `y` — ¿suscribió un depósito a plazo?
- **Clases:** `no` (88.5 %) y `yes` (11.5 %) en la
  población completa; en la muestra de modelado:
  `no` = 4 000 (88.48 %), `yes` = 521 (11.52 %).
- **Desbalance:** moderado-alto; por eso las métricas
  macro y el recall son prioritarios sobre el accuracy.

## Pregunta de investigación

¿Es posible predecir, a partir de variables disponibles
**antes** del resultado (excluyendo `duration`), si un
cliente suscribirá un depósito a plazo durante la
campaña de telemarketing?

## Posibles sesgos

- **Sesgo de selección:** solo clientes contactados en
  campañas anteriores; no representa a la base total de
  clientes.
- **Sesgo temporal:** datos de 2008–2010 (crisis
  financiera en Portugal); los patrones de suscripción
  pueden haber cambiado.
- **Sesgo de medición:** el resultado depende de la
  efectividad de la llamada, no solo del cliente.

## Limitaciones

- Una sola entidad bancaria y un solo país.
- Sin variables de producto, saldo detallado o historial
  transaccional.
- `education` tiene categoría `unknown`; `poutcome` es
  mayoritariamente `unknown`.
- Clases desbalanceadas.

## Riesgo de leakage

`duration` (duración de la última llamada) está
documentada por UCI como una variable que *highly affects
the output target* y que **no se conoce antes de
realizar la llamada**. Se excluye del modelo. No existen
identificadores de cliente ni variables derivadas del
target. Ver `docs/auditoria_dataset.md` §Leakage.
