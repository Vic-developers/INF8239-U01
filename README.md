# INF-8239 Ciencia de Datos II — Unidad 01

## Ejercicio 01 — Dataset público y SVM reproducible

**Estado del dataset: PENDIENTE DE APROBACIÓN DEL DOCENTE**

Entrega individual que integra las evidencias de LAB00
(validación de entorno), LAB01 (SVM guiada) y LAB02
(selección, auditoría y modelado de un dataset público).

## Objetivo

Seleccionar y auditar un dataset público, prevenir el
data leakage, y construir un pipeline SVM reproducible con
baseline, métricas, análisis de errores y pruebas
automatizadas.

## Dataset (propuesto)

- **Nombre:** Bank Marketing (UCI Machine Learning
  Repository, dataset 222)
- **URL:** https://archive.ics.uci.edu/dataset/222/bank+marketing
- **Licencia:** CC BY 4.0 (verificada en UCI)
- **DOI:** 10.24432/C5K306
- **Target:** `y` (suscripción a depósito a plazo: yes/no)
- **Archivo de modelado:** `data/raw/bank.csv` (muestra
  aleatoria del 10 %, 4 521 filas — variante que UCI
  provee para algoritmos computacionalmente demandantes
  como SVM)
- **Candidato alternativo documentado:** Wine Quality
  (UCI 186). Comparación completa en
  `docs/candidatos_dataset.md`.

## Estructura del repositorio

```text
INF8239_U01/
├── data/                  # raw/ (descargas) y processed/
├── docs/                  # documentación técnica (9 archivos)
├── notebooks/             # 00_verificacion, 01_svm_guiada,
│                          # 02_dataset_auditoria
├── reports/               # evidencias generadas (CSV, PNG, joblib)
├── scripts/               # construcción y ejecución reproducible
├── src/inf8239_u01/       # código reutilizable
├── tests/                 # pytest (19 tests)
├── README.md
├── requirements.txt
└── pyproject.toml
```

## Instalación

Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## Tests

```powershell
pytest -q
```

`pyproject.toml` ya configura `testpaths` y `pythonpath`,
por lo que `pytest -q` funciona directamente desde la raíz
del proyecto sin variables de entorno adicionales.

## Notebooks (orden de ejecución)

1. `notebooks/00_verificacion.ipynb` — LAB00: verifica
   Python, bibliotecas, Git y estructura.
2. `notebooks/01_svm_guiada.ipynb` — LAB01: práctica
   metodológica con `load_breast_cancer` (incluye
   advertencia académica; **no** es el dataset final).
3. `notebooks/02_dataset_auditoria.ipynb` — LAB02:
   descarga, auditoría, leakage, train/test, preprocessing,
   baseline, SVM, métricas y análisis de errores sobre el
   dataset público propuesto.

Para regenerar los notebooks desde cero:

```powershell
python scripts\build_notebooks.py
python scripts\ejecutar_notebooks.py
```

## Reproducibilidad

- **Python:** 3.13.5 (verificado en entorno de desarrollo)
- **Dependencias:** `requirements.txt` con rangos
  acotados (numpy, pandas, scikit-learn, matplotlib,
  seaborn, joblib, pytest, jupyter, nbformat, nbclient, ruff)
- **Semillas:** `random_state=42` en split, StratifiedKFold
  y SVC
- **Split:** `train_test_split(test_size=0.20,
  random_state=42, stratify=y)` → train 3 616 / test 905
- **Preprocessing:** dentro del `Pipeline`
  (`ColumnTransformer` con `SimpleImputer` +
  `StandardScaler` para numéricas y `SimpleImputer` +
  `OneHotEncoder` para categóricas); el test permanece
  aislado hasta la evaluación final
- **Descarga:** `src/inf8239_u01/data.py` valida
  HTTP/HTTPS, descarga a `data/raw/` y extrae el ZIP

## Resultados

Todas las evidencias numéricas se generan con
`python scripts\ejecutar_ejercicio01.py` y están en
`reports/`:

- `svm_metrics.csv` — métricas de baseline y SVM
- `svm_cv_results.csv` — resultados del GridSearchCV
- `confusion_matrix.png` — matriz sobre el conjunto test
- `svm_best.joblib` — pipeline final serializado
- `error_analysis.json` — FP/FN y report por clase

Resultados reales de la ejecución (test, n=905):

| Modelo   | Accuracy | Precision | Recall | F1 | F1 Macro | ROC-AUC |
| -------- | -------: | --------: | -----: | -: | -------: | ------: |
| Baseline | 0.8851 | 0.0000 | 0.0000 | 0.0000 | 0.4695 | — |
| SVM (C=10, gamma=scale) | 0.8707 | 0.3898 | 0.2212 | 0.2822 | 0.6056 | 0.6660 |

## Limitaciones

- El modelado usa `bank.csv` (10 % aleatorio) por
  viabilidad computacional de SVM (recomendación de UCI);
  la auditoría documenta la población completa.
- Target desbalanceado (~11.5 % `yes`): accuracy
  engañosa; se priorizan F1 macro, recall y ROC-AUC.
- Una sola entidad bancaria portuguesa (2008–2010).
- `duration` se excluye por leakage documentado.
- SVM RBF no es interpretable; no se infiere causalidad.

## Documentación

Ver `docs/` (índice en `docs/README.md` no aplica; los
archivos son: candidatos_dataset, ficha_dataset,
diccionario_datos, auditoria_dataset,
protocolo_experimental, conclusiones_ejercicio01,
evidencias_usuario, guia_entrega, acciones_requeridas).

## Licencia del proyecto

Código del proyecto: con fines académicos.
Dataset: CC BY 4.0 (UCI).
