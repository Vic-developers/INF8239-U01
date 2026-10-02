"""Descarga y carga reproducible de datasets públicos — INF-8239 U01.

Funciones para:

* validar que una URL sea HTTP/HTTPS;
* descargar un archivo a ``data/raw/``;
* cargarlo con pandas.

No se incluyen credenciales ni rutas absolutas del usuario.
"""

from __future__ import annotations

import urllib.request
import zipfile
from pathlib import Path
from urllib.parse import urlparse

import pandas as pd

from inf8239_u01.utils import DATA_RAW_DIR, PROJECT_ROOT, ensure_dirs


def validate_http_url(url: str) -> None:
    """Valida que la URL sea HTTP/HTTPS.

    Args:
        url: URL a validar.

    Raises:
        ValueError: Si la URL no usa esquema ``http`` o ``https``.
    """
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise ValueError(
            f"URL inválida: el esquema debe ser http o https (recibido: {url!r})"
        )


def download_dataset(url: str, filename: str | None = None) -> Path:
    """Descarga un dataset público a ``data/raw/``.

    Args:
        url: URL HTTP/HTTPS del archivo.
        filename: Nombre de archivo destino. Si es ``None`` se
            infiere de la URL.

    Returns:
        Ruta absoluta del archivo descargado (relativa al proyecto).

    Raises:
        ValueError: Si la URL no es HTTP/HTTPS.
        RuntimeError: Si la descarga falla.
    """
    validate_http_url(url)
    ensure_dirs()

    if filename is None:
        filename = Path(urlparse(url).path).name or "dataset.bin"

    dest = DATA_RAW_DIR / filename
    try:
        urllib.request.urlretrieve(url, dest)
    except Exception as exc:  # pragma: no cover - depende de red
        raise RuntimeError(f"No se pudo descargar {url}: {exc}") from exc
    return dest


def extract_zip(zip_path: str | Path, extract_to: str | Path | None = None) -> Path:
    """Extrae un archivo ZIP en ``data/raw/`` (o destino indicado).

    Args:
        zip_path: Ruta del ZIP.
        extract_to: Carpeta destino. Por defecto ``data/raw/``.

    Returns:
        Carpeta de destino con los archivos extraídos.
    """
    src = Path(zip_path)
    dest = Path(extract_to) if extract_to else DATA_RAW_DIR
    dest.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(src) as zf:
        zf.extractall(dest)
    return dest


def load_csv(path: str | Path) -> pd.DataFrame:
    """Carga un CSV con pandas.

    Args:
        path: Ruta (absoluta o relativa a la raíz del proyecto).

    Returns:
        DataFrame cargado.
    """
    p = Path(path)
    if not p.is_absolute():
        p = PROJECT_ROOT / p
    return pd.read_csv(p)
