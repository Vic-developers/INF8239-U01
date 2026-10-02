"""Construye los tres notebooks del Ejercicio 01 (LAB00, LAB01, LAB02).

Los notebooks se generan programáticamente con nbformat para
garantizar que son reproducibles y se pueden ejecutar con
"Kernel nuevo → Run All" sin estado previo.
"""
from __future__ import annotations

from pathlib import Path

import nbformat as nbf

ROOT = Path(__file__).resolve().parents[1]
NB_DIR = ROOT / "notebooks"
NB_DIR.mkdir(exist_ok=True)


def md(text: str) -> dict:
    return nbf.v4.new_markdown_cell(text)


def code(text: str) -> dict:
    return nbf.v4.new_code_cell(text)


def build_notebook(cells: list) -> nbf.NotebookNode:
    nb = nbf.v4.new_notebook()
    nb["metadata"]["kernelspec"] = {
        "display_name": "Python 3",
        "language": "python",
        "name": "python3",
    }
    nb["metadata"]["language_info"] = {"name": "python", "version": "3.13"}
    nb.cells = cells
    return nb


# ----------------------------------------------------------------------
# LAB00 — 00_verificacion.ipynb
# ----------------------------------------------------------------------
lab00 = build_notebook(
    [
        md(
            "# LAB00 — Verificación del entorno\n\n"
            "**INF-8239 Ciencia de Datos II · Unidad 01 · Ejercicio 01**\n\n"
            "Este notebook verifica que el entorno esté correctamente "
            "configurado antes de comenzar. Se puede ejecutar de "
            "principio a fin con *Kernel nuevo → Run All*."
        ),
        md("## 1. Versiones de Python y bibliotecas"),
        code(
            "import sys\n"
            "import platform\n\n"
            "print('Sistema operativo:', platform.system(), platform.release())\n"
            "print('Python:', sys.version)"
        ),
        code(
            "import numpy as np\n"
            "import pandas as pd\n"
            "import sklearn\n"
            "import matplotlib\n"
            "import seaborn as sns\n"
            "import joblib\n\n"
            "print('NumPy:', np.__version__)\n"
            "print('pandas:', pd.__version__)\n"
            "print('scikit-learn:', sklearn.__version__)\n"
            "print('matplotlib:', matplotlib.__version__)\n"
            "print('seaborn:', sns.__version__)\n"
            "print('joblib:', joblib.__version__)"
        ),
        md("## 2. Herramientas de desarrollo"),
        code(
            "import pytest\n"
            "import nbformat\n"
            "import nbclient\n\n"
            "print('pytest:', pytest.__version__)\n"
            "print('nbformat:', nbformat.__version__)\n"
            "print('nbclient:', nbclient.__version__)"
        ),
        code(
            "import subprocess\n\n"
            "try:\n"
            "    git_version = subprocess.run(\n"
            "        ['git', '--version'], capture_output=True, text=True, check=True\n"
            "    ).stdout.strip()\n"
            "    print('Git:', git_version)\n"
            "except FileNotFoundError:\n"
            "    print('Git: NO disponible')"
        ),
        md("## 3. Módulo del proyecto (`src`)"),
        code(
            "import sys\n"
            "from pathlib import Path\n\n"
            "ROOT = Path.cwd().parent\n"
            "sys.path.insert(0, str(ROOT / 'src'))\n\n"
            "from inf8239_u01.environment import environment_message\n\n"
            "mensaje = environment_message()\n"
            "print('Mensaje del entorno:', mensaje)\n"
            "assert mensaje == 'Entorno INF-8239 listo', 'El mensaje no coincide'"
        ),
        md("## 4. Estructura del proyecto"),
        code(
            "from pathlib import Path\n\n"
            "esperadas = [\n"
            "    'data/raw', 'data/processed', 'docs', 'notebooks',\n"
            "    'reports', 'src/inf8239_u01', 'tests',\n"
            "    'README.md', 'requirements.txt', 'pyproject.toml',\n"
            "]\n"
            "for item in esperadas:\n"
            "    existe = (ROOT / item).exists()\n"
            "    print(f\"{'OK ' if existe else 'FALTA'}  {item}\")\n"
            "    assert existe, f'Falta: {item}'"
        ),
        md(
            "## 5. Ejecución de la suite de tests\n\n"
            "Ejecutar `pytest -q` desde la raíz del proyecto.\n"
            "En el notebook se muestra una verificación ligera de "
            "que los tests existen y son descubribles."
        ),
        code(
            "import pytest\n\n"
            "resultado = pytest.main(['-q', str(ROOT / 'tests')])\n"
            "print('Código de salida de pytest:', resultado)\n"
            "assert resultado == 0, 'Algun test falló'"
        ),
        md(
            "## Conclusión del LAB00\n\n"
            "El entorno (Python 3.13, NumPy, pandas, scikit-learn, "
            "matplotlib, seaborn, joblib, pytest, Jupyter, nbformat, "
            "nbclient y Git) está verificado y el módulo "
            "`inf8239_u01` responde correctamente."
        ),
    ]
)

# ----------------------------------------------------------------------
# LAB01 — 01_svm_guiada.ipynb
# ----------------------------------------------------------------------
lab01 = build_notebook(
    [
        md(
            "# LAB01 — SVM guiada (práctica metodológica)\n\n"
            "**INF-8239 Ciencia de Datos II · Unidad 01 · Ejercicio 01**\n\n"
            "Este notebook practica la metodología completa "
            "(split → baseline → pipeline SVM → GridSearchCV → métricas) "
            "usando el dataset `load_breast_cancer` de scikit-learn.\n\n"
            "> ⚠️ **Advertencia académica:** Este experimento tiene "
            "finalidad exclusivamente educativa y metodológica. Los "
            "resultados no constituyen una herramienta médica ni deben "
            "utilizarse para diagnóstico o decisiones clínicas.\n\n"
            "Este dataset es **solo práctica guiada**; el dataset final "
            "del Ejercicio 01 se selecciona y audita en el LAB02 "
            "(`02_dataset_auditoria.ipynb`)."
        ),
        md("## 1. Carga del dataset de práctica"),
        code(
            "import sys\n"
            "from pathlib import Path\n\n"
            "ROOT = Path.cwd().parent\n"
            "sys.path.insert(0, str(ROOT / 'src'))\n\n"
            "from sklearn.datasets import load_breast_cancer\n\n"
            "data = load_breast_cancer(as_frame=True)\n"
            "X = data.frame.drop(columns='target')\n"
            "y = data.frame['target']\n\n"
            "print('Muestras:', X.shape[0])\n"
            "print('Variables predictoras:', X.shape[1])\n"
            "print('Clases:', sorted(y.unique().tolist()))\n"
            "print('Distribución de clases:')\n"
            "print(y.value_counts())"
        ),
        md("## 2. Split estratificado train/test"),
        code(
            "from sklearn.model_selection import train_test_split\n\n"
            "X_train, X_test, y_train, y_test = train_test_split(\n"
            "    X, y, test_size=0.20, random_state=42, stratify=y\n"
            ")\n\n"
            "print('Train:', X_train.shape, '| Test:', X_test.shape)\n"
            "print('Distribución train:', y_train.value_counts().to_dict())\n"
            "print('Distribución test:', y_test.value_counts().to_dict())"
        ),
        md("## 3. Baseline — DummyClassifier"),
        code(
            "from sklearn.dummy import DummyClassifier\n"
            "from sklearn.metrics import f1_score, accuracy_score\n\n"
            "baseline = DummyClassifier(strategy='most_frequent')\n"
            "baseline.fit(X_train, y_train)\n"
            "pred_base = baseline.predict(X_test)\n\n"
            "print('Accuracy baseline:', round(accuracy_score(y_test, pred_base), 4))\n"
            "print('F1 macro baseline:', round(f1_score(y_test, pred_base, average='macro'), 4))"
        ),
        md(
            "## 4. Pipeline SVM (StandardScaler → SVC)\n\n"
            "El escalado vive **dentro** del pipeline: nunca se escala "
            "el dataset completo antes del split (prevención de "
            "data leakage)."
        ),
        code(
            "from inf8239_u01.models import build_svm\n\n"
            "svm = build_svm(C=1.0, gamma='scale')\n"
            "print(svm)\n"
            "svm.fit(X_train, y_train)\n"
            "pred_svm = svm.predict(X_test)\n\n"
            "print('Accuracy SVM:', round(accuracy_score(y_test, pred_svm), 4))\n"
            "print('F1 macro SVM:', round(f1_score(y_test, pred_svm, average='macro'), 4))"
        ),
        md("## 5. GridSearchCV (SOLO sobre entrenamiento)"),
        code(
            "from sklearn.model_selection import GridSearchCV, StratifiedKFold\n\n"
            "param_grid = {\n"
            "    'model__C': [0.1, 1, 10],\n"
            "    'model__gamma': ['scale', 0.01, 0.1],\n"
            "}\n"
            "cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)\n"
            "grid = GridSearchCV(\n"
            "    estimator=build_svm(),\n"
            "    param_grid=param_grid,\n"
            "    scoring='f1_macro',\n"
            "    cv=cv,\n"
            "    n_jobs=-1,\n"
            ")\n"
            "grid.fit(X_train, y_train)\n\n"
            "print('Mejores parámetros:', grid.best_params_)\n"
            "print('Mejor F1 macro (CV):', round(grid.best_score_, 4))"
        ),
        md("## 6. Métricas finales sobre el conjunto de test"),
        code(
            "from sklearn.metrics import classification_report, roc_auc_score\n\n"
            "best = grid.best_estimator_\n"
            "pred_best = best.predict(X_test)\n"
            "proba_best = best.predict_proba(X_test)[:, 1]\n\n"
            "print(classification_report(y_test, pred_best))\n"
            "print('ROC-AUC:', round(roc_auc_score(y_test, proba_best), 4))"
        ),
        md(
            "## Conclusión del LAB01\n\n"
            "Se practicó el flujo metodológico completo con split "
            "estratificado, baseline `DummyClassifier`, pipeline "
            "SVM con escalado interno y búsqueda de hiperparámetros "
            "mediante validación cruzada estratificada. Esta misma "
            "estructura se aplica al dataset público seleccionado en "
            "el LAB02."
        ),
    ]
)

# ----------------------------------------------------------------------
# LAB02 — 02_dataset_auditoria.ipynb
# ----------------------------------------------------------------------
lab02 = build_notebook(
    [
        md(
            "# LAB02 — Dataset público: auditoría y SVM reproducible\n\n"
            "**INF-8239 Ciencia de Datos II · Unidad 01 · Ejercicio 01**\n\n"
            "**Estado: PENDIENTE DE APROBACIÓN DEL DOCENTE**\n\n"
            "Este notebook sigue el orden requerido:\n\n"
            "1. Objetivo · 2. Pregunta · 3. Dataset · 4. Fuente · "
            "5. Licencia · 6. Descarga · 7. Carga · 8. Estructura · "
            "9. Auditoría · 10. Diccionario · 11. Target · "
            "12. Leakage · 13. Train/test · 14. Preprocessing · "
            "15. Baseline · 16. SVM · 17. Métricas · "
            "18. Análisis de errores · 19. Limitaciones · "
            "20. Conclusión"
        ),
        md(
            "## 1. Objetivo\n\n"
            "Integrar las evidencias de LAB00, LAB01 y LAB02 en una "
            "entrega individual, ejecutable y reproducible: selección "
            "de dataset público, auditoría, prevención de data "
            "leakage, baseline, SVM reproducible, métricas y análisis "
            "de errores."
        ),
        md(
            "## 2. Pregunta de investigación\n\n"
            "¿Es posible predecir, a partir de variables disponibles "
            "**antes** del resultado, si un cliente de una entidad "
            "bancaria portuguesa suscribirá un depósito a plazo "
            "(variable `y`) durante una campaña de telemarketing?\n\n"
            "Se excluye explícitamente `duration` (duración de la "
            "última llamada) porque, según la documentación oficial "
            "de UCI, solo se conoce **después** de realizar la llamada "
            "y afecta fuertemente al resultado: incluirla sería "
            "data leakage."
        ),
        md(
            "## 3. Dataset y 4. Fuente\n\n"
            "- **Nombre:** Bank Marketing\n"
            "- **Fuente:** UCI Machine Learning Repository (dataset 222)\n"
            "- **URL:** https://archive.ics.uci.edu/dataset/222/bank+marketing\n"
            "- **DOI:** 10.24432/C5K306\n"
            "- **Autores:** Sérgio Moro, Paulo Cortez, Rita (Universidad "
            "del Minho, Portugal)\n"
            "- **Artículo:** *A data-driven approach to predict the "
            "success of bank telemarketing*, Decision Support Systems, 2014\n\n"
            "**Candidato comparado:** Wine Quality (UCI 186, DOI "
            "10.24432/C56S3T, CC BY 4.0). La comparación completa está "
            "en `docs/candidatos_dataset.md`."
        ),
        md(
            "## 5. Licencia\n\n"
            "**Creative Commons Attribution 4.0 International (CC BY 4.0)** "
            "— verificada en la página oficial de UCI. Permite compartir "
            "y adaptar con atribución adecuada."
        ),
        md("## 6. Descarga reproducible"),
        code(
            "import sys\n"
            "from pathlib import Path\n\n"
            "ROOT = Path.cwd().parent\n"
            "sys.path.insert(0, str(ROOT / 'src'))\n\n"
            "from inf8239_u01.data import download_dataset, extract_zip\n"
            "from inf8239_u01.utils import DATA_RAW_DIR\n\n"
            "BANK_URL = 'https://archive.ics.uci.edu/static/public/222/bank+marketing.zip'\n"
            "csv_path = DATA_RAW_DIR / 'bank.csv'\n\n"
            "if not csv_path.exists():\n"
            "    zip_path = download_dataset(BANK_URL, 'bank-marketing.zip')\n"
            "    extract_zip(zip_path)\n"
            "    print('Descargado y extraído:', zip_path)\n"
            "else:\n"
            "    print('Ya existe:', csv_path)"
        ),
        md("## 7. Carga"),
        code(
            "import pandas as pd\n\n"
            "df = pd.read_csv(csv_path, sep=';')\n"
            "print('Archivo de modelado: bank.csv (muestra aleatoria del 10 %)')\n"
            "print('Forma:', df.shape)"
        ),
        md("## 8. Estructura"),
        code(
            "print('Filas:', len(df))\n"
            "print('Columnas:', df.shape[1])\n"
            "print('\\nTipos:')\n"
            "print(df.dtypes)\n"
            "print('\\nDuplicados exactos:', df.duplicated().sum())"
        ),
        md("## 9. Auditoría"),
        code(
            "auditoria = {\n"
            "    'filas': len(df),\n"
            "    'columnas': df.shape[1],\n"
            "    'missing_total': int(df.isna().sum().sum()),\n"
            "    'missing_pct': round(df.isna().sum().sum() / df.size * 100, 4),\n"
            "    'duplicados': int(df.duplicated().sum()),\n"
            "    'numericas': df.select_dtypes(include='number').shape[1],\n"
            "    'categoricas': df.select_dtypes(exclude='number').shape[1],\n"
            "    'constantes': [c for c in df.columns if df[c].nunique(dropna=False) == 1],\n"
            "    'alta_cardinalidad': [\n"
            "        c for c in df.select_dtypes(exclude='number').columns\n"
            "        if df[c].nunique() > 20\n"
            "    ],\n"
            "}\n"
            "for k, v in auditoria.items():\n"
            "    print(f'{k}: {v}')"
        ),
        md(
            "## 10. Diccionario de datos (resumen)\n\n"
            "El diccionario completo está en `docs/diccionario_datos.md`. "
            "Variables predictoras: `age, job, marital, education, "
            "default, balance, housing, loan, contact, day, month, "
            "campaign, pdays, previous, poutcome`. Target: `y`. "
            "Excluida por leakage: `duration`. Identificadores: no "
            "existen (no hay ID de cliente)."
        ),
        md("## 11. Target"),
        code(
            "print('Distribución del target:')\n"
            "print(df['y'].value_counts())\n"
            "print('\\nPorcentaje:')\n"
            "print((df['y'].value_counts(normalize=True) * 100).round(2))\n"
            "print('\\nNúmero de clases:', df['y'].nunique())"
        ),
        md(
            "## 12. Leakage\n\n"
            "Investigación explícita:\n\n"
            "- **Información posterior al evento:** `duration` (duración "
            "de la última llamada) solo se conoce después de realizar "
            "el contacto y, según UCI, *highly affects the output "
            "target*. **Se excluye**.\n"
            "- **Variables derivadas del target:** no se detectan.\n"
            "- **Identificadores:** no existe columna de ID de cliente.\n"
            "- **Variables de resultado:** únicamente `y`, que es el "
            "target legítimo.\n\n"
            "`campaign`, `pdays`, `previous` y `poutcome` se refieren a "
            "contactos **previos o de la campaña actual** y están "
            "disponibles antes de la decisión final del cliente; se "
            "conservan como predictoras legítimas."
        ),
        code(
            "LEAKAGE_VARS = ['duration']\n"
            "X = df.drop(columns=['y'] + LEAKAGE_VARS)\n"
            "y = df['y']\n"
            "print('Predictoras (sin leakage):', list(X.columns))"
        ),
        md("## 13. Train/test (mismo split para baseline y SVM)"),
        code(
            "from sklearn.model_selection import train_test_split\n\n"
            "X_train, X_test, y_train, y_test = train_test_split(\n"
            "    X, y, test_size=0.20, random_state=42, stratify=y\n"
            ")\n"
            "print('Train:', X_train.shape, '| Test:', X_test.shape)\n"
            "print('Target train:', y_train.value_counts().to_dict())\n"
            "print('Target test:', y_test.value_counts().to_dict())"
        ),
        md(
            "## 14. Preprocessing DENTRO del pipeline\n\n"
            "- Numéricas: `SimpleImputer(median)` + `StandardScaler`\n"
            "- Categóricas: `SimpleImputer(most_frequent)` + "
            "`OneHotEncoder(handle_unknown='ignore')`\n\n"
            "Todo el preprocessing se aprende **solo** con los datos de "
            "entrenamiento (el `ColumnTransformer` vive dentro del "
            "pipeline); el conjunto de test permanece aislado hasta la "
            "evaluación final."
        ),
        code(
            "from sklearn.compose import ColumnTransformer\n"
            "from sklearn.impute import SimpleImputer\n"
            "from sklearn.pipeline import Pipeline\n"
            "from sklearn.preprocessing import OneHotEncoder, StandardScaler\n\n"
            "numericas = X.select_dtypes(include='number').columns.tolist()\n"
            "categoricas = X.select_dtypes(exclude='number').columns.tolist()\n\n"
            "preprocessor = ColumnTransformer(\n"
            "    transformers=[\n"
            "        ('num', Pipeline(steps=[\n"
            "            ('imputer', SimpleImputer(strategy='median')),\n"
            "            ('scaler', StandardScaler())]), numericas),\n"
            "        ('cat', Pipeline(steps=[\n"
            "            ('imputer', SimpleImputer(strategy='most_frequent')),\n"
            "            ('onehot', OneHotEncoder(handle_unknown='ignore'))]), categoricas),\n"
            "    ]\n"
            ")\n"
            "print('Preprocessor listo. Numéricas:', len(numericas), "
            "'Categóricas:', len(categoricas))"
        ),
        md("## 15. Baseline"),
        code(
            "from sklearn.dummy import DummyClassifier\n\n"
            "baseline = DummyClassifier(strategy='most_frequent')\n"
            "baseline.fit(X_train, y_train)\n"
            "pred_baseline = baseline.predict(X_test)\n"
            "print('Baseline: predice siempre la clase mayoritaria "
            "(\"no\") sobre el MISMO split.')"
        ),
        md("## 16. SVM reproducible + GridSearchCV (solo train)"),
        code(
            "from inf8239_u01.models import build_svm\n"
            "from sklearn.model_selection import GridSearchCV, StratifiedKFold\n\n"
            "svm_pipeline = Pipeline(steps=[\n"
            "    ('preprocess', preprocessor),\n"
            "    ('svm', build_svm(C=1.0, gamma='scale')),\n"
            "])\n\n"
            "param_grid = {\n"
            "    'svm__model__C': [0.1, 1, 10],\n"
            "    'svm__model__gamma': ['scale', 0.01, 0.1],\n"
            "}\n"
            "cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)\n"
            "grid = GridSearchCV(\n"
            "    estimator=svm_pipeline,\n"
            "    param_grid=param_grid,\n"
            "    scoring='f1_macro',\n"
            "    cv=cv,\n"
            "    n_jobs=-1,\n"
            ")\n"
            "grid.fit(X_train, y_train)\n"
            "print('Mejores parámetros:', grid.best_params_)\n"
            "print('Mejor F1 macro (CV):', round(grid.best_score_, 4))"
        ),
        md("## 17. Métricas finales sobre test"),
        code(
            "from sklearn.metrics import (\n"
            "    accuracy_score, classification_report, f1_score,\n"
            "    precision_score, recall_score, roc_auc_score,\n"
            ")\n\n"
            "best = grid.best_estimator_\n"
            "pred = best.predict(X_test)\n"
            "proba = best.predict_proba(X_test)[:, list(best.classes_).index('yes')]\n\n"
            "print('Accuracy :', round(accuracy_score(y_test, pred), 4))\n"
            "print('Precision:', round(precision_score(y_test, pred, pos_label='yes'), 4))\n"
            "print('Recall   :', round(recall_score(y_test, pred, pos_label='yes'), 4))\n"
            "print('F1       :', round(f1_score(y_test, pred, pos_label='yes'), 4))\n"
            "print('F1 macro :', round(f1_score(y_test, pred, average='macro'), 4))\n"
            "print('ROC-AUC  :', round(roc_auc_score((y_test == 'yes').astype(int), proba), 4))\n"
            "print('\\n', classification_report(y_test, pred))"
        ),
        md("## 18. Análisis de errores"),
        code(
            "from sklearn.metrics import confusion_matrix\n\n"
            "cm = confusion_matrix(y_test, pred, labels=['no', 'yes'])\n"
            "tn, fp, fn, tp = cm.ravel()\n"
            "print('Matriz de confusión [[TN, FP], [FN, TP]]:')\n"
            "print(cm)\n"
            "print('Falsos positivos (predijo yes, era no):', fp,\n"
            "      '(' + str(round(fp / (fp + tn) * 100, 1)) + '% de los realmente no)')\n"
            "print('Falsos negativos (predijo no, era yes):', fn,\n"
            "      '(' + str(round(fn / (fn + tp) * 100, 1)) + '% de los realmente yes)')\n"
            "print('El SVM pierde', fn + fp, 'de', len(y_test), 'casos;',\n"
            "      'el baseline perdería', fn + tp, '(todos los yes).')"
        ),
        md(
            "## 19. Limitaciones\n\n"
            "- El modelado usa `bank.csv` (10 % aleatorio) por "
            "viabilidad computacional de SVM, tal como recomienda UCI; "
            "la auditoría documenta la población completa "
            "(`bank-full.csv`).\n"
            "- El target está desbalanceado (~11.5 % `yes`): las "
            "métricas macro y el recall son los indicadores más "
            "relevantes.\n"
            "- Los datos provienen de una sola entidad bancaria "
            "portuguesa (2008–2010): la generalización a otros "
            "mercados o épocas no está garantizada.\n"
            "- SVM con kernel RBF no produce coeficientes "
            "interpretables; no se infiere causalidad."
        ),
        md(
            "## 20. Conclusión\n\n"
            "La conclusión completa (300–500 palabras) con los "
            "resultados reales se redacta en "
            "`docs/conclusiones_ejercicio01.md` una vez ejecutado el "
            "notebook; los valores numéricos provienen "
            "exclusivamente de esta ejecución y se exportan a "
            "`reports/svm_metrics.csv`, `reports/svm_cv_results.csv`, "
            "`reports/confusion_matrix.png` y "
            "`reports/svm_best.joblib` mediante "
            "`scripts/ejecutar_ejercicio01.py`.\n\n"
            "**Estado del dataset: PENDIENTE DE APROBACIÓN DEL "
            "DOCENTE.**"
        ),
    ]
)

for nombre, nb in [
    ("00_verificacion.ipynb", lab00),
    ("01_svm_guiada.ipynb", lab01),
    ("02_dataset_auditoria.ipynb", lab02),
]:
    ruta = NB_DIR / nombre
    nbf.write(nb, ruta)
    print("Generado:", ruta)
