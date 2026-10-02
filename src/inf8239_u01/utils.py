"""Utilidades compartidas del Ejercicio 01 — INF-8239 U01.

Contiene ayudantes de rutas relativas al proyecto para garantizar que el
código sea reproducible y no dependa de rutas absolutas del usuario.
"""

from __future__ import annotations

from pathlib import Path

# Raíz del proyecto: <proyecto>/src/inf8239_u01/utils.py → sube 3 niveles
PROJECT_ROOT = Path(__file__).resolve().parents[2]

DATA_RAW_DIR = PROJECT_ROOT / "data" / "raw"
DATA_PROCESSED_DIR = PROJECT_ROOT / "data" / "processed"
REPORTS_DIR = PROJECT_ROOT / "reports"


def ensure_dirs() -> None:
    """Crea las carpetas de datos y reportes si no existen."""
    DATA_RAW_DIR.mkdir(parents=True, exist_ok=True)
    DATA_PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)


def project_path(relative: str) -> Path:
    """Devuelve una ruta absoluta relativa a la raíz del proyecto.

    Args:
        relative: Ruta relativa (ej. ``"reports/metrics.csv"``).

    Returns:
        Path absoluto dentro del proyecto.
    """
    return (PROJECT_ROOT / relative).resolve()
