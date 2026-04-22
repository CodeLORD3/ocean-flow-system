-- Makrilltrade — REFERENSSCHEMA
--
-- Detta är en GISSNING av hur Makrilltrades tabeller kan se ut.
-- Tim/Joakim ska ersätta adapterns SQL med riktiga namn från Makrilltrade.
--
-- Syftet med denna fil är att:
--   1) Visa vilken form av data adaptern förväntar sig
--   2) Möjliggöra lokal testkörning med mock-data
--
-- KÖR INTE MOT PRODUKTION — detta är bara för dev/test.

CREATE DATABASE IF NOT EXISTS makrilltrade_mock
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE makrilltrade_mock;

-- Artiklar (produktkatalog)
CREATE TABLE IF NOT EXISTS mt_articles (
  article_id       VARCHAR(64) PRIMARY KEY,
  name             VARCHAR(255) NOT NULL,
  species_latin    VARCHAR(128),
  category         VARCHAR(64) NOT NULL,
  unit             ENUM('kg', 'piece') NOT NULL,
  vat_rate         TINYINT NOT NULL DEFAULT 6,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  image_url        VARCHAR(512),
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Batcher / lots
CREATE TABLE IF NOT EXISTS mt_batches (
  batch_id             VARCHAR(64) PRIMARY KEY,
  article_id           VARCHAR(64) NOT NULL,
  caught_date          DATE,
  vessel_name          VARCHAR(128),
  fao_zone             VARCHAR(32),
  msc_certified        BOOLEAN NOT NULL DEFAULT FALSE,
  asc_certified        BOOLEAN NOT NULL DEFAULT FALSE,
  country_origin       VARCHAR(4),
  supplier_name        VARCHAR(128),
  purchase_price_ore   INT NOT NULL,
  purchase_currency    VARCHAR(4) NOT NULL DEFAULT 'SEK',
  fx_rate_sek          DECIMAL(10,4) NOT NULL DEFAULT 1.0,
  received_date        DATE NOT NULL,
  expiry_date          DATE,
  INDEX idx_article (article_id),
  INDEX idx_received (received_date),
  FOREIGN KEY (article_id) REFERENCES mt_articles(article_id)
);

-- Lager per butik
CREATE TABLE IF NOT EXISTS mt_store_inventory (
  store_id             VARCHAR(32) NOT NULL,
  batch_id             VARCHAR(64) NOT NULL,
  article_id           VARCHAR(64) NOT NULL,
  quantity_remaining   INT NOT NULL,          -- gram eller antal
  quantity_reserved    INT NOT NULL DEFAULT 0,
  last_updated         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (store_id, batch_id),
  INDEX idx_article (article_id),
  FOREIGN KEY (batch_id) REFERENCES mt_batches(batch_id),
  FOREIGN KEY (article_id) REFERENCES mt_articles(article_id)
);
