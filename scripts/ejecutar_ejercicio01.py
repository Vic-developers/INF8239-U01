"""Ejecuta el Ejercicio 01 de INF-8239 U01 sobre el dataset candidato
propuesto (Bank Marketing, UCI 222) y genera las evidencias en
``reports/``.

Flujo (prevención de data leakage):

1. Carga de ``data/raw/bank-full.csv``.
2. Exclusión documentada de ``duration`` (variable de leakage según
   la propia documentación de UCI: no se conoce antes de la llamada).
3. Split train/test estratificado (test_size=0.20, random_state=42).
4. Preprocessing DENTRO del pipeline (ColumnTransformer).
5. Baseline: DummyClassifier(strategy="most_frequent").
6. SVM: build_svm() anidado en pipeline con preprocesamiento.
7. GridSearchCV SOLO sobre train (StratifiedKFold(5, shuffle=True,
   random_state=42), scoring="f1_macro").
8. Evaluación final SOLO sobre test.
9. Métricas, matriz de confusión, análisis de errores y modelo
   serializado en ``reports/``.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import joblib
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd
import seaborn as sns
from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyClassifier
from sklearn.impute import SimpleImputer
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import GridSearchCV, StratifiedKFold, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from inf8239_u01.models import build_svm  # noqa: E402
from inf8239_u01.utils import DATA_RAW_DIR, REPORTS_DIR, ensure_dirs  # noqa: E402

SEED = 42
TARGET = "y"
POSITIVE_CLASS = "yes"
LEAKAGE_VARS = ["duration"]  # documentado por UCI como post-outcome

# UCI provee bank.csv (muestra aleatoria del 10 %) específicamente
# "to test more computationally demanding machine learning
# algorithms (e.g., SVM)". Se usa esa variante por viabilidad
# computacional; la auditoría documenta la población completa
# (bank-full.csv, 45 211 filas).
BANK_URL = "https://archive.ics.uci.edu/static/public/222/bank+marketing.zip"
MODELING_FILE = "bank.csv"
FULL_FILE = "bank-full.csv"


def main() -> None:
    ensure_dirs()

    # --- 6. Carga -------------------------------------------------------
    csv_path = DATA_RAW_DIR / MODELING_FILE
    if not csv_path.exists():
        from inf8239_u01.data import download_dataset, extract_zip

        zip_path = download_dataset(BANK_URL, "bank-marketing.zip")
        extract_zip(zip_path)
    df = pd.read_csv(csv_path, sep=";")
    print(f"Filas: {len(df)}, columnas: {df.shape[1]}")

    # --- 12. Leakage: excluir 'duration' ------------------------------
    X = df.drop(columns=[TARGET] + LEAKAGE_VARS)
    y = df[TARGET]

    # --- 13. Train/test (mismo split para baseline y SVM) -------------
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, random_state=SEED, stratify=y
    )
    print(f"Train: {len(X_train)}, Test: {len(X_test)}")

    numeric_features = X.select_dtypes(include="number").columns.tolist()
    categorical_features = X.select_dtypes(exclude="number").columns.tolist()
    print(f"Numéricas: {numeric_features}")
    print(f"Categóricas: {categorical_features}")

    preprocessor = ColumnTransformer(
        transformers=[
            (
                "num",
                Pipeline(
                    steps=[
                        ("imputer", SimpleImputer(strategy="median")),
                        ("scaler", StandardScaler()),
                    ]
                ),
                numeric_features,
            ),
            (
                "cat",
                Pipeline(
                    steps=[
                        ("imputer", SimpleImputer(strategy="most_frequent")),
                        (
                            "onehot",
                            OneHotEncoder(handle_unknown="ignore"),
                        ),
                    ]
                ),
                categorical_features,
            ),
        ]
    )

    # --- 15. Baseline --------------------------------------------------
    baseline = DummyClassifier(strategy="most_frequent")
    baseline.fit(X_train, y_train)
    baseline_pred = baseline.predict(X_test)

    # --- 16-17. SVM con GridSearchCV SOLO sobre train ------------------
    svm_pipeline = Pipeline(
        steps=[
            ("preprocess", preprocessor),
            ("svm", build_svm(C=1.0, gamma="scale")),
        ]
    )

    param_grid = {
        "svm__model__C": [0.1, 1, 10],
        "svm__model__gamma": ["scale", 0.01, 0.1],
    }
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=SEED)
    grid = GridSearchCV(
        estimator=svm_pipeline,
        param_grid=param_grid,
        scoring="f1_macro",
        cv=cv,
        n_jobs=-1,
        return_train_score=False,
    )
    grid.fit(X_train, y_train)
    print(f"Mejores parámetros: {grid.best_params_}")
    print(f"Mejor F1 macro (CV): {grid.best_score_:.4f}")

    # --- 20. Resultados del GridSearchCV -------------------------------
    cv_results = pd.DataFrame(grid.cv_results_)[
        [
            "param_svm__model__C",
            "param_svm__model__gamma",
            "mean_test_score",
            "std_test_score",
            "rank_test_score",
        ]
    ].sort_values("rank_test_score")
    cv_results.to_csv(REPORTS_DIR / "svm_cv_results.csv", index=False)

    # --- 18. SVM: predicción final sobre TEST --------------------------
    best_model = grid.best_estimator_
    svm_pred = best_model.predict(X_test)
    svm_proba = best_model.predict_proba(X_test)
    proba_positive = svm_proba[:, list(best_model.classes_).index(POSITIVE_CLASS)]

    # --- 21/39. Métricas -----------------------------------------------
    def metrics(y_true, y_pred, proba=None) -> dict:
        m = {
            "accuracy": accuracy_score(y_true, y_pred),
            "precision": precision_score(
                y_true, y_pred, pos_label=POSITIVE_CLASS, average="binary"
            ),
            "recall": recall_score(
                y_true, y_pred, pos_label=POSITIVE_CLASS, average="binary"
            ),
            "f1": f1_score(y_true, y_pred, pos_label=POSITIVE_CLASS, average="binary"),
            "f1_macro": f1_score(y_true, y_pred, average="macro"),
        }
        if proba is not None:
            m["roc_auc"] = roc_auc_score(
                (y_true == POSITIVE_CLASS).astype(int), proba
            )
        else:
            m["roc_auc"] = float("nan")
        return m

    baseline_metrics = metrics(y_test, baseline_pred)
    svm_metrics = metrics(y_test, svm_pred, proba_positive)

    metrics_df = pd.DataFrame(
        {"Baseline": baseline_metrics, "SVM": svm_metrics}
    ).T
    metrics_df.index.name = "modelo"
    metrics_df.to_csv(REPORTS_DIR / "svm_metrics.csv")
    print(metrics_df)

    # --- 40. Matriz de confusión (SVM sobre test) ----------------------
    cm = confusion_matrix(y_test, svm_pred, labels=["no", "yes"])
    fig, ax = plt.subplots(figsize=(6, 5))
    sns.heatmap(
        cm,
        annot=True,
        fmt="d",
        cmap="Blues",
        xticklabels=["no (pred)", "yes (pred)"],
        yticklabels=["no (real)", "yes (real)"],
        ax=ax,
    )
    ax.set_title("Matriz de confusión — SVM (conjunto de test)")
    ax.set_ylabel("Clase real")
    ax.set_xlabel("Clase predicha")
    fig.tight_layout()
    fig.savefig(REPORTS_DIR / "confusion_matrix.png", dpi=150)
    plt.close(fig)

    # --- 41. Análisis de errores ---------------------------------------
    tn, fp, fn, tp = cm.ravel()
    error_analysis = {
        "falsos_positivos": int(fp),
        "falsos_negativos": int(fn),
        "verdaderos_positivos": int(tp),
        "verdaderos_negativos": int(tn),
        "tasa_falsos_positivos": round(fp / (fp + tn), 4),
        "tasa_falsos_negativos": round(fn / (fn + tp), 4),
        "precision_positivo": round(tp / (tp + fp), 4) if (tp + fp) else None,
        "recall_positivo": round(tp / (tp + fn), 4) if (tp + fn) else None,
        "report": classification_report(
            y_test, svm_pred, labels=["no", "yes"], output_dict=True
        ),
    }
    (REPORTS_DIR / "error_analysis.json").write_text(
        json.dumps(error_analysis, indent=2, ensure_ascii=False)
    )

    # --- 43. Modelo serializado ----------------------------------------
    joblib.dump(best_model, REPORTS_DIR / "svm_best.joblib")

    # Verificación de carga
    recargado = joblib.load(REPORTS_DIR / "svm_best.joblib")
    assert (recargado.predict(X_test) == svm_pred).all()

    print("\n=== Análisis de errores ===")
    print(f"FP (predijo 'yes', era 'no'): {fp}")
    print(f"FN (predijo 'no', era 'yes'): {fn}")
    print("Reportes generados en reports/")


if __name__ == "__main__":
    main()
