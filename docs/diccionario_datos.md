# Diccionario de datos — Bank Marketing (UCI 222)

**INF-8239 Ciencia de Datos II · Unidad 01 · Ejercicio 01**

**Estado: PENDIENTE DE APROBACIÓN DEL DOCENTE**

Archivo de modelado: `bank.csv` (4 521 filas, separador
`;`). La población completa (`bank-full.csv`, 45 211
filas) comparte el mismo esquema.

| Variable | Tipo | Descripción | Rol | Missing | Riesgo |
| -------- | ---- | ----------- | --- | ------- | ------ |
| `age` | numérica (int) | Edad del cliente | Predictora | 0 | Bajo |
| `job` | categórica | Tipo de trabajo (admin., blue-collar, entrepreneur, housemaid, management, retired, self-employed, services, student, technician, unemployed, unknown) | Predictora | 0 | Bajo |
| `marital` | categórica | Estado civil (married, divorced, single; "divorced" incluye viudos) | Predictora | 0 | Bajo |
| `education` | categórica | Nivel educativo (secondary, tertiary, primary, unknown en la versión usada) | Predictora | 0 | Bajo (categoría "unknown") |
| `default` | categórica binaria | ¿Tiene crédito en impago? (yes/no) | Predictora | 0 | Bajo |
| `balance` | numérica (int) | Saldo anual promedio (euros) | Predictora | 0 | Bajo |
| `housing` | categórica binaria | ¿Tiene préstamo hipotecario? (yes/no) | Predictora | 0 | Bajo |
| `loan` | categórica binaria | ¿Tiene préstamo personal? (yes/no) | Predictora | 0 | Bajo |
| `contact` | categórica | Tipo de contacto (cellular, telephone, unknown) | Predictora | 0 | Bajo |
| `day` | numérica (int) | Día del último contacto del mes (1–31) | Predictora | 0 | Bajo (posible ruido) |
| `month` | categórica | Mes del último contacto (jan…dec) | Predictora | 0 | Bajo |
| `duration` | numérica (int) | Duración de la última llamada en segundos | **EXCLUIDA** | 0 | **ALTO — LEAKAGE**: UCI documenta que afecta fuertemente al target y no se conoce antes de la llamada |
| `campaign` | numérica (int) | Número de contactos en la campaña actual (incluye el último) | Predictora | 0 | Medio (se conoce antes del resultado) |
| `pdays` | numérica (int) | Días desde el último contacto de campaña anterior (-1 = no contactado) | Predictora | 0 | Bajo |
| `previous` | numérica (int) | Número de contactos antes de la campaña actual | Predictora | 0 | Bajo |
| `poutcome` | categórica | Resultado de la campaña anterior (unknown, other, failure, success) | Predictora | 0 | Bajo (mayoritariamente "unknown") |
| `y` | categórica binaria | ¿Suscribió depósito a plazo? (yes/no) | **TARGET** | 0 | — |

## Clasificación de variables

- **Identificadores:** no existen (no hay columna de ID
  de cliente) — favorable para privacidad y evita
  memorización por SVM.
- **Predictoras numéricas (6):** `age`, `balance`, `day`,
  `campaign`, `pdays`, `previous`.
- **Predictoras categóricas (9):** `job`, `marital`,
  `education`, `default`, `housing`, `loan`, `contact`,
  `month`, `poutcome`.
- **Target:** `y`.
- **Potencialmente problemática:** `duration` (leakage
  documentado) — excluida del modelo y de toda
  transformación.
- **Alta cardinalidad:** ninguna (máx. ~12 categorías en
  `job`); no hay constantes.
- **Missing:** 0 en todas las columnas (verificado con
  auditoría real).
