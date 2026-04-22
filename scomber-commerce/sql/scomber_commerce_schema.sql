-- Scomber Commerce — egen databas
--
-- Denna databas är HELT SEPARAT från Makrilltrade.
-- Vi skriver bara här, aldrig till Makrilltrade.
--
-- Kör: mysql -u root < sql/scomber_commerce_schema.sql

CREATE DATABASE IF NOT EXISTS scomber_commerce
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE scomber_commerce;

-- --------------------------------------------------
-- Butikskonfiguration
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS stores (
  store_id         VARCHAR(32) PRIMARY KEY,
  name             VARCHAR(128) NOT NULL,
  org_nr           VARCHAR(16) NOT NULL,
  address          VARCHAR(255),
  postal_city      VARCHAR(64),
  phone            VARCHAR(32),
  vat_nr           VARCHAR(32),
  register_id      VARCHAR(64),
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- --------------------------------------------------
-- Prisregler per SKU
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS pricing_rules (
  sku                      VARCHAR(64) PRIMARY KEY,
  strategy                 ENUM('markup', 'target-margin', 'fixed', 'manual') NOT NULL,
  markup_percent           DECIMAL(5,2) NULL,
  target_margin_percent    DECIMAL(5,2) NULL,
  fixed_price_ore          INT NULL,
  min_price_ore            INT NULL,
  max_price_ore            INT NULL,
  store_multipliers_json   JSON NOT NULL,  -- {"saro": 1.15, "torslanda": 1.0}
  round_to_ore             INT NOT NULL DEFAULT 100,  -- 100 = hela kronor
  updated_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- --------------------------------------------------
-- Manuella prisoverrides per butik och dag
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS price_overrides (
  id               BIGINT PRIMARY KEY AUTO_INCREMENT,
  sku              VARCHAR(64) NOT NULL,
  store_id         VARCHAR(32) NOT NULL,
  price_ore        INT NOT NULL,
  valid_from       DATE NOT NULL,
  valid_until      DATE NULL,         -- NULL = tills vidare
  reason           VARCHAR(255),
  set_by           VARCHAR(64),       -- användar-ID
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sku_store_date (sku, store_id, valid_from),
  FOREIGN KEY (store_id) REFERENCES stores(store_id)
);

-- --------------------------------------------------
-- Transaktioner (kassaförsäljning och B2B-order)
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
  transaction_id       VARCHAR(64) PRIMARY KEY,
  receipt_no           VARCHAR(32) UNIQUE NOT NULL,
  store_id             VARCHAR(32) NOT NULL,
  type                 ENUM('sale', 'return', 'b2b-order') NOT NULL DEFAULT 'sale',
  cashier_id           VARCHAR(64) NOT NULL,
  b2b_customer_id      VARCHAR(64) NULL,
  timestamp            DATETIME NOT NULL,
  total_ore            INT NOT NULL,
  vat_breakdown_json   JSON NOT NULL,
  payment_json         JSON NOT NULL,
  control_code         VARCHAR(64) NULL,
  control_unit_id      VARCHAR(64) NULL,
  status               ENUM('pending', 'completed', 'voided') NOT NULL DEFAULT 'pending',
  created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_store_timestamp (store_id, timestamp),
  INDEX idx_b2b_customer (b2b_customer_id),
  FOREIGN KEY (store_id) REFERENCES stores(store_id)
);

CREATE TABLE IF NOT EXISTS transaction_items (
  id                   BIGINT PRIMARY KEY AUTO_INCREMENT,
  transaction_id       VARCHAR(64) NOT NULL,
  sku                  VARCHAR(64) NOT NULL,
  name                 VARCHAR(255) NOT NULL,
  quantity             INT NOT NULL,
  unit                 ENUM('kg', 'piece') NOT NULL,
  unit_price_ore       INT NOT NULL,
  line_total_ore       INT NOT NULL,
  vat_rate             TINYINT NOT NULL,
  discount_ore         INT NOT NULL DEFAULT 0,
  batch_allocations_json JSON NOT NULL,   -- [{batchId, quantity}, ...]
  line_no              INT NOT NULL,
  FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id)
);

-- --------------------------------------------------
-- B2B-kunder (restauranger som fakturakunder)
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS b2b_customers (
  customer_id          VARCHAR(64) PRIMARY KEY,
  company_name         VARCHAR(255) NOT NULL,
  org_nr               VARCHAR(16) NOT NULL,
  credit_limit_ore     INT NOT NULL DEFAULT 0,
  current_balance_ore  INT NOT NULL DEFAULT 0,
  payment_terms_days   INT NOT NULL DEFAULT 30,
  delivery_address     TEXT,
  contact_email        VARCHAR(255),
  contact_phone        VARCHAR(32),
  active               BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- --------------------------------------------------
-- Journalminne (för Skatteverket, XML-export 2027)
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS journal_entries (
  id               BIGINT PRIMARY KEY AUTO_INCREMENT,
  store_id         VARCHAR(32) NOT NULL,
  register_id      VARCHAR(64) NOT NULL,
  entry_type       ENUM('sale', 'return', 'void', 'open', 'close', 'x-report', 'z-report') NOT NULL,
  timestamp        DATETIME NOT NULL,
  transaction_id   VARCHAR(64) NULL,
  payload_json     JSON NOT NULL,
  sequence_no      BIGINT NOT NULL,  -- kan inte lägga till / ändra senare
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_store_seq (store_id, sequence_no),
  INDEX idx_timestamp (timestamp)
);

-- --------------------------------------------------
-- Audit log för manuella åtgärder
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id               BIGINT PRIMARY KEY AUTO_INCREMENT,
  actor_id         VARCHAR(64) NOT NULL,
  action           VARCHAR(64) NOT NULL,
  entity_type      VARCHAR(64) NOT NULL,
  entity_id        VARCHAR(128) NOT NULL,
  before_json      JSON NULL,
  after_json       JSON NULL,
  reason           TEXT,
  timestamp        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_entity (entity_type, entity_id),
  INDEX idx_actor (actor_id)
);
