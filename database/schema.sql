CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER,
  product_name TEXT NOT NULL,
  product_name_hi TEXT,
  product_name_ta TEXT,
  product_name_te TEXT,
  product_name_mr TEXT,
  product_name_ml TEXT,
  product_name_kn TEXT,
  barcode TEXT,
  selling_price REAL NOT NULL DEFAULT 0,
  base_quantity REAL NOT NULL DEFAULT 1,
  base_unit TEXT NOT NULL DEFAULT 'Piece',
  package_units_json TEXT,
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
  customer_name TEXT,
  customer_phone TEXT,
  cashier_user_id TEXT,
  cashier_name TEXT,
  cashier_role TEXT,
  status TEXT NOT NULL DEFAULT 'paid',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sale_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER NOT NULL,
  product_id INTEGER,
  product_name TEXT NOT NULL,
  quantity REAL NOT NULL,
  sale_unit TEXT NOT NULL DEFAULT 'Piece',
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

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dining_tables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name TEXT NOT NULL,
  area TEXT,
  seats INTEGER NOT NULL DEFAULT 4,
  status TEXT NOT NULL DEFAULT 'available',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS table_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_id INTEGER,
  order_no TEXT NOT NULL,
  order_type TEXT NOT NULL DEFAULT 'table',
  status TEXT NOT NULL DEFAULT 'open',
  note TEXT,
  order_user_id TEXT,
  order_user_name TEXT,
  order_user_role TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS table_order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  product_id INTEGER,
  product_name TEXT NOT NULL,
  quantity REAL NOT NULL,
  sale_unit TEXT NOT NULL DEFAULT 'Piece',
  item_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS kot_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  table_id INTEGER,
  kot_no TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'printed',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS kot_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kot_id INTEGER NOT NULL,
  product_id INTEGER,
  product_name TEXT NOT NULL,
  quantity REAL NOT NULL,
  sale_unit TEXT NOT NULL DEFAULT 'Piece'
);

CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_no TEXT NOT NULL,
  supplier_name TEXT NOT NULL,
  supplier_gstin TEXT,
  bill_date TEXT NOT NULL,
  subtotal REAL NOT NULL,
  gst_total REAL NOT NULL DEFAULT 0,
  grand_total REAL NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_id INTEGER NOT NULL,
  item_name TEXT NOT NULL,
  hsn TEXT,
  quantity REAL NOT NULL DEFAULT 1,
  taxable_value REAL NOT NULL,
  gst_percent REAL NOT NULL DEFAULT 0,
  gst_amount REAL NOT NULL DEFAULT 0,
  line_total REAL NOT NULL,
  FOREIGN KEY (purchase_id) REFERENCES purchases(id)
);

CREATE TABLE IF NOT EXISTS bill_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER,
  invoice_no TEXT NOT NULL,
  event_type TEXT NOT NULL,
  previous_data TEXT,
  new_data TEXT,
  note TEXT,
  activity_user_id TEXT,
  activity_user_name TEXT,
  activity_user_role TEXT,
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
