"""Tests del pipeline SVM reutilizable (LAB01)."""

import numpy as np
import pytest
from sklearn.datasets import make_classification
from sklearn.pipeline import Pipeline

from inf8239_u01.models import build_svm


def test_build_svm_devuelve_pipeline() -> None:
    """Test 1: build_svm() debe devolver un Pipeline válido."""
    model = build_svm()
    assert isinstance(model, Pipeline)


def test_build_svm_contiene_pasos_nombrados() -> None:
    """Test 2: el pipeline debe contener los pasos 'scale' y 'model'."""
    model = build_svm()
    nombres = [name for name, _ in model.steps]
    assert "scale" in nombres
    assert "model" in nombres
    assert nombres == ["scale", "model"]


@pytest.mark.parametrize("C_invalido", [0, -1, -0.5])
def test_build_svm_rechaza_C_no_positivo(C_invalido: float) -> None:
    """Test 3: C <= 0 debe producir ValueError."""
    with pytest.raises(ValueError, match="C debe ser estrictamente positivo"):
        build_svm(C=C_invalido)


def test_build_svm_predice_numero_correcto_de_muestras() -> None:
    """Test 4: entrenar con datos sintéticos y verificar predicciones."""
    X, y = make_classification(
        n_samples=120,
        n_features=5,
        n_informative=3,
        n_classes=2,
        random_state=42,
    )
    model = build_svm(C=1.0, gamma="scale")
    model.fit(X, y)
    preds = model.predict(X)
    assert len(preds) == X.shape[0]
    assert set(np.unique(preds)) == set(np.unique(y))


def test_build_svm_acepta_gamma_numerico() -> None:
    """gamma numérico positivo debe ser aceptado."""
    model = build_svm(C=10.0, gamma=0.1)
    assert isinstance(model, Pipeline)


def test_build_svm_rechaza_gamma_numerico_no_positivo() -> None:
    """gamma numérico <= 0 debe producir ValueError."""
    with pytest.raises(ValueError, match="gamma"):
        build_svm(gamma=0.0)
