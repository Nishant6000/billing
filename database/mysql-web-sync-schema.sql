CREATE DATABASE IF NOT EXISTS ginsoft_pos
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE ginsoft_pos;

CREATE TABLE IF NOT EXISTS hotels (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  hotel_id VARCHAR(50) NOT NULL,
  hotel_name VARCHAR(190) NOT NULL,
  owner_name VARCHAR(190) NULL,
  email VARCHAR(190) NULL,
  phone VARCHAR(30) NULL,
  address TEXT NULL,
  gstin VARCHAR(30) NULL,
  status TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_hotels_hotel_id (hotel_id),
  INDEX idx_hotels_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS licenses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  slno VARCHAR(50) NOT NULL,
  customer_id VARCHAR(190) NOT NULL,
  hotel_id VARCHAR(50) NULL,
  license_code VARCHAR(100) NOT NULL,
  validity_till DATE NOT NULL,
  status TINYINT(1) NOT NULL DEFAULT 1,
  licence_approval TINYINT(1) NOT NULL DEFAULT 1,
  purchase_date DATE NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_license_code (license_code),
  UNIQUE KEY uq_license_slno (slno),
  INDEX idx_license_customer_id (customer_id),
  INDEX idx_license_hotel_id (hotel_id),
  INDEX idx_license_status (status),
  INDEX idx_license_licence_approval (licence_approval),
  INDEX idx_license_validity_till (validity_till),
  CONSTRAINT fk_license_hotel_id
    FOREIGN KEY (hotel_id) REFERENCES hotels(hotel_id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pos_sync_snapshots (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  hotel_id VARCHAR(50) NOT NULL,
  device_id VARCHAR(100) NULL,
  shop_name VARCHAR(190) NULL,
  sync_type ENUM('full_backup','incremental') NOT NULL DEFAULT 'full_backup',
  payload_json LONGTEXT NOT NULL,
  payload_size BIGINT UNSIGNED NOT NULL DEFAULT 0,
  synced_at DATETIME NOT NULL,
  server_received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  INDEX idx_snapshots_hotel_id (hotel_id),
  INDEX idx_snapshots_synced_at (synced_at),
  INDEX idx_snapshots_device_id (device_id),
  CONSTRAINT fk_snapshots_hotel_id
    FOREIGN KEY (hotel_id) REFERENCES hotels(hotel_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pos_latest_snapshots (
  hotel_id VARCHAR(50) NOT NULL,
  device_id VARCHAR(100) NOT NULL DEFAULT 'default',
  shop_name VARCHAR(190) NULL,
  payload_json LONGTEXT NOT NULL,
  payload_size BIGINT UNSIGNED NOT NULL DEFAULT 0,
  last_synced_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (hotel_id, device_id),
  CONSTRAINT fk_latest_snapshots_hotel_id
    FOREIGN KEY (hotel_id) REFERENCES hotels(hotel_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pos_sync_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  hotel_id VARCHAR(50) NOT NULL,
  device_id VARCHAR(100) NULL,
  sync_direction ENUM('upload','download') NOT NULL DEFAULT 'upload',
  sync_status ENUM('success','failed') NOT NULL,
  message TEXT NULL,
  synced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  INDEX idx_logs_hotel_id (hotel_id),
  INDEX idx_logs_status (sync_status),
  INDEX idx_logs_synced_at (synced_at),
  CONSTRAINT fk_logs_hotel_id
    FOREIGN KEY (hotel_id) REFERENCES hotels(hotel_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO hotels (
  hotel_id,
  hotel_name,
  owner_name,
  email,
  phone,
  status
) VALUES (
  'GIN-HOTEL-0001',
  'Demo Hotel',
  'Owner',
  'owner@example.com',
  '9000000000',
  1
) ON DUPLICATE KEY UPDATE
  hotel_name = VALUES(hotel_name),
  owner_name = VALUES(owner_name),
  email = VALUES(email),
  phone = VALUES(phone),
  status = VALUES(status);

INSERT INTO licenses (
  slno,
  customer_id,
  hotel_id,
  license_code,
  validity_till,
  status,
  licence_approval,
  purchase_date
) VALUES (
  'SL-000001',
  'owner@example.com',
  'GIN-HOTEL-0001',
  'GIN-2026-DEMO-0001',
  '2027-05-20',
  1,
  0,
  '2026-05-20'
) ON DUPLICATE KEY UPDATE
  customer_id = VALUES(customer_id),
  hotel_id = VALUES(hotel_id),
  validity_till = VALUES(validity_till),
  status = VALUES(status),
  licence_approval = VALUES(licence_approval),
  purchase_date = VALUES(purchase_date);
