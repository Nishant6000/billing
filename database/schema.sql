CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER,
  product_name TEXT NOT NULL,
  barcode TEXT,
  selling_price REAL NOT NULL DEFAULT 0,
  product_discount_type TEXT NOT NULL DEFAULT 'none',
  product_discount_value REAL NOT NULL DEFAULT 0,
  gst_percent REAL NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0,
  shelf_no TEXT,
  box_no TEXT,
  description TEXT,
  billing_display TEXT NOT NULL DEFAULT 'stock',
  image TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_no TEXT NOT NULL UNIQUE,
  subtotal REAL NOT NULL,
  discount REAL NOT NULL DEFAULT 0,
  gst_total REAL NOT NULL DEFAULT 0,
  grand_total REAL NOT NULL,
  payment_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'paid',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sale_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER NOT NULL,
  product_id INTEGER,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  price REAL NOT NULL,
  gst_percent REAL NOT NULL,
  gst_amount REAL NOT NULL,
  line_total REAL NOT NULL,
  FOREIGN KEY (sale_id) REFERENCES sales(id)
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER NOT NULL,
  payment_type TEXT NOT NULL,
  amount REAL NOT NULL,
  reference_no TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (sale_id) REFERENCES sales(id)
);

CREATE TABLE IF NOT EXISTS bill_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER,
  invoice_no TEXT NOT NULL,
  event_type TEXT NOT NULL,
  previous_data TEXT,
  new_data TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS hold_bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hold_no TEXT NOT NULL UNIQUE,
  cart_json TEXT NOT NULL,
  customer_note TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
