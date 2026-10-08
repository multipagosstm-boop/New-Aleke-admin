# Documentación y Resumen del Sistema: Pakrédito, Contabilidad y Cuentas de Ahorro

Este documento condensa todas las reglas de negocio, lógica financiera, principios contables y arquitectura del sistema implementados en la plataforma. Está diseñado para ser exportado y cargado en cualquier nuevo contexto o conversación de desarrollo.

---

## 1. Principio Fundamental: Contabilidad como Verdad Real

### 1.1 Saldo Real vs. Saldo Esperado
* **Saldo Esperado:** Es la proyección teórica pactada al momento de originar el crédito (`total_a_pagar = capital + intereses_proyectados`). Representa el plan original de cuotas si el crédito se pagase exactamente según el calendario sin variaciones.
* **Saldo Real a Deber:** Es el saldo contable real y vigente determinado por:
  $$\text{Saldo Real a Deber} = \text{Saldo Capital (Cuenta 120506)} + \text{Intereses causados/generados pendientes de cobro}$$
* **Independencia de Intereses Futuros:** Un cliente no adeuda intereses futuros no causados de cuotas que aún no han vencido.
* **Fórmula Central (`src/lib/pakredito.js` -> `calcularSaldoTotalDeber`):**
  - Si el crédito está en estado `saldado` o su saldo capital es $\le 0.01$: **el saldo a deber es estrictamente $0**.
  - Si está activo: retorna $\text{saldo\_capital} + \text{saldo\_intereses}$ sin sumar intereses no devengados del cronograma.

### 1.2 Liquidación y Condonación de Intereses al Saldar
* En operaciones reales de cartera, cuando un préstamo se va a saldar, el administrador puede acordar:
  1. No cobrar intereses futuros proyectados.
  2. Cobrar una tasa de interés menor o solo cobrar el capital remanente.
* Al registrar el abono con el saldo de capital, el haber (crédito) ingresa a la cuenta `120506` dejando el saldo vivo en $0.
* El sistema marca el crédito como **`saldado`** y todas las cuotas de amortización como **`pagadas`** con `saldo_capital = 0`.
* **Regla estricta:** Un crédito saldado **nunca revive como `en_mora` ni con saldos pendientes** a causa de intereses teóricos no cobrados del cronograma original.

---

## 2. Cronograma de Amortización y Aplicación de Abonos

### 2.1 Aplicación de Abonos a las Cuotas
* Los abonos ingresan discriminando:
  - `capital`: Amortización a la cuenta contable de cartera `120506`.
  - `intereses`: Ingreso financiero a la cuenta contable `410503` (según lo que el usuario decida cobrar en cada abono).
  - `otros_cobros`: Intereses cobrados de más o cargos administrativos.
* El abono cubre la cuota pendiente activa. Si el capital del abono excede el capital programado de esa cuota, el excedente cascada hacia la siguiente cuota del plan.

### 2.2 Préstamos de Cuota Única o Saldos Remanentes (Caso Diosa / PK-008)
* En préstamos pactados a 1 cuota (`numero_cuotas = 1`), dicha cuota representa la totalidad de la deuda.
* Si el cliente realiza abonos parciales de capital o paga únicamente intereses:
  - **La cuota NO se da por pagada** mientras exista saldo capital pendiente (`saldo_capital > 0`).
  - Permanece en estado **`parcial`** reflejando el saldo capital vivo restante.
  - La fecha de próximo pago del préstamo (`fecha_proximo_pago`) **nunca queda en `null`**, garantizando que el préstamo tenga siempre un vencimiento activo visible en el sistema.

### 2.3 Integridad del Orden Cronológico de Cuotas
* En un plan de amortización (semanal, quincenal o mensual), cada cuota tiene una fecha programada fija.
* **Regla estricta:** Al registrar un abono parcial o tardío, **nunca se sobreescribe de forma aislada la fecha de vencimiento de una cuota**, ya que rompería la secuencia cronológica respecto a las cuotas posteriores. La fecha del próximo pago del crédito toma de forma natural el vencimiento de la cuota activa pendiente.

---

## 3. Funcionamiento de las Prórrogas

### 3.1 Definición Operativa
* **Prorrogar** significa **aplazar el pago al siguiente periodo o a una fecha futura (+N días)**.
* **Regla de oro:** La prórroga **no reduce ni elimina cuotas pendientes**; únicamente **traslada sus fechas de vencimiento**.

### 3.2 Desplazamiento Uniforme de Cuotas
* En préstamos con múltiples cuotas pendientes:
  - Al otorgar una prórroga de $D$ días a la cuota activa, **todas las cuotas pendientes posteriores se trasladan en la misma cantidad de días** ($+D$).
  - Esto conserva estrictamente los intervalos entre cuotas (7 días para semanales, 15 días para quincenales, 30 días para mensuales) y preserva el orden cronológico.
* En préstamos de una cuota: la cuota única y el préstamo actualizan su vencimiento a la nueva fecha y el crédito pasa a estado **`vigente`**.

### 3.3 Disponibilidad en la Interfaz
* El botón **"Prórroga"** está disponible para cualquier crédito no saldado:
  1. En la ficha modal de detalle del crédito (`PrestamoDetail`).
  2. En la tabla principal de créditos (`Pakredito`), permitiendo otorgar prórroga en cualquier momento sin esperar a que entre en mora.
  3. En las alertas de vencimiento próximo (< 7 días) y clientes en mora.

---

## 4. Módulo de Cuentas de Ahorro (CDA) y Vínculo con Detalle de Cuentas

### 4.1 Arquitectura de Cuentas de Ahorro (CDA)
* Cada CDA registrada (`cuenta_ahorro`) corresponde 1:1 con una subcuenta contable del PUC transaccional (clase 1110 - Bancos):
  - Bancolombia: `11100101`, `11100102`, `11100103`...
  - Davivienda: `11100201`, `11100202`...
  - Colpatria/Otros: `11100301`...
* Cada CDA registra su número de cuenta, banco, titular, saldo en tiempo real y acumulado de salidas del mes para monitoreo del tope exento de GMF (4x1000).

### 4.2 Botón de Enlace a "Detalle de Cuentas"
* En la vista de **Cuentas de Ahorro (`CuentasAhorro`)**:
  - En la parte inferior de cada tarjeta se dispone del botón **"Detalle de cuentas"** con la subcuenta PUC visible.
  - En la botonera de acciones rápidas superior se incluye el acceso directo con icono `ExternalLink`.
* En el diálogo de inspección de CDA (`CuentaAhorroDetail`):
  - Botón principal inferior: **"Ver en Detalle de Cuentas ({subcuenta_puc})"**.

### 4.3 Comportamiento en `DetalleCuentas`
* La ruta de navegación es:
  `/admin/contabilidad/detalle-cuentas?cuenta={subcuenta_puc}&cda_id={id}`
* Al ingresar:
  1. Se selecciona automáticamente la cuenta PUC en el Libro Auxiliar / Mayor.
  2. Se filtran estrictamente los movimientos contabilizados pertenecientes a esa CDA.
  3. Se presenta un **banner informativo destacado** con el nombre de la CDA, banco, número de cuenta, saldo actual y un botón de regreso directo (**"Volver a Cuentas de Ahorro"**).

---

## 5. Mapa de Archivos del Código Fuente

| Archivo | Responsabilidad Principal |
| :--- | :--- |
| `src/lib/pakredito.js` | Funciones matemáticas y financieras: `calcularSaldoTotalDeber`, `reconciliarCuotasConAbonos`, proyección de cuota fija y amortizaciones. |
| `src/api/backendFunctions.js` | Backend de negocio: reconciliación de préstamos (`reconciliarCuotasPrestamo`), registro de abonos (`registrarAbono`), desembolsos y contabilidad. |
| `src/components/pakredito/ProrrocaDialog.jsx` | Modal de prórrogas: cálculo de nueva fecha y desplazamiento armónico de cuotas pendientes. |
| `src/components/pakredito/PrestamoDetail.jsx` | Ficha técnica del crédito: saldo a deber, amortización completa, abonos registrados y botón de prórroga. |
| `src/pages/admin/Pakredito.jsx` | Panel general de cartera Pakrédito: tablas de créditos, filtros, mora, prórrogas y abonos. |
| `src/pages/admin/CuentasAhorro.jsx` | Módulo de CDAs: monitoreo de saldos, control de tope GMF y botones de enlace a Detalle de Cuentas. |
| `src/components/admin/CuentaAhorroDetail.jsx` | Modal de detalles de CDA con botón de navegación a Detalle de Cuentas. |
| `src/pages/admin/DetalleCuentas.jsx` | Auxiliar contable mayorizado con soporte de parámetros URL (`?cuenta=` y `?cda_id=`), cálculo de saldo progresivo y banner de CDA. |
