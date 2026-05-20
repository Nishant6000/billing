CREATE TABLE IF NOT EXISTS hotel_users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  hotel_id VARCHAR(50) NOT NULL,
  user_id VARCHAR(60) NOT NULL,
  full_name VARCHAR(120) NOT NULL,
  role ENUM('Waiter','Kitchen','Manager') NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  status TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_hotel_user (hotel_id, user_id),
  INDEX idx_hotel_users_role (hotel_id, role),
  INDEX idx_hotel_users_status (hotel_id, status),
  CONSTRAINT fk_hotel_users_hotel_id
    FOREIGN KEY (hotel_id) REFERENCES hotels(hotel_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
