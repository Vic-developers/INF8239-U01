# Solicitud de aprobación del dataset — Ejercicio 01

**INF-8239 Ciencia de Datos II · Unidad 01**

Texto listo para enviar al docente (copiar y pegar en el canal que la
institución use: aula virtual, correo o mensaje directo).

---

## Asunto sugerido

Solicitud de aprobación de dataset — Ejercicio 01 (Unidad 01)

## Mensaje

Estimado/a docente:

Le escribo para solicitar la aprobación del dataset propuesto para el
Ejercicio 01 (Dataset público y SVM reproducible).

**Dataset propuesto:** Bank Marketing
- **Fuente:** UCI Machine Learning Repository (dataset 222)
- **URL:** https://archive.ics.uci.edu/dataset/222/bank+marketing
- **Licencia:** Creative Commons Attribution 4.0 International (CC BY 4.0)
- **DOI:** 10.24432/C5K306
- **Autores:** Sérgio Moro, Paulo Cortez, Rita (Universidad del Minho,
  Portugal), 2014

**Pregunta de investigación:** ¿es posible predecir, a partir de
variables disponibles antes del resultado, si un cliente suscribirá un
depósito a plazo (variable `y`) durante una campaña de telemarketing?

**Justificación de la selección:**
- Problema de clasificación binaria con desbalance realista
  (~11.5 % de positivos), adecuado para evaluar métricas más allá del
  accuracy.
- Mezcla de variables numéricas (6) y categóricas (9), lo que permite
  ejercitar preprocessing completo (`ColumnTransformer`).
- Cero valores faltantes y cero duplicados (auditoría realizada).
- Contiene una variable de leakage documentada por la propia UCI
  (`duration`), que se excluye del modelo, lo que permite demostrar
  auditoría y prevención de data leakage con evidencia verificable.

**Variante de modelado:** `bank.csv` (muestra aleatoria del 10 %,
4 521 filas), que UCI provee explícitamente para algoritmos
computacionalmente demandantes como SVM. La auditoría documenta la
población completa (`bank-full.csv`, 45 211 filas).

**Candidato alternativo considerado:** Wine Quality (UCI 186, CC BY
4.0). La comparación completa está en `docs/candidatos_dataset.md` del
repositorio.

**Repositorio:** https://github.com/Vic-developers/INF8239-U01

Quedo atento/a a su aprobación o a las observaciones que considere
oportunas. Si prefiere otro dataset, el pipeline está parametrizado y
puede re-ejecutarse sobre el que usted indique.

Atentamente,
Victor E. Lorenzo

---

## Al obtener la aprobación

1. Cambiar "PENDIENTE DE APROBACIÓN DEL DOCENTE" por "APROBADO"
   (con fecha) en: `docs/ficha_dataset.md`, `docs/candidatos_dataset.md`,
   `docs/auditoria_dataset.md`, `docs/diccionario_datos.md`,
   `docs/protocolo_experimental.md`, `README.md`,
   `reports/ejercicio01_entrega.md` y `notebooks/02_dataset_auditoria.ipynb`
   (celda markdown inicial).
2. Re-ejecutar `python scripts\ejecutar_ejercicio01.py` para regenerar
   reportes sobre el dataset aprobado (si difiere del propuesto).
3. Actualizar el nombre en la portada de `reports/ejercicio01_entrega.md`
   y regenerar el PDF:
   `pandoc ejercicio01_entrega.md -o ejercicio01_entrega.pdf --pdf-engine=xelatex -V lang=es -V geometry:margin=2.2cm -V fontsize=11pt`
   (desde `reports/`).
