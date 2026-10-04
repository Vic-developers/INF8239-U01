# Acciones requeridas (dependen del estudiante)

Estas son las únicas acciones que no puede realizar
el asistente y que son necesarias para finalizar la
entrega del Ejercicio 01.

## 1. Solicitar aprobación del dataset al docente

**Motivo:** El ejercicio exige selección de dataset
público con aprobación docente. Sin ella, la entrega
está en estado "pendiente de aprobación".

**Cómo realizarla:** Enviar al docente la
comparación de `docs/candidatos_dataset.md` y la
ficha de `docs/ficha_dataset.md`. Propuesta:
**Bank Marketing (UCI 222)**, target `y`, excluyendo
`duration` por leakage. Alternativa documentada:
Wine Quality (UCI 186).

**Archivo que debo actualizar:**
`docs/ficha_dataset.md` (cambiar "PENDIENTE DE
APROBACIÓN DEL DOCENTE" por "APROBADO" con fecha y
observaciones del docente).

## 2. Confirmar la variante de modelado (bank.csv vs bank-full.csv)

**Motivo:** SVM escala cuadráticamente; el GridSearchCV
obligatorio (9 configuraciones × 5 folds) sobre las
45 211 filas completas superó los 10 minutos de
ejecución. UCI provee `bank.csv` (10 % aleatorio)
específicamente para algoritmos computacionalmente
demandantes.

**Cómo realizarla:** Confirmar con el docente que es
aceptable modelar sobre `bank.csv` y auditar la
población completa en `bank-full.csv` (ya documentado
así).

**Archivo que debo actualizar:**
`docs/protocolo_experimental.md` (si el docente
requiere la población completa, cambiar
`MODELING_FILE` en `scripts/ejecutar_ejercicio01.py`
y re-ejecutar).

## 3. ~~Completar el nombre del estudiante en el PDF~~ ✅ REALIZADO (2026-10-03)

**Motivo:** No se disponía del nombre; no se inventa.

**Realizado:** Nombre "Victor E. Lorenzo" colocado en la portada de
`reports/ejercicio01_entrega.md`, PDF regenerado y firmado en
`docs/solicitud_aprobacion.md`.

## 4. Crear el repositorio GitHub y agregar su URL

**Motivo:** La entrega exige repositorio Git; la URL
remota no puede inventarse.

**Cómo realizarla:**

```powershell
cd INF8239_U01
git init
git add .
git commit -m "docs: prepare exercise 01 delivery"
# crear repositorio en GitHub y luego:
git remote add origin <URL_DEL_REPOSITORIO>
git branch -M main
git push -u origin main
```

**Archivo que debo actualizar:**
`README.md` (sección Repositorio) y
`reports/ejercicio01_entrega.md` (sección 9).

## 5. Re-ejecutar si el docente aprueba otro dataset

**Motivo:** El pipeline está parametrizado para el
candidato propuesto.

**Cómo realizarla:** Ajustar URL/archivo/target en
`scripts/ejecutar_ejercicio01.py` y
`tests/test_data_contract.py`, y re-ejecutar
`python scripts\ejecutar_ejercicio01.py`.

**Archivo que debo actualizar:**
`scripts/ejecutar_ejercicio01.py`,
`tests/test_data_contract.py`,
`docs/*.md` afectados.
