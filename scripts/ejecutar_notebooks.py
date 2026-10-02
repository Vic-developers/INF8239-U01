"""Ejecuta los notebooks desde cero (kernel limpio) para validar
que funcionan con Run All sin estado previo.

El directorio de trabajo es `notebooks/` porque los notebooks
usan `Path.cwd().parent` como raíz del proyecto.
"""
from __future__ import annotations

import sys
from pathlib import Path

import nbformat
from nbclient import NotebookClient

ROOT = Path(__file__).resolve().parents[1]
NB_DIR = ROOT / "notebooks"

TIMEOUT = 900

for nombre in ["00_verificacion.ipynb", "01_svm_guiada.ipynb", "02_dataset_auditoria.ipynb"]:
    ruta = NB_DIR / nombre
    nb = nbformat.read(ruta, as_version=4)
    client = NotebookClient(
        nb,
        timeout=TIMEOUT,
        kernel_name="python3",
        resources={"metadata": {"path": str(NB_DIR)}},
    )
    print(f"Ejecutando {nombre} ...", flush=True)
    client.execute()
    nbformat.write(nb, ruta)
    # Verificar que no haya celdas con error
    errores = [
        c for c in nb.cells
        if c.cell_type == "code"
        and any(o.get("output_type") == "error" for o in c.get("outputs", []))
    ]
    if errores:
        print(f"  [FALLO] {nombre} TIENE ERRORES")
        sys.exit(1)
    print(f"  [OK] {nombre} ejecutado sin errores")

print("\nTodos los notebooks se ejecutaron de principio a fin.")
