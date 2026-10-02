# Datos — INF-8239 U01

## `data/raw/`

Descargas reproducibles desde UCI (generadas por
`src/inf8239_u01/data.py`):

- `bank-marketing.zip` — ZIP oficial del dataset 222.
- `bank-full.csv` — población completa (45 211
  filas); usado para auditoría.
- `bank.csv` — muestra aleatoria del 10 % (4 521
  filas); usada para modelado SVM (recomendada por
  UCI para algoritmos computacionalmente
  demandantes).
- `winequality.zip`, `winequality-red.csv`,
  `winequality-white.csv`, `winequality.names` —
  dataset candidato A (Wine Quality, UCI 186).
- `bank.zip`, `bank-additional.zip` — variantes
  adicionales extraídas del ZIP oficial.

## `data/processed/`

Artefactos derivados del análisis:

- `audit_report.json` — auditoría real generada por
  `scripts/audit_candidates.py`.

## Regeneración

```powershell
python scripts\audit_candidates.py
```

Los archivos se re-descargan automáticamente si se
eliminan (ver `notebooks/02_dataset_auditoria.ipynb`
y `scripts/ejecutar_ejercicio01.py`).
