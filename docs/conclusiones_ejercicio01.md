# Conclusión del Ejercicio 01

**INF-8239 Ciencia de Datos II · Unidad 01 · Ejercicio 01**

Todos los resultados provienen de la ejecución real
del pipeline (`scripts/ejecutar_ejercicio01.py`)
sobre el dataset propuesto, pendiente de aprobación
docente.

El dataset utilizado fue **Bank Marketing** (UCI
Machine Learning Repository, ID 222, licencia CC BY
4.0, DOI 10.24432/C5K306), con la pregunta: ¿es
posible predecir, con variables disponibles antes
del resultado, si un cliente suscribirá un depósito
a plazo en una campaña de telemarketing? La
auditoría mostró 4 521 filas de modelado (45 211 en
la población completa), 17 columnas, cero valores
faltantes, cero duplicados y un target binario
muy desbalanceado (88.5 % no, 11.5 % yes). También
identificó una variable de leakage documentada por
la propia UCI —`duration`, que solo se conoce
después de la llamada—, la cual fue excluida
sistemáticamente del modelo.

El baseline `DummyClassifier(strategy="most_frequent")`
alcanzó un accuracy de 0.8851 al predecir siempre
"no", pero su F1 para la clase positiva fue 0.0000
y su F1 macro 0.4695: evidencia clara de que el
accuracy es engañoso bajo desbalance. El SVM
(pipeline con preprocesamiento interno y
`build_svm()` reutilizable), optimizado mediante
`GridSearchCV` con `StratifiedKFold(5)` solo sobre
entrenamiento, seleccionó C=10 y gamma="scale"
(F1 macro en CV: 0.5991). Sobre el test aislado
(n=905) obtuvo: accuracy 0.8707, precision 0.3898,
recall 0.2212, F1 0.2822, F1 macro 0.6056 y
ROC-AUC 0.6660.

El análisis de errores revela que el error dominante
son los falsos negativos: 81 de los 104 clientes
que realmente suscribieron fueron clasificados como
"no" (tasa de falsos negativos 77.9 %), frente a
solo 36 falsos positivos (4.5 %). El SVM comete 117
errores totales, pero identifica 23 suscriptores
reales que el baseline no detectaría (sus F1 fueron
0.0). El F1 macro mejoró un 29 % relativo frente al
baseline y el ROC-AUC de 0.666 indica capacidad
discriminativa moderada, superior al azar.

Las limitaciones incluyen: uso de la muestra del
10 % por viabilidad computacional de SVM (variante
recomendada por UCI), desbalance de clases, datos de
una sola entidad bancaria portuguesa (2008–2010), y
la naturaleza no interpretable del kernel RBF.

En conclusión, el SVM supera al baseline en todas
las métricas relevantes para el problema real
(F1, F1 macro, recall de la clase minoritaria y
ROC-AUC), aunque su recall sigue siendo bajo: es
utilizable como herramienta de segmentación o
ranking de clientes con probabilidad de suscripción,
pero no como decisión autónoma. Se recomienda
experimentar con pesos de clase, calibración de
probabilidades y modelos de ensamble en trabajos
posteriores, siempre manteniendo la exclusión de
`duration` para preservar la validez predictiva.
