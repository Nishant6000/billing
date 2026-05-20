ALTER TABLE licenses
  ADD COLUMN licence_approval TINYINT(1) NOT NULL DEFAULT 1 AFTER status;

CREATE INDEX idx_license_licence_approval ON licenses (licence_approval);
