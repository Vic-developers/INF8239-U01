"""Modelos reutilizables del Ejercicio 01 — INF-8239 U01.

Proporciona un pipeline SVM reproducible (StandardScaler + SVC) con pasos
nombrados ``scale`` y ``model``. El escalado vive DENTRO del pipeline para
evitar data leakage: nunca se debe escalar el dataset completo antes del
split train/test.
"""

from __future__ import annotations

from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC


def build_svm(C: float = 1.0, gamma: str | float = "scale") -> Pipeline:
    """Construye un pipeline SVM reproducible: StandardScaler → SVC.

    Args:
        C: Parámetro de regularización del SVC. Debe ser estrictamente positivo.
        gamma: Kernel coefficient para RBF. ``"scale"`` por defecto o un
            valor numérico positivo.

    Returns:
        Pipeline con pasos nombrados ``scale`` (StandardScaler) y
        ``model`` (SVC con kernel RBF).

    Raises:
        ValueError: Si ``C <= 0`` o ``gamma`` numérico no es positivo.
    """
    if not isinstance(C, (int, float)):
        raise ValueError(f"C debe ser numérico, recibido: {type(C).__name__}")
    if C <= 0:
        raise ValueError(f"C debe ser estrictamente positivo (C > 0), recibido: {C}")
    if isinstance(gamma, (int, float)) and gamma <= 0:
        raise ValueError(
            f"gamma numérico debe ser estrictamente positivo, recibido: {gamma}"
        )

    return Pipeline(
        steps=[
            ("scale", StandardScaler()),
            (
                "model",
                SVC(
                    kernel="rbf",
                    C=float(C),
                    gamma=gamma,
                    probability=True,
                    random_state=42,
                ),
            ),
        ]
    )
