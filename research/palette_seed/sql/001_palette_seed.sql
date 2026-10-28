-- HueSense five-color seed tables, MySQL 8.4; isolated namespace, additive migration.
-- Source collection is original palette data; no emotional scoring, role assignment or human validation.
CREATE TABLE IF NOT EXISTS hs_seed_source (
 source_key VARCHAR(40) PRIMARY KEY,
 source_url VARCHAR(512) NOT NULL,
 commit_sha CHAR(40) NOT NULL,
 source_path VARCHAR(255) NOT NULL,
 license_label VARCHAR(128) NOT NULL,
 attribution TEXT NOT NULL,
 license_review VARCHAR(32) NOT NULL DEFAULT 'DOCUMENTED'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS hs_seed_color (
 color_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 hex_code CHAR(7) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 CONSTRAINT hs_color_hex CHECK (hex_code REGEXP '^#[0-9A-F]{6}$')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS hs_palette_seed (
 palette_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 external_key VARCHAR(120) NOT NULL UNIQUE,
 source_key VARCHAR(40) NOT NULL,
 palette_name VARCHAR(128) NOT NULL,
 palette_family VARCHAR(40) NOT NULL,
 swatch_count TINYINT UNSIGNED NOT NULL DEFAULT 5,
 seed_status VARCHAR(36) NOT NULL DEFAULT 'SOURCE_VERIFIED_NOT_BRAND_VALIDATED',
 content_sha256 CHAR(64) NOT NULL,
 CONSTRAINT hs_palette_source_fk FOREIGN KEY(source_key) REFERENCES hs_seed_source(source_key),
 CONSTRAINT hs_palette_five CHECK (swatch_count=5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS hs_palette_seed_color (
 palette_id BIGINT UNSIGNED NOT NULL,
 position_index TINYINT UNSIGNED NOT NULL,
 color_id BIGINT UNSIGNED NOT NULL,
 PRIMARY KEY(palette_id,position_index),
 UNIQUE KEY hs_seed_unique_color(palette_id,color_id),
 CONSTRAINT hs_seed_color_palette_fk FOREIGN KEY(palette_id) REFERENCES hs_palette_seed(palette_id),
 CONSTRAINT hs_seed_color_color_fk FOREIGN KEY(color_id) REFERENCES hs_seed_color(color_id),
 CONSTRAINT hs_position CHECK (position_index BETWEEN 1 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX hs_seed_family ON hs_palette_seed(palette_family,source_key);
-- The application import validator asserts exactly five rows per palette;
-- MySQL CHECK cannot enforce row counts across other rows.
