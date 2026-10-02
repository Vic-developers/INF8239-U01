"""Auditoría real de los datasets candidatos — genera evidencia verificable.

Produce una salida JSON con estadísticas reales que se usan para
documentar candidatos_dataset.md, ficha_dataset.md,
diccionario_datos.md y auditoria_dataset.md.
"""
import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"

CANDIDATES = {
    "A_wine_red": dict(file="winequality-red.csv", sep=";", target="quality"),
    "A_wine_white": dict(file="winequality-white.csv", sep=";", target="quality"),
    "B_bank": dict(file="bank-full.csv", sep=";", target="y"),
}

report = {}
for key, cfg in CANDIDATES.items():
    df = pd.read_csv(RAW / cfg["file"], sep=cfg["sep"])
    y = df[cfg["target"]]
    report[key] = {
        "file": cfg["file"],
        "rows": int(len(df)),
        "cols": int(df.shape[1]),
        "columns": list(df.columns),
        "dtypes": {c: str(t) for c, t in df.dtypes.items()},
        "missing_total": int(df.isna().sum().sum()),
        "missing_pct": round(float(df.isna().sum().sum() / df.size * 100), 4),
        "missing_by_col": {c: int(v) for c, v in df.isna().sum().items() if v > 0},
        "duplicates": int(df.duplicated().sum()),
        "target": cfg["target"],
        "target_classes": {str(k): int(v) for k, v in y.value_counts().sort_index().items()},
        "target_nunique": int(y.nunique()),
        "numeric_cols": int(df.select_dtypes(include="number").shape[1]),
        "categorical_cols": int(df.select_dtypes(exclude="number").shape[1]),
        "constant_cols": [c for c in df.columns if df[c].nunique(dropna=False) == 1],
        "high_cardinality": [
            c
            for c in df.select_dtypes(exclude="number").columns
            if df[c].nunique() > 20
        ],
    }

out = ROOT / "data" / "processed" / "audit_report.json"
out.write_text(json.dumps(report, indent=2, ensure_ascii=False))
print(json.dumps(report, indent=2, ensure_ascii=False))
