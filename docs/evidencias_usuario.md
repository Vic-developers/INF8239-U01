# Evidencias del usuario — registro de verificaciones realizadas

**INF-8239 Ciencia de Datos II · Unidad 01 · Ejercicio 01**

Registro de las verificaciones ejecutadas en el
entorno de desarrollo, con sus resultados reales.

## Entorno

| Verificación | Resultado real |
| ------------ | -------------- |
| Sistema operativo | Windows (win32) |
| Python | 3.13.5 |
| pip | 26.2.1 |
| Git | 2.49.0.windows.1 |
| NumPy | 2.3.2 |
| pandas | 2.3.1 |
| scikit-learn | 1.7.2 |
| matplotlib | 3.10.5 |
| seaborn | 0.13.2 |
| joblib | 1.5.2 |

## Descargas realizadas (red verificada)

| Archivo | Fuente | Tamaño |
| ------- | ------ | ------ |
| `data/raw/winequality.zip` | UCI 186 | 91 353 bytes |
| `data/raw/bank-marketing.zip` | UCI 222 | 1 023 843 bytes |

Ambas descargas se realizaron con
`src/inf8239_u01/data.py` (validación HTTP/HTTPS
incluida).

## Auditorías ejecutadas (`scripts/audit_candidates.py`)

- Wine Quality tinto: 1 599 × 12, 0 missing, 240
  duplicados, target `quality` (6 clases).
- Wine Quality blanco: 4 898 × 12, 0 missing, 937
  duplicados, target `quality` (7 clases).
- Bank Marketing completo: 45 211 × 17, 0 missing,
  0 duplicados, target `y` (no 39 922 / yes 5 289).
- Bank Marketing modelado: 4 521 × 17, 0 missing,
  0 duplicados, target `y` (no 4 000 / yes 521).

## Licencias verificadas (página oficial UCI)

- Wine Quality: **CC BY 4.0**, DOI 10.24432/C56S3T.
- Bank Marketing: **CC BY 4.0**, DOI 10.24432/C5K306.

## Ejecución real del pipeline

`python scripts\ejecutar_ejercicio01.py` generó:

- `reports/svm_cv_results.csv` (9 configuraciones).
- `reports/svm_metrics.csv` (baseline vs SVM).
- `reports/confusion_matrix.png`.
- `reports/svm_best.joblib` (verificado con
  `joblib.load` y predicción idéntica).
- `reports/error_analysis.json`.

## Lección de proceso registrada

La primera ejecución del GridSearchCV sobre las
45 211 filas completas de `bank-full.csv` superó el
tiempo límite de 10 minutos y fue detenida. Esto
documentó la restricción computacional real de SVM
y motivó el uso de `bank.csv` (variante del 10 % que
UCI provee para SVM), decisión que queda registrada en
`docs/auditoria_dataset.md` §7.
