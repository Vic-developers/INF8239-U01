"""Tests del contrato de datos (LAB02) — dataset candidato propuesto.

Contrato del dataset candidato propuesto: **Bank Marketing** (UCI 222).
La auditoría documenta la población completa (``bank-full.csv``,
45 211 filas) y el modelado usa ``bank.csv`` (muestra aleatoria
del 10 %, 4 521 filas), variante que UCI provee para algoritmos
computacionalmente demandantes como SVM. Separador ``;``, target ``y``.

Si el dataset aún no existe en ``data/raw/``, los tests se omiten
(``pytest.skip``) hasta ejecutar la descarga reproducible.
"""

import pytest

from inf8239_u01.utils import DATA_RAW_DIR

DATASET_FILE = DATA_RAW_DIR / "bank.csv"
FULL_DATASET_FILE = DATA_RAW_DIR / "bank-full.csv"
SEP = ";"
TARGET = "y"

EXPECTED_COLUMNS = [
    "age",
    "job",
    "marital",
    "education",
    "default",
    "balance",
    "housing",
    "loan",
    "contact",
    "day",
    "month",
    "duration",
    "campaign",
    "pdays",
    "previous",
    "poutcome",
    "y",
]


@pytest.fixture(scope="module")
def df():
    if not DATASET_FILE.exists():
        pytest.skip("Dataset candidato no descargado (ejecutar notebooks/02 o scripts)")
    import pandas as pd

    return pd.read_csv(DATASET_FILE, sep=SEP)


def test_existen_columnas_esperadas(df) -> None:
    """Todas las columnas esperadas deben existir."""
    for col in EXPECTED_COLUMNS:
        assert col in df.columns


def test_existe_target(df) -> None:
    """La columna target 'y' debe existir."""
    assert TARGET in df.columns


def test_tipos_razonables(df) -> None:
    """Debe haber columnas numéricas y categóricas."""
    assert df.select_dtypes(include="number").shape[1] >= 5
    assert df.select_dtypes(exclude="number").shape[1] >= 5


def test_sin_columnas_completamente_vacias(df) -> None:
    """No debe haber columnas 100 % vacías."""
    vacias = df.columns[df.isna().all()].tolist()
    assert vacias == []


def test_tamaño_minimo(df) -> None:
    """El archivo de modelado debe tener al menos 4 000 filas."""
    assert len(df) >= 4000


def test_target_binario(df) -> None:
    """El target debe ser binario yes/no."""
    assert set(df[TARGET].unique()) == {"yes", "no"}


def test_sin_duplicados_exactos(df) -> None:
    """No debe haber filas duplicadas exactas."""
    assert df.duplicated().sum() == 0


def test_poblacion_completa_disponible() -> None:
    """La población completa (bank-full.csv) debe estar auditable."""
    if not FULL_DATASET_FILE.exists():
        pytest.skip("Población completa no descargada todavía")
    import pandas as pd

    full = pd.read_csv(FULL_DATASET_FILE, sep=SEP)
    assert len(full) >= 40000
    assert TARGET in full.columns
