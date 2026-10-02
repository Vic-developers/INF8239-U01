# Auditoría del dataset — Bank Marketing (UCI 222)

**INF-8239 Ciencia de Datos II · Unidad 01 · Ejercicio 01**

**Estado: PENDIENTE DE APROBACIÓN DEL DOCENTE**

Todos los valores de esta auditoría provienen de una
ejecución real (`scripts/audit_candidates.py`) sobre los
archivos descargados de UCI, no de valores teóricos.

## 1. Estructura

### Archivo de modelado: `bank.csv`

| Aspecto | Valor real |
| ------- | ---------- |
| Filas | 4 521 |
| Columnas | 17 |
| Tipos | 7 numéricas (int64) + 10 categóricas (object) |
| Duplicados exactos | 0 |
| Missing total | 0 (0.0 %) |

### Población completa: `bank-full.csv`

| Aspecto | Valor real |
| ------- | ---------- |
| Filas | 45 211 |
| Columnas | 17 |
| Duplicados exactos | 0 |
| Missing total | 0 (0.0 %) |

## 2. Missing values

- **Cantidad:** 0 en las 17 columnas de ambos archivos.
- **Porcentaje:** 0.0 %.
- **Distribución:** no aplica (sin valores faltantes).

Nota: el dataset no usa NaN; la categoría `"unknown"`
(cadena) representa información desconocida en
`education` y `poutcome`, y `-1` en `pdays` indica
"no contactado previamente". Estas son convenciones de
codificación, no missing values, y se preservan como
categorías/valores legítimos.

## 3. Target

| Clase | bank.csv | % | bank-full.csv | % |
| ----- | -------: | -: | ------------: | -: |
| `no` | 4 000 | 88.48 % | 39 922 | 88.30 % |
| `yes` | 521 | 11.52 % | 5 289 | 11.70 % |

- **Número de clases:** 2 (binario).
- **Desbalance:** ~7.7:1 (no:yes). Moderado-alto.
- **Implicación:** el accuracy es una métrica
  engañosa (un modelo que siempre predice "no" alcanza
  88.5 %). Se priorizan **F1 macro**, **recall** y
  **ROC-AUC**.

## 4. Predictoras

- **Numéricas (7):** `age`, `balance`, `day`, `duration`,
  `campaign`, `pdays`, `previous` (6 tras excluir
  `duration`).
- **Categóricas (10):** `job`, `marital`, `education`,
  `default`, `housing`, `loan`, `contact`, `month`,
  `poutcome` (9 predictoras + target `y`).
- **Identificadores:** no existe ninguna columna de ID de
  cliente — favorable: evita memorización y no hay que
  excluir identificadores.
- **Constantes:** ninguna (`nunique > 1` en todas las
  columnas, verificado).
- **Alta cardinalidad (>20 categorías):** ninguna; la
  mayor es `job` con ~12 categorías. `OneHotEncoder` es
  adecuado.
- **Valores especiales documentados:** `default`/`housing`
  `/`loan` usan "unknown" como categoría; `pdays = -1`
  significa "sin contacto previo"; `poutcome` es
  mayoritariamente "unknown".

## 5. Leakage (investigación explícita)

Se investigaron las cuatro fuentes de leakage:

1. **Información posterior al evento objetivo:**
   **SÍ — `duration`.** La documentación oficial de UCI
   indica: *"duration: last contact duration, in seconds.
   Important note: this attribute highly affects the
   output target (e.g., if duration=999, y='yes'). Yet,
   the duration is not known before a call is performed.
   Thus, this input should only be included for benchmark
   purposes and should be discarded if the intention is to
   have a realistic predictive model."*
   **Decisión: `duration` se EXCLUYE** de `X` antes del
   split y de todo preprocessing.
2. **Variables derivadas del target:** no se detectan;
   ninguna predictoras es función de `y`.
3. **Identificadores:** no existen (ver §4).
4. **Variables de resultado:** únicamente `y`, que es el
   target legítimo y se separa antes del split.

**Variables conservadas (defensa):** `campaign`, `pdays`,
`previous` y `poutcome` describen contactos de la
campaña actual **anteriores** a la decisión final del
cliente y campañas previas; están disponibles cuando se
realiza la predicción y no derivan del resultado.

## 6. Prevención de leakage en el pipeline

- Split estratificado **antes** de cualquier
  transformación.
- Imputación, escalado y codificación viven **dentro**
  del `Pipeline`/`ColumnTransformer`, por lo que se
  ajustan solo con `X_train` (y con los folds de train
  dentro de `GridSearchCV`).
- El conjunto de test se toca solo en la evaluación
  final.
- Baseline y SVM usan **el mismo split**
  (`random_state=42`, `stratify=y`).
- `GridSearchCV` con `StratifiedKFold(5, shuffle=True,
  random_state=42)` se ejecuta exclusivamente sobre
  entrenamiento.

## 7. Viabilidad computacional

SVM con kernel RBF escala cuadráticamente con el número
de muestras: un GridSearchCV de 9 configuraciones × 5
folds sobre las 45 211 filas completas resulta
prohibitivo (se excedió un tiempo de ejecución de 10 min
en prueba real). Por ello se usa `bank.csv` (4 521
filas), la variante que UCI provee específicamente para
"algoritmos computacionalmente demandantes (e.g., SVM)".
La ejecución completa del pipeline toma del orden de
minutos.
