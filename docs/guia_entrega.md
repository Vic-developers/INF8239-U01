# Guía de entrega — checklist de rúbrica

**INF-8239 Ciencia de Datos II · Unidad 01 · Ejercicio 01**

Estado global: **Preparación técnica completada —
aprobación del dataset pendiente.**

| Requisito | Evidencia | Archivo | Estado |
| --------- | --------- | ------- | ------ |
| Selección dataset | Comparación de 2 candidatos con datos reales | candidatos_dataset.md | PASS |
| Procedencia | Fuente, autores, DOI, artículo verificados en UCI | ficha_dataset.md | PASS |
| Licencia | CC BY 4.0 verificada en página oficial UCI | ficha_dataset.md | PASS |
| Pregunta | Pregunta de investigación definida y defendible | ficha_dataset.md | PASS |
| Auditoría | Estructura, missing, target, predictoras (valores reales) | auditoria_dataset.md | PASS |
| Diccionario | Tabla variable/tipo/rol/riesgo | diccionario_datos.md | PASS |
| Leakage | Investigación explícita; `duration` excluida | auditoria_dataset.md | PASS |
| Baseline | DummyClassifier con métricas reales | reports/svm_metrics.csv | PASS |
| SVM | Pipeline funcional `build_svm()` + GridSearchCV | src/inf8239_u01/models.py | PASS |
| Métricas | CSV generado por código (no manual) | reports/svm_metrics.csv | PASS |
| Errores | Matriz + análisis FP/FN real | reports/confusion_matrix.png, error_analysis.json | PASS |
| Tests | `pytest -q` verde | tests/ | PASS |
| README | Instalación, reproducibilidad, resultados | README.md | PASS |
| Git | Repositorio inicializado con commits | .git | PASS |
| Conclusión | 300–500 palabras con resultados reales | conclusiones_ejercicio01.md | PASS |
| PDF | Entrega breve generada con pandoc/XeLaTeX | reports/ejercicio01_entrega.pdf | PASS |

## Notas de honestidad

- Ningún número de este proyecto fue escrito a
  mano: todos provienen de ejecuciones reales
  (`scripts/audit_candidates.py` y
  `scripts/ejecutar_ejercicio01.py`).
- El dataset propuesto está **pendiente de
  aprobación del docente**; si se aprueba otro
  dataset, el pipeline se re-ejecuta con
  `python scripts\ejecutar_ejercicio01.py`.
- El modelado usa `bank.csv` (10 % aleatorio),
  variante que UCI provee explícitamente para SVM;
  la auditoría documenta la población completa.
