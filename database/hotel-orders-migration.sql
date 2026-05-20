CREATE TABLE IF NOT EXISTS hotel_kot_orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  hotel_id VARCHAR(50) NOT NULL,
  kot_no VARCHAR(80) NOT NULL,
  table_name VARCHAR(120) NULL,
  waiter_name VARCHAR(120) NULL,
  status ENUM('pending','preparing','ready','served','cancelled') NOT NULL DEFAULT 'pending',
  payload_json JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_hotel_kot_no (hotel_id, kot_no),
  INDEX idx_hotel_kot_status (hotel_id, status),
  INDEX idx_hotel_kot_updated (hotel_id, updated_at),
  CONSTRAINT fk_hotel_kot_hotel_id
    FOREIGN KEY (hotel_id) REFERENCES hotels(hotel_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
