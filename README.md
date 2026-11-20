# M.O.B.I.™ Retail Satellite Apps Monorepo (`retail`)

> **Monorepo:** `github.com/wearemobi/retail`
> **Spec:** `SPEC-WRTL1` · **Issue:** `wearemobi/retail#1`
> **Backend Provider:** `github.com/wearemobi/wared` (`https://api.mobiware.app`)
> **Hosting Edge:** Cloudflare Workers / Custom Domains

---

## 1. Arquitectura

Monorepo ligero gestionado con **pnpm workspaces** para las aplicaciones satélite del módulo Retail (`ware-retail`):

```text
retail/
├── pnpm-workspace.yaml
├── package.json                   # Scripts raíz (build, test, typecheck, deploy)
├── tsconfig.base.json             # Configuración base de TypeScript
├── .github/workflows/ci.yml       # CI unificado (Typecheck, Vitest, Vite build)
│
├── packages/
│   └── common/                    # @retail/common
│       ├── src/api/               # openapi-fetch, resolución de tenant, schema.d.ts
│       ├── src/auth/              # LoginScreen, PinModal, createAuthStore
│       ├── src/audio/             # Feedback táctil (Web Audio API)
│       ├── src/ui/                # tokens.css, Button, Badge, Card, Input,
│       │                          # SatelliteHeader, QuantityStepper, theme
│       └── src/utils/             # formatMoney, initials
│
└── apps/
    └── pos/                       # @retail/pos -> https://pos.mobiware.app
        ├── src/components/pos/    # PosScreen, PosHeader, CatalogGrid,
        │                          # CartPanel, CheckoutDialog, CustomerSelector
        ├── src/store/             # Sesión y carrito (10^-4)
        └── wrangler.jsonc         # Dominio: pos.mobiware.app
```

---

## 2. Aplicaciones y Dominios

| Sub-Aplicación | Paquete | URL de Producción | Propósito |
| :--- | :--- | :--- | :--- |
| **POS** | `@retail/pos` | [https://pos.mobiware.app](https://pos.mobiware.app) | Terminal táctil de punto de venta para cajeros `CASHIER` / `ADMIN` (SPEC-WRTL1). |
| **Common** | `@retail/common` | *(In-repo)* | Primitives shadcn, sesión PIN, cliente OpenAPI y utilidades de cantidad/moneda. |

---

## 3. Contrato de acceso

`ware1` abre la terminal desde `RetailAccessDialog`:

```text
https://pos.mobiware.app/?t=<tenant_id>&theme=<light|dark>
```

- `t` (o `tenant`) resuelve el tenant soberano y se persiste en `localStorage` (`ware-pos.tenant`).
- `theme` se hereda y se persiste en `localStorage` (`ware-pos.theme`).
- Sin `t`, se usa `tenant_demo_sv` como fallback de desarrollo.

El roster de login se filtra a operadores con rol `CASHIER` o `ADMIN`.

---

## 4. Flujo operativo POS

- **Catálogo:** `GET /v1/inventory/products` con búsqueda por nombre/SKU y lector de código de barras (Enter sobre el buscador resuelve el SKU exacto vía `GET /v1/inventory/products/{sku}`).
- **Grid táctil:** selector de columnas `2 / 3 / 4 / 6` y escala `A- / A / A+`.
- **Carrito:** cantidades fijas de `10^-4` (`10000 = 1.0000`). Los productos por peso/volumen usan `QuantityStepper` decimal (`precision=4`).
- **Cliente:** `GET /v1/customers` con búsqueda diferida; se envía `customer_id` en el checkout.
- **Documento:** `01` Consumidor Final u `03` Comprobante de Crédito Fiscal (CCF). CCF exige un cliente con NIT registrado.
- **Cobro:** `POST /v1/pos/checkout` con `Idempotency-Key`, ítems en `10^-4`, método de pago y cambio en efectivo.
- **Header:** `SatelliteHeader` con métricas de caja/carrito/total, badge de cajero, columnas, escala, toggle `Sun/Moon` y `Salir`.

La heurística de productos por peso usa el catálogo CAT-014 (`unit_of_measure`): códigos de galón, gramo, kilogramo, litro, metro, onza, libra, tonelada, yarda y mililitro, además de sus abreviaturas (`kg`, `lb`, `L`, `ml`, …). El código `59` (Unidad) opera con cantidades enteras.

---

## 5. Comandos

```bash
# Instalar dependencias del workspace
pnpm install

# Desarrollo de la terminal POS (proxy Vite /v1 -> https://api.mobiware.app)
pnpm dev:pos

# Verificación completa
pnpm -r run typecheck
pnpm -r run build
pnpm -r test

# Regenerar tipos OpenAPI desde wared
pnpm api:gen

# Desplegar la terminal (requiere credenciales Cloudflare)
pnpm deploy:pos
```

### Variables de entorno

| Variable | Default | Uso |
| :--- | :--- | :--- |
| `VITE_API_BASE_URL` | `""` en dev (proxy) / `https://api.mobiware.app` en build | Gateway API. |

---

## 6. Gobernanza

Colaboradores asignados:

- **@carlosquijano** (Admin)
- **@warhtek** (Write / Push)
- **@danquijano** (Read / Pull)

Copyright © 2026 **M.O.B.I.™** (Machine Oriented Brilliant Ideas™)
Transforming ideas into high-impact digital solutions. 🚀
[wearemobi.com](https://wearemobi.com)
