# Protocolo experimental — Ejercicio 01

**INF-8239 Ciencia de Datos II · Unidad 01**

**Estado: PENDIENTE DE APROBACIÓN DEL DOCENTE**

## Diseño

Experimento de clasificación binaria supervisada
con comparación contra baseline, búsqueda de
hiperparámetros por validación cruzada y evaluación
final sobre conjunto de test aislado.

## Semillas y determinismo

| Elemento | Semilla / configuración |
| -------- | ----------------------- |
| `train_test_split` | `random_state=42`, `stratify=y`, `test_size=0.20` |
| `StratifiedKFold` | `n_splits=5`, `shuffle=True`, `random_state=42` |
| `SVC` | `kernel="rbf"`, `random_state=42`, `probability=True` |

Con estas semillas los resultados son reproducibles
en el mismo entorno de dependencias.

## División de datos

- **Total (modelado):** 4 521 filas (`bank.csv`).
- **Train:** 3 616 (80 %).
- **Test:** 905 (20 %).
- **Estratificación:** se preserva la proporción
  `no`/`yes` (~88.5/11.5) en ambos conjuntos.
- **Baseline y SVM usan el MISMO split** (comparación
  justa).

## Prevención de data leakage

1. `duration` excluida antes del split (leakage
   documentado por UCI).
2. `ColumnTransformer` dentro del `Pipeline`:
   imputación, escalado y codificación se ajustan
   **solo** con datos de entrenamiento.
3. `GridSearchCV` opera exclusivamente sobre train
   (validación cruzada estratificada).
4. Test aislado hasta la evaluación final.
5. Ninguna transformación se ajusta sobre el
   dataset completo.

## Modelos

### Baseline

`DummyClassifier(strategy="most_frequent")`:
predice siempre la clase mayoritaria (`no`).
Sirve como referencia mínima y para evidenciar que
el accuracy es engañosa con clases desbalanceadas.

### SVM

Pipeline: `ColumnTransformer` → `StandardScaler`
(numéricas, dentro del preprocesamiento) →
`SVC(kernel="rbf", C, gamma, probability=True,
random_state=42)`, construido mediante la función
reutilizable `build_svm(C, gamma)` de
`src/inf8239_u01/models.py`.

## Búsqueda de hiperparámetros

`GridSearchCV` con `scoring="f1_macro"`:

| Hiperparámetro | Valores |
| -------------- | ------- |
| `svm__model__C` | 0.1, 1, 10 |
| `svm__model__gamma` | scale, 0.01, 0.1 |

9 configuraciones × 5 folds = 45 ajustes, solo
sobre entrenamiento.

## Métricas

Accuracy, Precision, Recall, F1 (clase positiva
`yes`), F1 macro y ROC-AUC (válida porque el
problema es binario y `SVC(probability=True)`
entrega probabilidades calibradas por Platt).

## Evidencias generadas

| Archivo | Contenido |
| ------- | --------- |
| `reports/svm_cv_results.csv` | 9 configuraciones con F1 macro medio ± std |
| `reports/svm_metrics.csv` | Métricas de baseline y SVM sobre test |
| `reports/confusion_matrix.png` | Matriz de confusión (test) |
| `reports/svm_best.joblib` | Pipeline final serializado |
| `reports/error_analysis.json` | FP, FN, TP, TN y report por clase |

## Reproducción

```powershell
pip install -r requirements.txt
pytest -q
python scripts\ejecutar_ejercicio01.py
python scripts\build_notebooks.py
python scripts\ejecutar_notebooks.py
```
