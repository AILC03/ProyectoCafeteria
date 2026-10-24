# Modelo físico candidato — ESMAOS

> Estado: **candidato para revisión de Ángel**, no migrado a bases compartidas. Fuente: ADR 0001–0010 y `docs/data-dictionary.md`.

## Convenciones

Corrección técnica 2026-10-18: SQL ya contiene los 21 defaults CURRENT_TIMESTAMP
correspondientes a Prisma. Los campos updated_at siguen sin default SQL: los
actualiza Prisma. Los CHECK de efectivo/cierre exigen valores no nulos y los
importes esperado/contado no negativos, admitiendo diferencia negativa.
Protocolo de servicios e índices manuales: [integrity-protocols.md](integrity-protocols.md).
ER regenerado desde Prisma con `npm run db:diagram`; exportación legible en
[er-diagram.svg](er-diagram.svg). Las etiquetas nullable indican opcionalidad;
UNIQUE compuestas se consultan en Prisma/SQL, no son UNIQUE por columna aislada.
sales.order_id, sales.payment_id y customer_registration_tokens.sale_id son
UNIQUE: sus relaciones inversas en Prisma y ER son cero o uno, no listas.

- PostgreSQL y Prisma 7; identificadores `BIGINT IDENTITY`, instantes `TIMESTAMPTZ(6)` UTC, importes `BIGINT` en centavos. En HTTP IDs/importes van como strings.
- Relaciones históricas `ON DELETE RESTRICT`; el catálogo se oculta con `deleted_at` sin eliminar registros.
- Se usa `snake_case` físico y `camelCase` en Prisma/JSON. Todos los FK tienen `ON UPDATE CASCADE`; restricciones que afectan otras filas requieren transacciones de servicio.
- `@updatedAt` depende de Prisma; otros clientes SQL deben proporcionar `updated_at` explícitamente.
- Role se representa mediante `roles.name`, con semilla controlada posterior a aprobación: CLIENTE, ADMINISTRADOR, CAJERO, PREPARACION. El servicio debe validar el actor.

## Diccionario por tabla y campo

### `roles`

| Campo físico | Tipo Prisma / PostgreSQL           | Nulabilidad | Default / regla |
| ------------ | ---------------------------------- | ----------- | --------------- |
| `id`         | `BigInt` / `BIGINT IDENTITY`       | NO          | PK autogenerada |
| `name`       | `String` `@unique @db.VarChar(32)` | NO          | —               |

Relaciones: sin FK salientes.

### `users`

| Campo físico                 | Tipo Prisma / PostgreSQL                        | Nulabilidad | Default / regla                                   |
| ---------------------------- | ----------------------------------------------- | ----------- | ------------------------------------------------- |
| `id`                         | `BigInt` / `BIGINT IDENTITY`                    | NO          | PK autogenerada                                   |
| `account_type`               | `AccountType` / enum PostgreSQL                 | NO          | CUSTOMER o STAFF; CHECK excluye usuarios híbridos |
| `role_id`                    | `BigInt`                                        | NO          | —                                                 |
| `name`                       | `String` `@db.VarChar(120)`                     | NO          | —                                                 |
| `username`                   | `String?` `@unique @db.VarChar(24)`             | SÍ          | —                                                 |
| `password_hash`              | `String?` `@db.VarChar(255)`                    | SÍ          | —                                                 |
| `customer_number`            | `String?` `@unique @db.VarChar(20)`             | SÍ          | —                                                 |
| `phone`                      | `String?` `@unique @db.VarChar(20)`             | SÍ          | —                                                 |
| `pin_hash`                   | `String?` `@db.VarChar(255)`                    | SÍ          | —                                                 |
| `recovery_email`             | `String?` `@db.VarChar(254)`                    | SÍ          | —                                                 |
| `recovery_email_verified_at` | `DateTime?` `@db.Timestamptz(6)`                | SÍ          | —                                                 |
| `must_change_pin`            | `Boolean`                                       | NO          | @default(false)                                   |
| `is_active`                  | `Boolean`                                       | NO          | @default(true)                                    |
| `created_at`                 | `DateTime` `@default(now()) @db.Timestamptz(6)` | NO          | @default(now()                                    |
| `updated_at`                 | `DateTime` `@updatedAt @db.Timestamptz(6)`      | NO          | —                                                 |

Relaciones: `roleId` → `roles.id` (RESTRICT).

### `pin_reset_audit`

| Campo físico           | Tipo Prisma / PostgreSQL                        | Nulabilidad | Default / regla |
| ---------------------- | ----------------------------------------------- | ----------- | --------------- |
| `id`                   | `BigInt` / `BIGINT IDENTITY`                    | NO          | PK autogenerada |
| `customer_id`          | `BigInt`                                        | NO          | —               |
| `admin_id`             | `BigInt`                                        | NO          | —               |
| `reason`               | `String` `@db.VarChar(500)`                     | NO          | —               |
| `verification_summary` | `String` `@db.VarChar(500)`                     | NO          | —               |
| `reset_at`             | `DateTime` `@default(now()) @db.Timestamptz(6)` | NO          | @default(now()  |

Relaciones: `customerId` → `users.id` (RESTRICT); `adminId` → `users.id` (RESTRICT).

### `pin_recovery_tokens`

| Campo físico  | Tipo Prisma / PostgreSQL                        | Nulabilidad | Default / regla |
| ------------- | ----------------------------------------------- | ----------- | --------------- |
| `id`          | `BigInt` / `BIGINT IDENTITY`                    | NO          | PK autogenerada |
| `customer_id` | `BigInt`                                        | NO          | —               |
| `token_hash`  | `String` `@unique @db.Char(64)`                 | NO          | —               |
| `expires_at`  | `DateTime` `@db.Timestamptz(6)`                 | NO          | —               |
| `used_at`     | `DateTime?` `@db.Timestamptz(6)`                | SÍ          | —               |
| `created_at`  | `DateTime` `@default(now()) @db.Timestamptz(6)` | NO          | @default(now()  |

Relaciones: `customerId` → `users.id` (RESTRICT).

### `categories`

| Campo físico | Tipo Prisma / PostgreSQL                        | Nulabilidad | Default / regla |
| ------------ | ----------------------------------------------- | ----------- | --------------- |
| `id`         | `BigInt` / `BIGINT IDENTITY`                    | NO          | PK autogenerada |
| `name`       | `String` `@db.VarChar(120)`                     | NO          | —               |
| `is_active`  | `Boolean`                                       | NO          | @default(true)  |
| `deleted_at` | `DateTime?` `@db.Timestamptz(6)`                | SÍ          | —               |
| `created_at` | `DateTime` `@default(now()) @db.Timestamptz(6)` | NO          | @default(now()  |

Relaciones: sin FK salientes.

### `products`

| Campo físico       | Tipo Prisma / PostgreSQL                        | Nulabilidad | Default / regla |
| ------------------ | ----------------------------------------------- | ----------- | --------------- |
| `id`               | `BigInt` / `BIGINT IDENTITY`                    | NO          | PK autogenerada |
| `category_id`      | `BigInt`                                        | NO          | —               |
| `name`             | `String` `@db.VarChar(160)`                     | NO          | —               |
| `description`      | `String?` `@db.VarChar(1500)`                   | SÍ          | —               |
| `base_price_cents` | `BigInt`                                        | NO          | —               |
| `image_url`        | `String?` `@db.VarChar(2048)`                   | SÍ          | —               |
| `image_public_id`  | `String?` `@db.VarChar(255)`                    | SÍ          | —               |
| `image_version`    | `String?` `@db.VarChar(40)`                     | SÍ          | —               |
| `is_available`     | `Boolean`                                       | NO          | @default(true)  |
| `deleted_at`       | `DateTime?` `@db.Timestamptz(6)`                | SÍ          | —               |
| `created_at`       | `DateTime` `@default(now()) @db.Timestamptz(6)` | NO          | @default(now()  |
| `updated_at`       | `DateTime` `@updatedAt @db.Timestamptz(6)`      | NO          | —               |

Relaciones: `categoryId` → `categories.id` (RESTRICT).

### `option_groups`

| Campo físico    | Tipo Prisma / PostgreSQL         | Nulabilidad | Default / regla |
| --------------- | -------------------------------- | ----------- | --------------- |
| `id`            | `BigInt` / `BIGINT IDENTITY`     | NO          | PK autogenerada |
| `name`          | `String` `@db.VarChar(120)`      | NO          | —               |
| `pricing_scope` | `PricingScope`                   | NO          | —               |
| `deleted_at`    | `DateTime?` `@db.Timestamptz(6)` | SÍ          | —               |

Relaciones: sin FK salientes.

### `option_values`

| Campo físico             | Tipo Prisma / PostgreSQL         | Nulabilidad | Default / regla |
| ------------------------ | -------------------------------- | ----------- | --------------- |
| `id`                     | `BigInt` / `BIGINT IDENTITY`     | NO          | PK autogenerada |
| `option_group_id`        | `BigInt`                         | NO          | —               |
| `name`                   | `String` `@db.VarChar(120)`      | NO          | —               |
| `global_surcharge_cents` | `BigInt?`                        | SÍ          | —               |
| `is_available`           | `Boolean`                        | NO          | @default(true)  |
| `deleted_at`             | `DateTime?` `@db.Timestamptz(6)` | SÍ          | —               |

Relaciones: `optionGroupId` → `option_groups.id` (RESTRICT).

### `product_option_groups`

| Campo físico      | Tipo Prisma / PostgreSQL     | Nulabilidad | Default / regla |
| ----------------- | ---------------------------- | ----------- | --------------- |
| `id`              | `BigInt` / `BIGINT IDENTITY` | NO          | PK autogenerada |
| `product_id`      | `BigInt`                     | NO          | —               |
| `option_group_id` | `BigInt`                     | NO          | —               |
| `min_selections`  | `Int`                        | NO          | @default(0)     |
| `max_selections`  | `Int`                        | NO          | —               |

Relaciones: `productId` → `products.id` (RESTRICT); `optionGroupId` → `option_groups.id` (RESTRICT).

### `product_option_values`

| Campo físico               | Tipo Prisma / PostgreSQL     | Nulabilidad | Default / regla |
| -------------------------- | ---------------------------- | ----------- | --------------- |
| `id`                       | `BigInt` / `BIGINT IDENTITY` | NO          | PK autogenerada |
| `product_option_group_id`  | `BigInt`                     | NO          | —               |
| `option_value_id`          | `BigInt`                     | NO          | —               |
| `surcharge_override_cents` | `BigInt?`                    | SÍ          | —               |

Relaciones: `productOptionGroupId` → `product_option_groups.id` (RESTRICT); `optionValueId` → `option_values.id` (RESTRICT).

### `orders`

| Campo físico             | Tipo Prisma / PostgreSQL                        | Nulabilidad | Default / regla          |
| ------------------------ | ----------------------------------------------- | ----------- | ------------------------ |
| `id`                     | `BigInt` / `BIGINT IDENTITY`                    | NO          | PK autogenerada          |
| `folio`                  | `String` `@unique @db.VarChar(32)`              | NO          | —                        |
| `customer_id`            | `BigInt?`                                       | SÍ          | —                        |
| `created_by_employee_id` | `BigInt?`                                       | SÍ          | —                        |
| `guest_name`             | `String?` `@db.VarChar(120)`                    | SÍ          | —                        |
| `source`                 | `OrderSource`                                   | NO          | —                        |
| `status`                 | `OrderStatus`                                   | NO          | @default(PENDIENTE_PAGO) |
| `payment_method`         | `PaymentMethod`                                 | NO          | —                        |
| `total_cents`            | `BigInt`                                        | NO          | —                        |
| `payment_expires_at`     | `DateTime` `@db.Timestamptz(6)`                 | NO          | —                        |
| `cash_qr_token_hash`     | `String?` `@unique @db.Char(64)`                | SÍ          | —                        |
| `paid_at`                | `DateTime?` `@db.Timestamptz(6)`                | SÍ          | —                        |
| `ready_at`               | `DateTime?` `@db.Timestamptz(6)`                | SÍ          | —                        |
| `ready_by_employee_id`   | `BigInt?`                                       | SÍ          | —                        |
| `expired_at`             | `DateTime?` `@db.Timestamptz(6)`                | SÍ          | —                        |
| `created_at`             | `DateTime` `@default(now()) @db.Timestamptz(6)` | NO          | @default(now()           |
| `updated_at`             | `DateTime` `@updatedAt @db.Timestamptz(6)`      | NO          | —                        |

Relaciones: `customerId` → `users.id` (RESTRICT); `createdByEmployeeId` → `users.id` (RESTRICT); `readyByEmployeeId` → `users.id` (RESTRICT).

### `order_items`

| Campo físico                | Tipo Prisma / PostgreSQL     | Nulabilidad | Default / regla |
| --------------------------- | ---------------------------- | ----------- | --------------- |
| `id`                        | `BigInt` / `BIGINT IDENTITY` | NO          | PK autogenerada |
| `order_id`                  | `BigInt`                     | NO          | —               |
| `product_id`                | `BigInt`                     | NO          | —               |
| `product_name_snapshot`     | `String` `@db.VarChar(160)`  | NO          | —               |
| `base_price_cents_snapshot` | `BigInt`                     | NO          | —               |
| `unit_price_cents`          | `BigInt`                     | NO          | —               |
| `quantity`                  | `Int`                        | NO          | —               |
| `line_total_cents`          | `BigInt`                     | NO          | —               |

Relaciones: `orderId` → `orders.id` (RESTRICT); `productId` → `products.id` (RESTRICT).

### `order_item_options`

| Campo físico               | Tipo Prisma / PostgreSQL     | Nulabilidad | Default / regla |
| -------------------------- | ---------------------------- | ----------- | --------------- |
| `id`                       | `BigInt` / `BIGINT IDENTITY` | NO          | PK autogenerada |
| `order_item_id`            | `BigInt`                     | NO          | —               |
| `option_value_id`          | `BigInt`                     | NO          | —               |
| `group_name_snapshot`      | `String` `@db.VarChar(120)`  | NO          | —               |
| `option_name_snapshot`     | `String` `@db.VarChar(120)`  | NO          | —               |
| `surcharge_cents_snapshot` | `BigInt`                     | NO          | —               |

Relaciones: `orderItemId` → `order_items.id` (RESTRICT); `optionValueId` → `option_values.id` (RESTRICT).

### `payments`

| Campo físico                 | Tipo Prisma / PostgreSQL                        | Nulabilidad | Default / regla   |
| ---------------------------- | ----------------------------------------------- | ----------- | ----------------- |
| `id`                         | `BigInt` / `BIGINT IDENTITY`                    | NO          | PK autogenerada   |
| `order_id`                   | `BigInt`                                        | NO          | —                 |
| `method`                     | `PaymentMethod`                                 | NO          | —                 |
| `status`                     | `PaymentStatus`                                 | NO          | @default(PENDING) |
| `amount_cents`               | `BigInt`                                        | NO          | —                 |
| `currency`                   | `String` `@default("MXN") @db.Char(3)`          | NO          | @default("MXN")   |
| `cashier_id`                 | `BigInt?`                                       | SÍ          | —                 |
| `cash_session_id`            | `BigInt?`                                       | SÍ          | —                 |
| `cash_received_cents`        | `BigInt?`                                       | SÍ          | —                 |
| `change_cents`               | `BigInt?`                                       | SÍ          | —                 |
| `stripe_creation_key`        | `String?` `@unique @db.VarChar(255)`            | SÍ          | —                 |
| `stripe_checkout_session_id` | `String?` `@unique @db.VarChar(255)`            | SÍ          | —                 |
| `stripe_payment_intent_id`   | `String?` `@unique @db.VarChar(255)`            | SÍ          | —                 |
| `confirmed_at`               | `DateTime?` `@db.Timestamptz(6)`                | SÍ          | —                 |
| `provider_paid_at`           | `DateTime?` `@db.Timestamptz(6)`                | SÍ          | —                 |
| `created_at`                 | `DateTime` `@default(now()) @db.Timestamptz(6)` | NO          | @default(now()    |
| `updated_at`                 | `DateTime` `@updatedAt @db.Timestamptz(6)`      | NO          | —                 |

Relaciones: `orderId` → `orders.id` (RESTRICT); `cashierId` → `users.id` (RESTRICT); `cashSessionId` → `cash_sessions.id` (RESTRICT).

### `sales`

| Campo físico  | Tipo Prisma / PostgreSQL                        | Nulabilidad | Default / regla |
| ------------- | ----------------------------------------------- | ----------- | --------------- |
| `id`          | `BigInt` / `BIGINT IDENTITY`                    | NO          | PK autogenerada |
| `sale_number` | `String` `@unique @db.VarChar(32)`              | NO          | —               |
| `order_id`    | `BigInt`                                        | NO          | —               |
| `payment_id`  | `BigInt`                                        | NO          | —               |
| `total_cents` | `BigInt`                                        | NO          | —               |
| `sold_at`     | `DateTime` `@default(now()) @db.Timestamptz(6)` | NO          | @default(now()  |

Relaciones: `orderId` → `orders.id` (RESTRICT); `paymentId` → `payments.id` (RESTRICT).

### `cash_sessions`

| Campo físico               | Tipo Prisma / PostgreSQL                        | Nulabilidad | Default / regla |
| -------------------------- | ----------------------------------------------- | ----------- | --------------- |
| `id`                       | `BigInt` / `BIGINT IDENTITY`                    | NO          | PK autogenerada |
| `employee_id`              | `BigInt`                                        | NO          | —               |
| `opened_at`                | `DateTime` `@default(now()) @db.Timestamptz(6)` | NO          | @default(now()  |
| `closed_at`                | `DateTime?` `@db.Timestamptz(6)`                | SÍ          | —               |
| `closed_by_employee_id`    | `BigInt?`                                       | SÍ          | —               |
| `exceptional_close_reason` | `String?` `@db.VarChar(500)`                    | SÍ          | —               |
| `opening_amount_cents`     | `BigInt`                                        | NO          | —               |
| `expected_cash_cents`      | `BigInt?`                                       | SÍ          | —               |
| `counted_cash_cents`       | `BigInt?`                                       | SÍ          | —               |
| `difference_cents`         | `BigInt?`                                       | SÍ          | —               |

Relaciones: `employeeId` → `users.id` (RESTRICT); `closedByEmployeeId` → `users.id` (RESTRICT).

### `payment_events`

| Campo físico        | Tipo Prisma / PostgreSQL                        | Nulabilidad | Default / regla    |
| ------------------- | ----------------------------------------------- | ----------- | ------------------ |
| `id`                | `BigInt` / `BIGINT IDENTITY`                    | NO          | PK autogenerada    |
| `payment_id`        | `BigInt?`                                       | SÍ          | —                  |
| `provider_event_id` | `String` `@unique @db.VarChar(255)`             | NO          | —                  |
| `event_type`        | `String` `@db.VarChar(80)`                      | NO          | —                  |
| `processing_status` | `EventStatus`                                   | NO          | @default(RECEIVED) |
| `received_at`       | `DateTime` `@default(now()) @db.Timestamptz(6)` | NO          | @default(now()     |
| `processed_at`      | `DateTime?` `@db.Timestamptz(6)`                | SÍ          | —                  |

Relaciones: `paymentId` → `payments.id` (RESTRICT).

### `refunds`

| Campo físico       | Tipo Prisma / PostgreSQL                        | Nulabilidad | Default / regla     |
| ------------------ | ----------------------------------------------- | ----------- | ------------------- |
| `id`               | `BigInt` / `BIGINT IDENTITY`                    | NO          | PK autogenerada     |
| `payment_id`       | `BigInt`                                        | NO          | —                   |
| `amount_cents`     | `BigInt`                                        | NO          | —                   |
| `reason`           | `String` `@db.VarChar(500)`                     | NO          | —                   |
| `status`           | `RefundStatus`                                  | NO          | @default(REQUESTED) |
| `stripe_refund_id` | `String?` `@unique @db.VarChar(255)`            | SÍ          | —                   |
| `created_at`       | `DateTime` `@default(now()) @db.Timestamptz(6)` | NO          | @default(now()      |
| `updated_at`       | `DateTime` `@updatedAt @db.Timestamptz(6)`      | NO          | —                   |

Relaciones: `paymentId` → `payments.id` (RESTRICT).

### `customer_registration_tokens`

| Campo físico          | Tipo Prisma / PostgreSQL                        | Nulabilidad | Default / regla |
| --------------------- | ----------------------------------------------- | ----------- | --------------- |
| `id`                  | `BigInt` / `BIGINT IDENTITY`                    | NO          | PK autogenerada |
| `sale_id`             | `BigInt`                                        | NO          | —               |
| `token_hash`          | `String` `@unique @db.Char(64)`                 | NO          | —               |
| `expires_at`          | `DateTime` `@db.Timestamptz(6)`                 | NO          | —               |
| `used_at`             | `DateTime?` `@db.Timestamptz(6)`                | SÍ          | —               |
| `used_by_customer_id` | `BigInt?`                                       | SÍ          | —               |
| `created_at`          | `DateTime` `@default(now()) @db.Timestamptz(6)` | NO          | @default(now()  |

Relaciones: `saleId` → `sales.id` (RESTRICT); `usedByCustomerId` → `users.id` (RESTRICT).

### `favorites`

| Campo físico  | Tipo Prisma / PostgreSQL                        | Nulabilidad | Default / regla |
| ------------- | ----------------------------------------------- | ----------- | --------------- |
| `customer_id` | `BigInt`                                        | NO          | —               |
| `product_id`  | `BigInt`                                        | NO          | —               |
| `created_at`  | `DateTime` `@default(now()) @db.Timestamptz(6)` | NO          | @default(now()  |

Relaciones: `customerId` → `users.id` (RESTRICT); `productId` → `products.id` (RESTRICT).

### `auth_sessions`

| Campo físico          | Tipo Prisma / PostgreSQL                        | Nulabilidad | Default / regla |
| --------------------- | ----------------------------------------------- | ----------- | --------------- |
| `id`                  | `BigInt` / `BIGINT IDENTITY`                    | NO          | PK autogenerada |
| `user_id`             | `BigInt`                                        | NO          | —               |
| `family_id`           | `String` `@db.Uuid`                             | NO          | —               |
| `refresh_token_hash`  | `String` `@unique @db.Char(64)`                 | NO          | —               |
| `rotated_from_id`     | `BigInt?`                                       | SÍ          | —               |
| `created_at`          | `DateTime` `@default(now()) @db.Timestamptz(6)` | NO          | @default(now()  |
| `last_seen_at`        | `DateTime` `@default(now()) @db.Timestamptz(6)` | NO          | @default(now()  |
| `absolute_expires_at` | `DateTime` `@db.Timestamptz(6)`                 | NO          | —               |
| `rotated_at`          | `DateTime?` `@db.Timestamptz(6)`                | SÍ          | —               |
| `revoked_at`          | `DateTime?` `@db.Timestamptz(6)`                | SÍ          | —               |

Relaciones: `userId` → `users.id` (RESTRICT); `rotatedFromId` → `auth_sessions.id` (RESTRICT).

### `auth_attempt_limits`

| Campo físico        | Tipo Prisma / PostgreSQL         | Nulabilidad | Default / regla |
| ------------------- | -------------------------------- | ----------- | --------------- |
| `id`                | `BigInt` / `BIGINT IDENTITY`     | NO          | PK autogenerada |
| `key_hash`          | `String` `@unique @db.Char(64)`  | NO          | —               |
| `window_started_at` | `DateTime` `@db.Timestamptz(6)`  | NO          | —               |
| `attempt_count`     | `Int`                            | NO          | @default(0)     |
| `blocked_until`     | `DateTime?` `@db.Timestamptz(6)` | SÍ          | —               |

Relaciones: sin FK salientes.

### `email_verification_tokens`

| Campo físico      | Tipo Prisma / PostgreSQL         | Nulabilidad | Default / regla |
| ----------------- | -------------------------------- | ----------- | --------------- |
| `id`              | `BigInt` / `BIGINT IDENTITY`     | NO          | PK autogenerada |
| `customer_id`     | `BigInt`                         | NO          | —               |
| `candidate_email` | `String` `@db.VarChar(254)`      | NO          | —               |
| `token_hash`      | `String` `@unique @db.Char(64)`  | NO          | —               |
| `expires_at`      | `DateTime` `@db.Timestamptz(6)`  | NO          | —               |
| `used_at`         | `DateTime?` `@db.Timestamptz(6)` | SÍ          | —               |

Relaciones: `customerId` → `users.id` (RESTRICT).

### `idempotency_records`

| Campo físico    | Tipo Prisma / PostgreSQL                        | Nulabilidad | Default / regla       |
| --------------- | ----------------------------------------------- | ----------- | --------------------- |
| `id`            | `BigInt` / `BIGINT IDENTITY`                    | NO          | PK autogenerada       |
| `scope`         | `String` `@db.VarChar(100)`                     | NO          | —                     |
| `actor_key`     | `String` `@db.VarChar(150)`                     | NO          | —                     |
| `key_hash`      | `String` `@db.Char(64)`                         | NO          | —                     |
| `request_hash`  | `String` `@db.Char(64)`                         | NO          | —                     |
| `status`        | `IdempotencyStatus`                             | NO          | @default(IN_PROGRESS) |
| `resource_type` | `String?` `@db.VarChar(60)`                     | SÍ          | —                     |
| `resource_id`   | `BigInt?`                                       | SÍ          | —                     |
| `response_json` | `Json?`                                         | SÍ          | —                     |
| `expires_at`    | `DateTime` `@db.Timestamptz(6)`                 | NO          | —                     |
| `created_at`    | `DateTime` `@default(now()) @db.Timestamptz(6)` | NO          | @default(now()        |

Relaciones: sin FK salientes.

### `jobs`

| Campo físico   | Tipo Prisma / PostgreSQL                        | Nulabilidad | Default / regla   |
| -------------- | ----------------------------------------------- | ----------- | ----------------- |
| `id`           | `BigInt` / `BIGINT IDENTITY`                    | NO          | PK autogenerada   |
| `type`         | `String` `@db.VarChar(80)`                      | NO          | —                 |
| `reference`    | `String` `@db.VarChar(255)`                     | NO          | —                 |
| `status`       | `JobStatus`                                     | NO          | @default(PENDING) |
| `available_at` | `DateTime` `@default(now()) @db.Timestamptz(6)` | NO          | @default(now()    |
| `attempts`     | `Int`                                           | NO          | @default(0)       |
| `locked_until` | `DateTime?` `@db.Timestamptz(6)`                | SÍ          | —                 |
| `dedupe_key`   | `String?` `@unique @db.VarChar(255)`            | SÍ          | —                 |
| `last_error`   | `String?` `@db.VarChar(500)`                    | SÍ          | —                 |

Relaciones: sin FK salientes.

### `outbox_messages`

| Campo físico        | Tipo Prisma / PostgreSQL                        | Nulabilidad | Default / regla   |
| ------------------- | ----------------------------------------------- | ----------- | ----------------- |
| `id`                | `BigInt` / `BIGINT IDENTITY`                    | NO          | PK autogenerada   |
| `type`              | `String` `@db.VarChar(80)`                      | NO          | —                 |
| `reference`         | `String` `@db.VarChar(255)`                     | NO          | —                 |
| `encrypted_payload` | `String?` `@db.Text`                            | SÍ          | —                 |
| `key_version`       | `String?` `@db.VarChar(40)`                     | SÍ          | —                 |
| `status`            | `JobStatus`                                     | NO          | @default(PENDING) |
| `attempts`          | `Int`                                           | NO          | @default(0)       |
| `available_at`      | `DateTime` `@default(now()) @db.Timestamptz(6)` | NO          | @default(now()    |
| `locked_until`      | `DateTime?` `@db.Timestamptz(6)`                | SÍ          | —                 |
| `expires_at`        | `DateTime?` `@db.Timestamptz(6)`                | SÍ          | —                 |

Relaciones: sin FK salientes.

### `payment_incidents`

| Campo físico    | Tipo Prisma / PostgreSQL                        | Nulabilidad | Default / regla |
| --------------- | ----------------------------------------------- | ----------- | --------------- |
| `id`            | `BigInt` / `BIGINT IDENTITY`                    | NO          | PK autogenerada |
| `order_id`      | `BigInt`                                        | NO          | —               |
| `payment_id`    | `BigInt?`                                       | SÍ          | —               |
| `reason`        | `String` `@db.VarChar(500)`                     | NO          | —               |
| `review_status` | `IncidentStatus`                                | NO          | @default(OPEN)  |
| `created_at`    | `DateTime` `@default(now()) @db.Timestamptz(6)` | NO          | @default(now()  |
| `reviewed_at`   | `DateTime?` `@db.Timestamptz(6)`                | SÍ          | —               |

Relaciones: `orderId` → `orders.id` (RESTRICT); `paymentId` → `payments.id` (RESTRICT).

### `audit_events`

| Campo físico  | Tipo Prisma / PostgreSQL                        | Nulabilidad | Default / regla |
| ------------- | ----------------------------------------------- | ----------- | --------------- |
| `id`          | `BigInt` / `BIGINT IDENTITY`                    | NO          | PK autogenerada |
| `actor_id`    | `BigInt`                                        | NO          | —               |
| `customer_id` | `BigInt?`                                       | SÍ          | —               |
| `action`      | `String` `@db.VarChar(80)`                      | NO          | —               |
| `reason`      | `String` `@db.VarChar(500)`                     | NO          | —               |
| `occurred_at` | `DateTime` `@default(now()) @db.Timestamptz(6)` | NO          | @default(now()  |

Relaciones: `actorId` → `users.id` (RESTRICT); `customerId` → `users.id` (RESTRICT).

### `guest_ticket_tokens`

| Campo físico | Tipo Prisma / PostgreSQL                        | Nulabilidad | Default / regla |
| ------------ | ----------------------------------------------- | ----------- | --------------- |
| `id`         | `BigInt` / `BIGINT IDENTITY`                    | NO          | PK autogenerada |
| `sale_id`    | `BigInt`                                        | NO          | —               |
| `token_hash` | `String` `@unique @db.Char(64)`                 | NO          | —               |
| `expires_at` | `DateTime` `@db.Timestamptz(6)`                 | NO          | —               |
| `revoked_at` | `DateTime?` `@db.Timestamptz(6)`                | SÍ          | —               |
| `created_at` | `DateTime` `@default(now()) @db.Timestamptz(6)` | NO          | @default(now()  |

Relaciones: `saleId` → `sales.id` (RESTRICT).

## Restricciones complementarias

Ver `prisma/migrations/20261015_initial_candidate/migration.sql`, `docs/database/verification.md` y la matriz siguiente. Las reglas transversales **no** se pueden imponer con un CHECK que consulte otras tablas.

| Regla                                   | Mecanismo candidato                                                             | Prueba esperada                    |
| --------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------- |
| Una sola caja abierta                   | Índice único parcial `closed_at IS NULL`                                        | Segunda apertura rechazada         |
| Máximo un pago exitoso por orden        | Índice único parcial `status=SUCCEEDED`                                         | Segundo éxito rechazado            |
| Usuario solo cliente o personal         | CHECK con `account_type` y FK rol validada en servicio                          | Usuario híbrido rechazado          |
| Pertenencia de opción al grupo          | Bloqueo y verificación transaccional en servicio                                | Valor de otro grupo rechazado      |
| Snapshot histórico inmutable            | RESTRICT en FK y permisos de escritura limitados; servicio prohíbe UPDATE       | Cambio de catálogo no cambia orden |
| Máximo 50 líneas/orden y total correcto | Bloquear fila `orders FOR UPDATE`, contar/recalcular en transacción             | Línea 51 rechazada                 |
| Cobro y cierre excluyentes              | `cash_sessions FOR UPDATE` siempre antes de pagar/cerrar                        | Solo un flujo confirma             |
| Stripe pagado y venta                   | Transacción order/payment/sale con locks y reconciliación externa               | Webhook duplicado sin doble venta  |
| Registro QR único                       | Token/venta con UNIQUE, `FOR UPDATE`, marcar usado y asociar en una transacción | Solo un registro                   |
| Idempotencia 48 h                       | UNIQUE por alcance+actor+hash y conservar recursos permanentemente              | Reintento igual no duplica         |

## Decisiones pendientes de revisión

- `users.account_type` se añadió para imponer CHECK de campos exclusivos. La coherencia entre roles.name y account_type aún requiere transacción de servicio o tabla de permisos estática; un CHECK sobre users no puede consultar roles.
- Un único Checkout abierto por orden es un invariante transaccional: serializar creando Stripe desde registro `PENDING` bloqueado y reconciliar timeouts.
- Familia refresh: ante reuso de token rotado se revoca la familia; bloqueo de sesión en transacción y límite absoluto por tipo de usuario.
- Ticket invitado: token aleatorio, SHA-256, vencimiento/revocación, acceso exclusivamente al comprobante pagado, no al estado de orden.
- `categories.created_at` se agregó para paginación `(created_at,id)` sin romper ADR 0006.
- Los enums de jobs/eventos/reembolsos son propuestas concretas, sujetas a revisión.
