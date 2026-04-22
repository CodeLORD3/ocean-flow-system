# Scomber Commerce — System Architecture

```
┌──────────────────┐
│  Makrilltrade    │   MySQL (existing)
│  - articles      │   ← SELECT only
│  - batches       │   ← read-only DB user
│  - inventory     │
│  - suppliers     │
└────────┬─────────┘
         │
         ▼
┌──────────────────────────────────────┐
│  Scomber Commerce API                │
│  Supabase Edge Functions             │
│                                      │
│  Own tables in Lovable Cloud:        │
│  - price_overrides                   │
│  - pos_transactions / *_items        │
│  - b2b_orders / *_lines              │
│  - batch_allocations                 │
│  - store_configs                     │
│  - makrilltrade_*_cache              │
└────────┬─────────────────────────────┘
         │
   ┌─────┼─────┬─────────────┐
   ▼     ▼     ▼             ▼
  POS   B2B  Morning-     Makrilltrade
              rutin       (write-back via API/export)
```

## Boundary rule (strict)

The Scomber tables are **only** reachable through the Scomber API.
Row-level security is enabled but **no client policies are defined**, so
`anon` and `authenticated` Supabase clients cannot read or write them. Only
the edge functions (running with the service role) can touch the data.

| Layer        | Reads                                        | Writes                                  |
| ------------ | -------------------------------------------- | --------------------------------------- |
| POS UI       | via `scomberClient.resolvePrices()`          | via `scomberClient.checkoutPos()`       |
| B2B UI       | via `scomberClient.resolvePrices()`          | via `scomberClient.createB2bOrder()`    |
| Morning rtn  | via `scomberClient.syncMakrilltrade()` etc.  | via `scomberClient.allocateBatch()` etc.|
| Makrilltrade | `scomber-makrilltrade-sync` pulls from MySQL | none (write-back via export only)       |

## Data ownership

| Table                          | Owner            | Source of truth                    |
| ------------------------------ | ---------------- | ---------------------------------- |
| `makrilltrade_articles_cache`  | Makrilltrade ERP | `scomber-makrilltrade-sync`        |
| `makrilltrade_batches_cache`   | Makrilltrade ERP | `scomber-makrilltrade-sync`        |
| `price_overrides`              | Scomber          | Morning-rutin / admin UI           |
| `pos_transactions` / items     | Scomber (POS)    | `scomber-pos-checkout`             |
| `b2b_orders` / lines           | Scomber (B2B)    | `scomber-b2b-order`                |
| `batch_allocations`            | Scomber          | `scomber-pos-checkout`, `-b2b-order`, `-batch-allocate` |
| `store_configs`                | Scomber          | Admin UI                           |
| `scomber_customer_tiers`       | Scomber          | Admin UI                           |

## Edge functions

| Function                        | Purpose                                                  |
| ------------------------------- | -------------------------------------------------------- |
| `scomber-price-resolve`         | Resolve effective price (article × store × channel × tier × date) |
| `scomber-pos-checkout`          | Persist a POS sale + FIFO batch allocation               |
| `scomber-b2b-order`             | Create/confirm a B2B order, optionally allocate batches  |
| `scomber-batch-allocate`        | Manual / corrective batch allocation                     |
| `scomber-makrilltrade-sync`     | Pull articles + batches from Makrilltrade MySQL          |

All functions:
- Require POST + JSON body
- Return `{ ok: true, ... }` on success or `{ ok: false, error, details }`
- Use the service role key — never expose this key to the browser

## Pricing matrix

`price_overrides` is keyed on `(effective_date, article_id, store_id, channel, customer_tier_id)`.
Resolution chooses the most specific match available for the request, then
falls back to `makrilltrade_articles_cache.default_price_ore`.

Specificity score (higher wins):
- `store_id` exact match: +4
- `channel` exact match (vs `any`): +2
- `customer_tier_id` exact match: +1

## MySQL bridge (planned)

`scomber-makrilltrade-sync` currently runs in **stub mode**:
- If `MAKRILLTRADE_MYSQL_URL` is not set, callers may pass `articles[]` and
  `batches[]` payloads to seed the cache (used by tests and Morning-rutin
  during pre-rollout).
- When the read-only MySQL user exists, set `MAKRILLTRADE_MYSQL_URL` and
  implement the real `SELECT` queries inside this function.

## Compliance notes

- All POS sales still flow through `pos_transactions` so the existing
  Skatteverket compliance (sequential `receipt_no`, `control_code`,
  immutable journal) continues to hold.
- Reversals must be created as new negative `pos_transactions` rows via
  `scomber-pos-checkout` — never by editing existing rows.
