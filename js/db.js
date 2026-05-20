import { APP_CONFIG } from './config.js';
import { calculateCartLines, dateOnly, invoiceNumber, stockQuantityUsed, todayISO } from './utils.js';

class IndexedDBFallback {
  constructor() {
    this.db = null;
  }

  async open() {
    this.db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(APP_CONFIG.dbName, APP_CONFIG.dbVersion);
      request.onupgradeneeded = () => {
        const db = request.result;
        ['categories', 'products', 'sales', 'sale_items', 'payments', 'customers', 'users', 'hold_bills', 'settings', 'bill_audit', 'purchases', 'purchase_items', 'dining_tables', 'table_orders', 'table_order_items', 'kot_tickets', 'kot_items'].forEach(store => {
          if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: store === 'settings' ? 'key' : 'id', autoIncrement: store !== 'settings' });
        });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  store(name, mode = 'readonly') {
    return this.db.transaction(name, mode).objectStore(name);
  }

  async all(name) {
    return await new Promise((resolve, reject) => {
      const request = this.store(name).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async put(name, row) {
    return await new Promise((resolve, reject) => {
      const cleanRow = { ...row };
      if (name !== 'settings' && (cleanRow.id === undefined || cleanRow.id === null || cleanRow.id === '')) {
        delete cleanRow.id;
      }
      const request = this.store(name, 'readwrite').put(cleanRow);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async delete(name, id) {
    return await new Promise((resolve, reject) => {
      const request = this.store(name, 'readwrite').delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clear(name) {
    return await new Promise((resolve, reject) => {
      const request = this.store(name, 'readwrite').clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

const BACKUP_TABLES = [
  'settings',
  'categories',
  'products',
  'sales',
  'sale_items',
  'payments',
  'customers',
  'users',
  'dining_tables',
  'table_orders',
  'table_order_items',
  'kot_tickets',
  'kot_items',
  'hold_bills',
  'bill_audit',
  'purchases',
  'purchase_items'
];

const RESTORE_DELETE_ORDER = [
  'purchase_items',
  'purchases',
  'kot_items',
  'kot_tickets',
  'table_order_items',
  'table_orders',
  'dining_tables',
  'bill_audit',
  'hold_bills',
  'payments',
  'customers',
  'users',
  'sale_items',
  'sales',
  'products',
  'categories',
  'settings'
];

class POSDatabase {
  constructor() {
    this.mode = 'starting';
    this.sqlite = null;
    this.conn = null;
    this.fallback = new IndexedDBFallback();
  }

  async init() {
    try {
      await this.initSqlite();
      this.mode = 'sqlite';
    } catch (error) {
      console.warn('SQLite plugin unavailable, using IndexedDB fallback for browser testing.', error);
      await this.fallback.open();
      this.mode = 'indexeddb';
    }
    await this.seed();
    return this.mode;
  }

  async initSqlite() {
    const core = await import('../node_modules/@capacitor/core/dist/index.js');
    const sqlitePkg = await import('../node_modules/@capacitor-community/sqlite/dist/esm/index.js');
    const { Capacitor } = core;
    const { CapacitorSQLite, SQLiteConnection } = sqlitePkg;
    this.sqlite = new SQLiteConnection(CapacitorSQLite);

    if (Capacitor.getPlatform() === 'web') {
      await this.defineJeepSqlite();
      await customElements.whenDefined('jeep-sqlite');
      const jeep = document.querySelector('jeep-sqlite');
      if (jeep?.componentOnReady) await jeep.componentOnReady();
      await this.sqlite.initWebStore();
    }

    const consistency = await this.sqlite.checkConnectionsConsistency();
    const isConn = (await this.sqlite.isConnection(APP_CONFIG.dbName, false)).result;
    this.conn = consistency.result && isConn
      ? await this.sqlite.retrieveConnection(APP_CONFIG.dbName, false)
      : await this.sqlite.createConnection(APP_CONFIG.dbName, false, 'no-encryption', APP_CONFIG.dbVersion, false);
    await this.conn.open();
    const schema = await fetch('database/schema.sql').then(res => res.text());
    await this.conn.execute(schema);
    await this.run(`
      CREATE TABLE IF NOT EXISTS bill_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_id INTEGER,
        invoice_no TEXT NOT NULL,
        event_type TEXT NOT NULL,
        previous_data TEXT,
        new_data TEXT,
        note TEXT,
        created_at TEXT NOT NULL
      )
    `);
    await this.run(`
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
      )
    `);
    await this.run(`
      CREATE TABLE IF NOT EXISTS purchase_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        purchase_id INTEGER NOT NULL,
        item_name TEXT NOT NULL,
        hsn TEXT,
        quantity REAL NOT NULL DEFAULT 1,
        taxable_value REAL NOT NULL,
        gst_percent REAL NOT NULL DEFAULT 0,
        gst_amount REAL NOT NULL DEFAULT 0,
        line_total REAL NOT NULL
      )
    `);
    await this.ensureRestaurantTables();
    await this.ensureCustomersTable();
    await this.ensureUsersTable();
    await this.ensureProductColumns();
    await this.ensureSalesColumns();
    await this.ensureAuditColumns();
    await this.ensureSaleItemColumns();
    if (Capacitor.getPlatform() === 'web') await this.sqlite.saveToStore(APP_CONFIG.dbName);
  }

  async ensureProductColumns() {
    const columns = await this.query('PRAGMA table_info(products)');
    const names = columns.map(column => column.name);
    for (const language of ['hi', 'ta', 'te', 'mr', 'ml', 'kn']) {
      if (!names.includes(`product_name_${language}`)) await this.run(`ALTER TABLE products ADD COLUMN product_name_${language} TEXT`);
    }
    if (!names.includes('shelf_no')) await this.run('ALTER TABLE products ADD COLUMN shelf_no TEXT');
    if (!names.includes('box_no')) await this.run('ALTER TABLE products ADD COLUMN box_no TEXT');
    if (!names.includes('description')) await this.run('ALTER TABLE products ADD COLUMN description TEXT');
    if (!names.includes('billing_display')) await this.run("ALTER TABLE products ADD COLUMN billing_display TEXT NOT NULL DEFAULT 'stock'");
    if (!names.includes('product_discount_type')) await this.run("ALTER TABLE products ADD COLUMN product_discount_type TEXT NOT NULL DEFAULT 'none'");
    if (!names.includes('product_discount_value')) await this.run('ALTER TABLE products ADD COLUMN product_discount_value REAL NOT NULL DEFAULT 0');
    if (!names.includes('base_quantity')) await this.run('ALTER TABLE products ADD COLUMN base_quantity REAL NOT NULL DEFAULT 1');
    if (!names.includes('base_unit')) await this.run("ALTER TABLE products ADD COLUMN base_unit TEXT NOT NULL DEFAULT 'Piece'");
    if (!names.includes('package_units_json')) await this.run('ALTER TABLE products ADD COLUMN package_units_json TEXT');
    if (!names.includes('fulfillment_station')) await this.run("ALTER TABLE products ADD COLUMN fulfillment_station TEXT NOT NULL DEFAULT 'kitchen'");
  }

  async ensureSaleItemColumns() {
    const columns = await this.query('PRAGMA table_info(sale_items)');
    const names = columns.map(column => column.name);
    if (!names.includes('sale_unit')) await this.run("ALTER TABLE sale_items ADD COLUMN sale_unit TEXT NOT NULL DEFAULT 'Piece'");
  }

  async ensureSalesColumns() {
    const columns = await this.query('PRAGMA table_info(sales)');
    const names = columns.map(column => column.name);
    if (!names.includes('customer_name')) await this.run('ALTER TABLE sales ADD COLUMN customer_name TEXT');
    if (!names.includes('customer_phone')) await this.run('ALTER TABLE sales ADD COLUMN customer_phone TEXT');
    if (!names.includes('cashier_user_id')) await this.run('ALTER TABLE sales ADD COLUMN cashier_user_id TEXT');
    if (!names.includes('cashier_name')) await this.run('ALTER TABLE sales ADD COLUMN cashier_name TEXT');
    if (!names.includes('cashier_role')) await this.run('ALTER TABLE sales ADD COLUMN cashier_role TEXT');
  }

  async ensureAuditColumns() {
    const columns = await this.query('PRAGMA table_info(bill_audit)');
    const names = columns.map(column => column.name);
    if (!names.includes('activity_user_id')) await this.run('ALTER TABLE bill_audit ADD COLUMN activity_user_id TEXT');
    if (!names.includes('activity_user_name')) await this.run('ALTER TABLE bill_audit ADD COLUMN activity_user_name TEXT');
    if (!names.includes('activity_user_role')) await this.run('ALTER TABLE bill_audit ADD COLUMN activity_user_role TEXT');
  }

  async ensureUsersTable() {
    await this.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL,
        pin_hash TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    const columns = await this.query('PRAGMA table_info(users)');
    const names = columns.map(column => column.name);
    if (!names.includes('user_id')) await this.run('ALTER TABLE users ADD COLUMN user_id TEXT');
    const users = await this.query('SELECT id, full_name, user_id FROM users');
    for (const user of users.filter(item => !item.user_id)) {
      await this.run('UPDATE users SET user_id=? WHERE id=?', [this.userIdFromName(user.full_name || `user${user.id}`), user.id]);
    }
  }

  async ensureCustomersTable() {
    await this.run(`
      CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_name TEXT NOT NULL,
        mobile TEXT NOT NULL,
        gstin TEXT,
        address TEXT,
        credit_limit REAL NOT NULL DEFAULT 0,
        credit_balance REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    const customerColumns = await this.query('PRAGMA table_info(customers)');
    const customerNames = customerColumns.map(column => column.name);
    if (!customerNames.includes('credit_limit')) await this.run('ALTER TABLE customers ADD COLUMN credit_limit REAL NOT NULL DEFAULT 0');
    if (!customerNames.includes('credit_balance')) await this.run('ALTER TABLE customers ADD COLUMN credit_balance REAL NOT NULL DEFAULT 0');
  }

  async ensureRestaurantTables() {
    await this.run(`
      CREATE TABLE IF NOT EXISTS dining_tables (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT NOT NULL,
        area TEXT,
        seats INTEGER NOT NULL DEFAULT 4,
        status TEXT NOT NULL DEFAULT 'available',
        created_at TEXT NOT NULL
      )
    `);
    await this.run(`
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
      )
    `);
    const orderColumns = await this.query('PRAGMA table_info(table_orders)');
    const orderNames = orderColumns.map(column => column.name);
    if (!orderNames.includes('order_user_id')) await this.run('ALTER TABLE table_orders ADD COLUMN order_user_id TEXT');
    if (!orderNames.includes('order_user_name')) await this.run('ALTER TABLE table_orders ADD COLUMN order_user_name TEXT');
    if (!orderNames.includes('order_user_role')) await this.run('ALTER TABLE table_orders ADD COLUMN order_user_role TEXT');
    await this.run(`
      CREATE TABLE IF NOT EXISTS table_order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        product_id INTEGER,
        product_name TEXT NOT NULL,
        quantity REAL NOT NULL,
        sale_unit TEXT NOT NULL DEFAULT 'Piece',
        item_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);
    await this.run(`
      CREATE TABLE IF NOT EXISTS kot_tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        table_id INTEGER,
        kot_no TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'printed',
        created_at TEXT NOT NULL
      )
    `);
    const kotColumns = await this.query('PRAGMA table_info(kot_tickets)');
    const kotNames = kotColumns.map(column => column.name);
    if (!kotNames.includes('table_name')) await this.run('ALTER TABLE kot_tickets ADD COLUMN table_name TEXT');
    if (!kotNames.includes('station')) await this.run("ALTER TABLE kot_tickets ADD COLUMN station TEXT NOT NULL DEFAULT 'kitchen'");
    if (!kotNames.includes('order_user_id')) await this.run('ALTER TABLE kot_tickets ADD COLUMN order_user_id TEXT');
    if (!kotNames.includes('order_user_name')) await this.run('ALTER TABLE kot_tickets ADD COLUMN order_user_name TEXT');
    if (!kotNames.includes('order_user_role')) await this.run('ALTER TABLE kot_tickets ADD COLUMN order_user_role TEXT');
    if (!kotNames.includes('updated_at')) await this.run('ALTER TABLE kot_tickets ADD COLUMN updated_at TEXT');
    await this.run(`
      CREATE TABLE IF NOT EXISTS kot_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kot_id INTEGER NOT NULL,
        product_id INTEGER,
        product_name TEXT NOT NULL,
        quantity REAL NOT NULL,
        sale_unit TEXT NOT NULL DEFAULT 'Piece',
        status TEXT NOT NULL DEFAULT 'pending',
        updated_at TEXT
      )
    `);
    const kotItemColumns = await this.query('PRAGMA table_info(kot_items)');
    const kotItemNames = kotItemColumns.map(column => column.name);
    if (!kotItemNames.includes('status')) await this.run("ALTER TABLE kot_items ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'");
    if (!kotItemNames.includes('updated_at')) await this.run('ALTER TABLE kot_items ADD COLUMN updated_at TEXT');
  }

  async defineJeepSqlite() {
    if (customElements.get('jeep-sqlite')) return;
    const candidates = [
      '../node_modules/jeep-sqlite/loader/index.es2017.js',
      '../node_modules/jeep-sqlite/dist/loader/index.es2017.js'
    ];
    for (const path of candidates) {
      try {
        const loader = await import(path);
        if (loader.defineCustomElements) {
          loader.defineCustomElements(window);
          return;
        }
      } catch (_) {
        // Try the next package layout; jeep-sqlite paths vary between releases.
      }
    }
    throw new Error('jeep-sqlite loader was not found. Run npm install first.');
  }

  async run(statement, values = []) {
    if (!this.conn) return null;
    const result = await this.conn.run(statement, values);
    await this.persistWeb();
    return result;
  }

  async query(statement, values = []) {
    if (!this.conn) return [];
    const result = await this.conn.query(statement, values);
    return result.values || [];
  }

  async persistWeb() {
    try {
      const { Capacitor } = await import('../node_modules/@capacitor/core/dist/index.js');
      if (Capacitor.getPlatform() === 'web') await this.sqlite.saveToStore(APP_CONFIG.dbName);
    } catch (_) {}
  }

  async seed() {
    const settings = await this.getSettings();
    if (!settings.shop_name) {
      await Promise.all(Object.entries(APP_CONFIG.defaultSettings).map(([key, value]) => this.saveSetting(key, value)));
    }
    const users = await this.getUsers();
    if (!users.length) {
      await this.saveUser({ user_id: 'owner', full_name: 'Owner', role: 'Owner', pin: '1234', status: 'active' });
    }
    const categories = await this.getCategories();
    if (!categories.length) {
      for (const name of ['Grocery', 'Snacks', 'Beverages', 'Personal Care']) {
        await this.saveCategory({ category_name: name });
      }
    }
    const products = await this.getProducts();
    if (!products.length) {
      await this.saveProduct({ category_id: 1, product_name: 'Premium Rice 1kg', barcode: '890100000001', selling_price: 78, base_quantity: 1, base_unit: 'KG', product_discount_type: 'none', product_discount_value: 0, gst_percent: 5, stock: 120, shelf_no: 'A1', box_no: 'B01', description: 'Long grain daily rice pack', billing_display: 'stock', image: '' });
      await this.saveProduct({ category_id: 2, product_name: 'Masala Chips', barcode: '890100000002', selling_price: 20, base_quantity: 1, base_unit: 'Packet', product_discount_type: 'percent', product_discount_value: 5, gst_percent: 12, stock: 200, shelf_no: 'A2', box_no: 'B02', description: 'Spicy snack pouch', billing_display: 'shelf_no', image: '' });
      await this.saveProduct({ category_id: 3, product_name: 'Cold Coffee', barcode: '890100000003', selling_price: 55, base_quantity: 250, base_unit: 'ML', product_discount_type: 'amount', product_discount_value: 5, gst_percent: 18, stock: 75, shelf_no: 'C1', box_no: 'CH1', description: 'Ready to drink coffee', billing_display: 'box_no', image: '' });
      await this.saveProduct({ category_id: 4, product_name: 'Herbal Soap', barcode: '890100000004', selling_price: 42, base_quantity: 1, base_unit: 'Piece', product_discount_type: 'none', product_discount_value: 0, gst_percent: 18, stock: 90, shelf_no: 'D3', box_no: 'BX4', description: 'Gentle herbal bath soap', billing_display: 'description', image: '' });
    }
    const tables = await this.getDiningTables();
    if (!tables.length) {
      for (let index = 1; index <= 6; index += 1) {
        await this.saveDiningTable({ table_name: `Table ${index}`, area: index <= 3 ? 'Ground Floor' : 'Family', seats: 4 });
      }
    }
  }

  async getSettings() {
    if (this.mode === 'sqlite') {
      const rows = await this.query('SELECT key, value FROM settings');
      return Object.fromEntries(rows.map(row => [row.key, row.value]));
    }
    const rows = await this.fallback.all('settings');
    return Object.fromEntries(rows.map(row => [row.key, row.value]));
  }

  async saveSetting(key, value) {
    if (this.mode === 'sqlite') return await this.run('INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)', [key, String(value ?? '')]);
    return await this.fallback.put('settings', { key, value: String(value ?? '') });
  }

  async getCustomers(search = '') {
    const rows = await this.getCustomerRows();
    const sales = await this.getSales();
    const byMobile = new Map();
    rows.forEach(row => {
      if (row.mobile) byMobile.set(String(row.mobile), row);
    });
    sales
      .filter(sale => sale.customer_name && sale.customer_phone)
      .forEach(sale => {
        const mobile = String(sale.customer_phone || '').trim();
        if (!mobile || byMobile.has(mobile)) return;
        byMobile.set(mobile, {
          id: `sale-${sale.id}`,
          customer_name: sale.customer_name,
          mobile,
          gstin: '',
          address: '',
          created_at: sale.created_at,
          updated_at: sale.created_at,
          source: 'sale'
        });
      });
    const term = String(search || '').trim().toLowerCase();
    return [...byMobile.values()]
      .sort((a, b) => String(a.customer_name || '').localeCompare(String(b.customer_name || '')))
      .filter(row => !term || `${row.customer_name || ''} ${row.mobile || ''} ${row.gstin || ''}`.toLowerCase().includes(term));
  }

  async getCustomerRows() {
    return this.mode === 'sqlite'
      ? await this.query('SELECT * FROM customers ORDER BY customer_name')
      : await this.fallback.all('customers');
  }

  async saveCustomer(customer = {}) {
    const now = todayISO();
    const row = {
      ...customer,
      customer_name: String(customer.customer_name || '').trim(),
      mobile: String(customer.mobile || '').trim(),
      gstin: String(customer.gstin || '').trim(),
      address: String(customer.address || '').trim(),
      credit_limit: Number(customer.credit_limit || 0),
      credit_balance: Number(customer.credit_balance || 0),
      updated_at: now
    };
    if (!row.customer_name) throw new Error('Customer name is required');
    if (!row.mobile) throw new Error('Mobile number is required');
    if (!row.id) {
      const existing = (await this.getCustomerRows()).find(item => String(item.mobile || '') === row.mobile);
      if (existing) throw new Error('Phone number already exists');
    } else {
      const duplicate = (await this.getCustomerRows()).find(item => String(item.mobile || '') === row.mobile && String(item.id) !== String(row.id));
      if (duplicate) throw new Error('Phone number already exists');
    }
    if (this.mode === 'sqlite') {
      if (row.id) {
        return await this.run('UPDATE customers SET customer_name=?, mobile=?, gstin=?, address=?, credit_limit=?, credit_balance=?, updated_at=? WHERE id=?', [row.customer_name, row.mobile, row.gstin, row.address, row.credit_limit, row.credit_balance, row.updated_at, row.id]);
      }
      return await this.run('INSERT INTO customers(customer_name, mobile, gstin, address, credit_limit, credit_balance, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)', [row.customer_name, row.mobile, row.gstin, row.address, row.credit_limit, row.credit_balance, now, now]);
    }
    return await this.fallback.put('customers', { ...row, created_at: row.created_at || now });
  }

  async deleteCustomer(id) {
    if (this.mode === 'sqlite') return await this.run('DELETE FROM customers WHERE id=?', [id]);
    return await this.fallback.delete('customers', Number(id));
  }

  async hashPin(pin) {
    const value = `ginsoft-pos:${String(pin || '')}`;
    if (globalThis.crypto?.subtle) {
      const bytes = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
      return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    }
    return `plain:${value}`;
  }

  sanitizeUser(row = {}) {
    const { pin_hash, ...user } = row;
    user.user_id = user.user_id || this.userIdFromName(user.full_name || `user${user.id || ''}`);
    return user;
  }

  userIdFromName(value = '') {
    return String(value || 'user')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 32) || 'user';
  }

  async getUsers() {
    const rows = this.mode === 'sqlite'
      ? await this.query('SELECT * FROM users ORDER BY role, full_name')
      : await this.fallback.all('users');
    return rows
      .map(row => this.sanitizeUser(row))
      .sort((a, b) => `${a.role}${a.full_name}`.localeCompare(`${b.role}${b.full_name}`));
  }

  async getRawUsers() {
    return this.mode === 'sqlite'
      ? await this.query('SELECT * FROM users ORDER BY role, full_name')
      : (await this.fallback.all('users')).map(row => ({
        ...row,
        user_id: row.user_id || this.userIdFromName(row.full_name || `user${row.id || ''}`)
      }));
  }

  async authenticateUser(userId, pin) {
    const pinHash = await this.hashPin(pin);
    const normalizedUserId = this.userIdFromName(userId);
    const users = await this.getRawUsers();
    const user = users.find(row => row.status !== 'inactive' && this.userIdFromName(row.user_id || row.full_name) === normalizedUserId && row.pin_hash === pinHash);
    return user ? this.sanitizeUser(user) : null;
  }

  async saveUser(user) {
    const now = todayISO();
    const row = {
      ...user,
      user_id: this.userIdFromName(user.user_id || user.full_name),
      full_name: String(user.full_name || '').trim(),
      role: APP_CONFIG.roles.includes(user.role) ? user.role : 'Cashier',
      status: user.status === 'inactive' ? 'inactive' : 'active',
      updated_at: now
    };
    if (!row.full_name) throw new Error('User name is required');
    if (!row.user_id) throw new Error('User ID is required');
    if (!row.id && !row.pin) throw new Error('PIN is required');
    if (row.pin && !/^\d{4,8}$/.test(String(row.pin))) throw new Error('PIN must be 4 to 8 digits');
    const pinHash = row.pin ? await this.hashPin(row.pin) : '';
    const users = await this.getRawUsers();
    const duplicate = users.find(item => Number(item.id) !== Number(row.id || 0) && this.userIdFromName(item.user_id || item.full_name) === row.user_id);
    if (duplicate) throw new Error('User ID already exists');

    if (this.mode === 'sqlite') {
      if (row.id) {
        if (pinHash) {
          return await this.run('UPDATE users SET user_id=?, full_name=?, role=?, pin_hash=?, status=?, updated_at=? WHERE id=?', [row.user_id, row.full_name, row.role, pinHash, row.status, row.updated_at, row.id]);
        }
        return await this.run('UPDATE users SET user_id=?, full_name=?, role=?, status=?, updated_at=? WHERE id=?', [row.user_id, row.full_name, row.role, row.status, row.updated_at, row.id]);
      }
      return await this.run('INSERT INTO users(user_id, full_name, role, pin_hash, status, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?)', [row.user_id, row.full_name, row.role, pinHash, row.status, now, now]);
    }

    const existing = row.id ? (await this.fallback.all('users')).find(item => Number(item.id) === Number(row.id)) : null;
    return await this.fallback.put('users', {
      ...existing,
      id: row.id ? Number(row.id) : undefined,
      user_id: row.user_id,
      full_name: row.full_name,
      role: row.role,
      pin_hash: pinHash || existing?.pin_hash,
      status: row.status,
      created_at: existing?.created_at || now,
      updated_at: row.updated_at
    });
  }

  async deleteUser(id) {
    const users = await this.getRawUsers();
    const target = users.find(user => Number(user.id) === Number(id));
    const activeOwners = users.filter(user => user.role === 'Owner' && user.status !== 'inactive');
    if (target?.role === 'Owner' && activeOwners.length <= 1) throw new Error('At least one active Owner must remain');
    if (this.mode === 'sqlite') return await this.run('DELETE FROM users WHERE id=?', [id]);
    return await this.fallback.delete('users', Number(id));
  }

  async getCategories() {
    if (this.mode === 'sqlite') return await this.query('SELECT * FROM categories ORDER BY category_name');
    return (await this.fallback.all('categories')).sort((a, b) => a.category_name.localeCompare(b.category_name));
  }

  async saveCategory(category) {
    const row = { ...category, created_at: category.created_at || todayISO() };
    if (this.mode === 'sqlite') {
      if (row.id) return await this.run('UPDATE categories SET category_name=? WHERE id=?', [row.category_name, row.id]);
      return await this.run('INSERT INTO categories(category_name, created_at) VALUES(?, ?)', [row.category_name, row.created_at]);
    }
    return await this.fallback.put('categories', row);
  }

  async getProducts(search = '') {
    if (this.mode === 'sqlite') {
      return await this.query(`
        SELECT p.*, c.category_name FROM products p
        LEFT JOIN categories c ON c.id = p.category_id
        WHERE LOWER(p.product_name) LIKE ?
          OR LOWER(IFNULL(p.product_name_hi, '')) LIKE ?
          OR LOWER(IFNULL(p.product_name_ta, '')) LIKE ?
          OR LOWER(IFNULL(p.product_name_te, '')) LIKE ?
          OR LOWER(IFNULL(p.product_name_mr, '')) LIKE ?
          OR LOWER(IFNULL(p.product_name_ml, '')) LIKE ?
          OR LOWER(IFNULL(p.product_name_kn, '')) LIKE ?
          OR LOWER(IFNULL(p.barcode, '')) LIKE ?
        ORDER BY p.product_name
      `, Array(8).fill(`%${search.toLowerCase()}%`));
    }
    const categories = await this.getCategories();
    return (await this.fallback.all('products'))
      .filter(p => `${p.product_name} ${p.product_name_hi || ''} ${p.product_name_ta || ''} ${p.product_name_te || ''} ${p.product_name_mr || ''} ${p.product_name_ml || ''} ${p.product_name_kn || ''} ${p.barcode}`.toLowerCase().includes(search.toLowerCase()))
      .map(p => ({ ...p, category_name: categories.find(c => Number(c.id) === Number(p.category_id))?.category_name || '' }))
      .sort((a, b) => a.product_name.localeCompare(b.product_name));
  }

  async saveProduct(product) {
    const row = { ...product, created_at: product.created_at || todayISO() };
    if (this.mode === 'sqlite') {
      if (row.id) {
        return await this.run(`
          UPDATE products SET category_id=?, product_name=?, product_name_hi=?, product_name_ta=?, product_name_te=?, product_name_mr=?, product_name_ml=?, product_name_kn=?, barcode=?, selling_price=?, base_quantity=?, base_unit=?, package_units_json=?, product_discount_type=?, product_discount_value=?, gst_percent=?, stock=?, shelf_no=?, box_no=?, description=?, billing_display=?, fulfillment_station=?, image=? WHERE id=?
        `, [row.category_id, row.product_name, row.product_name_hi || '', row.product_name_ta || '', row.product_name_te || '', row.product_name_mr || '', row.product_name_ml || '', row.product_name_kn || '', row.barcode, row.selling_price, row.base_quantity || 1, row.base_unit || 'Piece', row.package_units_json || '', row.product_discount_type || 'none', row.product_discount_value || 0, row.gst_percent, row.stock, row.shelf_no || '', row.box_no || '', row.description || '', row.billing_display || 'stock', row.fulfillment_station || 'kitchen', row.image, row.id]);
      }
      return await this.run(`
        INSERT INTO products(category_id, product_name, product_name_hi, product_name_ta, product_name_te, product_name_mr, product_name_ml, product_name_kn, barcode, selling_price, base_quantity, base_unit, package_units_json, product_discount_type, product_discount_value, gst_percent, stock, shelf_no, box_no, description, billing_display, fulfillment_station, image, created_at)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [row.category_id, row.product_name, row.product_name_hi || '', row.product_name_ta || '', row.product_name_te || '', row.product_name_mr || '', row.product_name_ml || '', row.product_name_kn || '', row.barcode, row.selling_price, row.base_quantity || 1, row.base_unit || 'Piece', row.package_units_json || '', row.product_discount_type || 'none', row.product_discount_value || 0, row.gst_percent, row.stock, row.shelf_no || '', row.box_no || '', row.description || '', row.billing_display || 'stock', row.fulfillment_station || 'kitchen', row.image, row.created_at]);
    }
    return await this.fallback.put('products', row);
  }

  async deleteProduct(id) {
    if (this.mode === 'sqlite') return await this.run('DELETE FROM products WHERE id=?', [id]);
    return await this.fallback.delete('products', Number(id));
  }

  async savePurchase({ purchase_no, supplier_name, supplier_gstin = '', bill_date, note = '', items }) {
    const subtotal = items.reduce((sum, item) => sum + Number(item.taxable_value || 0), 0);
    const gstTotal = items.reduce((sum, item) => sum + Number(item.taxable_value || 0) * (Number(item.gst_percent || 0) / 100), 0);
    const grandTotal = subtotal + gstTotal;
    const created = todayISO();

    if (this.mode === 'sqlite') {
      const result = await this.run(`
        INSERT INTO purchases(purchase_no, supplier_name, supplier_gstin, bill_date, subtotal, gst_total, grand_total, note, created_at)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [purchase_no, supplier_name, supplier_gstin, bill_date, subtotal, gstTotal, grandTotal, note, created]);
      const purchaseId = result.changes?.lastId;
      for (const item of items) {
        const taxable = Number(item.taxable_value || 0);
        const gstAmount = taxable * (Number(item.gst_percent || 0) / 100);
        await this.run(`
          INSERT INTO purchase_items(purchase_id, item_name, hsn, quantity, taxable_value, gst_percent, gst_amount, line_total)
          VALUES(?, ?, ?, ?, ?, ?, ?, ?)
        `, [purchaseId, item.item_name, item.hsn || '', Number(item.quantity || 1), taxable, Number(item.gst_percent || 0), gstAmount, taxable + gstAmount]);
      }
      return purchaseId;
    }

    const purchaseId = await this.fallback.put('purchases', { purchase_no, supplier_name, supplier_gstin, bill_date, subtotal, gst_total: gstTotal, grand_total: grandTotal, note, created_at: created });
    for (const item of items) {
      const taxable = Number(item.taxable_value || 0);
      const gstAmount = taxable * (Number(item.gst_percent || 0) / 100);
      await this.fallback.put('purchase_items', { purchase_id: purchaseId, item_name: item.item_name, hsn: item.hsn || '', quantity: Number(item.quantity || 1), taxable_value: taxable, gst_percent: Number(item.gst_percent || 0), gst_amount: gstAmount, line_total: taxable + gstAmount });
    }
    return purchaseId;
  }

  async getPurchases({ from = '', to = '', search = '' } = {}) {
    let rows = this.mode === 'sqlite'
      ? await this.query('SELECT * FROM purchases ORDER BY bill_date DESC, created_at DESC')
      : await this.fallback.all('purchases');
    rows = rows.sort((a, b) => `${b.bill_date}${b.created_at}`.localeCompare(`${a.bill_date}${a.created_at}`));
    return rows.filter(row => {
      const day = dateOnly(row.bill_date || row.created_at);
      const haystack = `${row.purchase_no} ${row.supplier_name} ${row.supplier_gstin}`.toLowerCase();
      return (!from || day >= from) && (!to || day <= to) && (!search || haystack.includes(search.toLowerCase()));
    });
  }

  async getPurchaseItems(purchaseId) {
    const rows = this.mode === 'sqlite'
      ? await this.query('SELECT * FROM purchase_items WHERE purchase_id=?', [purchaseId])
      : await this.fallback.all('purchase_items');
    return rows.filter(row => Number(row.purchase_id) === Number(purchaseId));
  }

  async deletePurchase(id) {
    if (this.mode === 'sqlite') {
      await this.run('DELETE FROM purchase_items WHERE purchase_id=?', [id]);
      return await this.run('DELETE FROM purchases WHERE id=?', [id]);
    }
    await Promise.all((await this.getPurchaseItems(id)).map(item => this.fallback.delete('purchase_items', item.id)));
    return await this.fallback.delete('purchases', Number(id));
  }

  async getDiningTables() {
    const rows = this.mode === 'sqlite'
      ? await this.query('SELECT * FROM dining_tables ORDER BY area, table_name')
      : await this.fallback.all('dining_tables');
    const orders = await this.getOpenTableOrders();
    return rows
      .map(table => ({
        ...table,
        status: orders.some(order => Number(order.table_id) === Number(table.id)) ? 'occupied' : (table.status || 'available')
      }))
      .sort((a, b) => `${a.area || ''}${a.table_name}`.localeCompare(`${b.area || ''}${b.table_name}`));
  }

  async saveDiningTable(table) {
    const row = { ...table, created_at: table.created_at || todayISO(), status: table.status || 'available' };
    if (this.mode === 'sqlite') {
      if (row.id) return await this.run('UPDATE dining_tables SET table_name=?, area=?, seats=?, status=? WHERE id=?', [row.table_name, row.area || '', Number(row.seats || 4), row.status, row.id]);
      return await this.run('INSERT INTO dining_tables(table_name, area, seats, status, created_at) VALUES(?, ?, ?, ?, ?)', [row.table_name, row.area || '', Number(row.seats || 4), row.status, row.created_at]);
    }
    return await this.fallback.put('dining_tables', row);
  }

  async deleteDiningTable(id) {
    const active = await this.getActiveTableOrder(id);
    if (active) throw new Error('Close the active order before deleting this table');
    if (this.mode === 'sqlite') return await this.run('DELETE FROM dining_tables WHERE id=?', [id]);
    return await this.fallback.delete('dining_tables', Number(id));
  }

  async getOpenTableOrders() {
    const rows = this.mode === 'sqlite'
      ? await this.query("SELECT * FROM table_orders WHERE status='open' ORDER BY updated_at DESC")
      : await this.fallback.all('table_orders');
    return rows.filter(row => row.status === 'open');
  }

  async getActiveTableOrder(tableId, orderType = 'table') {
    const rows = await this.getOpenTableOrders();
    return rows.find(row => orderType === 'table'
      ? Number(row.table_id) === Number(tableId)
      : row.order_type === orderType && !row.table_id) || null;
  }

  async getTableOrderItems(orderId) {
    const rows = this.mode === 'sqlite'
      ? await this.query('SELECT * FROM table_order_items WHERE order_id=?', [orderId])
      : await this.fallback.all('table_order_items');
    const items = rows
      .filter(row => Number(row.order_id) === Number(orderId))
      .map(row => ({ ...JSON.parse(row.item_json || '{}'), quantity: Number(row.quantity), sale_unit: row.sale_unit || 'Piece' }));
    return this.mergeOrderItems(items);
  }

  mergeOrderItems(items = []) {
    const map = new Map();
    items.forEach(item => {
      const unit = item.sale_unit || item.base_unit || 'Piece';
      const key = `${Number(item.id || item.product_id || 0)}|${unit}`;
      const existing = map.get(key);
      if (existing) {
        existing.quantity = Number(existing.quantity || 0) + Number(item.quantity || 0);
        return;
      }
      map.set(key, { ...item, sale_unit: unit, quantity: Number(item.quantity || 0) });
    });
    return [...map.values()].filter(item => Number(item.quantity || 0) > 0);
  }

  async saveTableOrder({ tableId = null, orderType = 'table', items = [], note = '', user = null }) {
    const now = todayISO();
    const actor = this.actorFromUser(user);
    const mergedItems = this.mergeOrderItems(items);
    let order = orderType === 'table' ? await this.getActiveTableOrder(tableId) : await this.getActiveTableOrder(null, orderType);
    if (this.mode === 'sqlite') {
      if (!order) {
        const result = await this.run(`
          INSERT INTO table_orders(table_id, order_no, order_type, status, note, order_user_id, order_user_name, order_user_role, created_at, updated_at)
          VALUES(?, ?, ?, 'open', ?, ?, ?, ?, ?, ?)
        `, [tableId, `ORD-${Date.now()}`, orderType, note, actor.user_id, actor.full_name, actor.role, now, now]);
        order = { id: result.changes?.lastId, table_id: tableId, order_type: orderType };
      } else {
        await this.run('UPDATE table_orders SET note=?, order_user_id=?, order_user_name=?, order_user_role=?, updated_at=? WHERE id=?', [note, actor.user_id, actor.full_name, actor.role, now, order.id]);
      }
      await this.run('DELETE FROM table_order_items WHERE order_id=?', [order.id]);
      for (const item of mergedItems) {
        await this.run(`
          INSERT INTO table_order_items(order_id, product_id, product_name, quantity, sale_unit, item_json, created_at)
          VALUES(?, ?, ?, ?, ?, ?, ?)
        `, [order.id, item.id, item.product_name, Number(item.quantity || 0), item.sale_unit || item.base_unit || 'Piece', JSON.stringify(item), now]);
      }
      if (tableId) await this.run("UPDATE dining_tables SET status='occupied' WHERE id=?", [tableId]);
      return order.id;
    }

    if (!order) {
      const orderId = await this.fallback.put('table_orders', { table_id: tableId, order_no: `ORD-${Date.now()}`, order_type: orderType, status: 'open', note, order_user_id: actor.user_id, order_user_name: actor.full_name, order_user_role: actor.role, created_at: now, updated_at: now });
      order = { id: orderId, table_id: tableId, order_type: orderType };
    } else {
      await this.fallback.put('table_orders', { ...order, note, order_user_id: actor.user_id, order_user_name: actor.full_name, order_user_role: actor.role, updated_at: now });
      await Promise.all((await this.fallback.all('table_order_items')).filter(row => Number(row.order_id) === Number(order.id)).map(row => this.fallback.delete('table_order_items', row.id)));
    }
    for (const item of mergedItems) {
      await this.fallback.put('table_order_items', { order_id: order.id, product_id: item.id, product_name: item.product_name, quantity: Number(item.quantity || 0), sale_unit: item.sale_unit || item.base_unit || 'Piece', item_json: JSON.stringify(item), created_at: now });
    }
    if (tableId) {
      const table = (await this.fallback.all('dining_tables')).find(row => Number(row.id) === Number(tableId));
      if (table) await this.fallback.put('dining_tables', { ...table, status: 'occupied' });
    }
    return order.id;
  }

  async createKot({ orderId, tableId = null, items = [], station = 'kitchen' }) {
    const kotNo = `KOT-${Date.now()}`;
    const created = todayISO();
    const order = (await this.getOpenTableOrders()).find(row => Number(row.id) === Number(orderId)) || {};
    const table = tableId ? (await this.getDiningTables()).find(row => Number(row.id) === Number(tableId)) : null;
    if (this.mode === 'sqlite') {
      const result = await this.run(`
        INSERT INTO kot_tickets(order_id, table_id, kot_no, status, table_name, station, order_user_id, order_user_name, order_user_role, created_at, updated_at)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [orderId, tableId, kotNo, 'pending', table?.table_name || order.order_type || '', station || 'kitchen', order.order_user_id || '', order.order_user_name || '', order.order_user_role || '', created, created]);
      const kotId = result.changes?.lastId;
      for (const item of items) {
        await this.run('INSERT INTO kot_items(kot_id, product_id, product_name, quantity, sale_unit, status, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?)', [kotId, item.id, item.product_name, Number(item.quantity || 0), item.sale_unit || item.base_unit || 'Piece', 'pending', created]);
      }
      return { kotId, kotNo };
    }
    const kotId = await this.fallback.put('kot_tickets', { order_id: orderId, table_id: tableId, kot_no: kotNo, status: 'pending', table_name: table?.table_name || order.order_type || '', station: station || 'kitchen', order_user_id: order.order_user_id || '', order_user_name: order.order_user_name || '', order_user_role: order.order_user_role || '', created_at: created, updated_at: created });
    for (const item of items) {
      await this.fallback.put('kot_items', { kot_id: kotId, product_id: item.id, product_name: item.product_name, quantity: Number(item.quantity || 0), sale_unit: item.sale_unit || item.base_unit || 'Piece', status: 'pending', updated_at: created });
    }
    return { kotId, kotNo };
  }

  async getKotTickets() {
    const tickets = this.mode === 'sqlite'
      ? await this.query('SELECT * FROM kot_tickets ORDER BY created_at DESC')
      : await this.fallback.all('kot_tickets');
    const sorted = tickets.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return Promise.all(sorted.map(async ticket => ({ ...ticket, items: await this.getKotItems(ticket.id) })));
  }

  async getKotItems(kotId) {
    const rows = this.mode === 'sqlite'
      ? await this.query('SELECT * FROM kot_items WHERE kot_id=?', [kotId])
      : await this.fallback.all('kot_items');
    return rows.filter(row => Number(row.kot_id) === Number(kotId));
  }

  async updateKotStatus(kotId, status = 'pending') {
    const now = todayISO();
    if (this.mode === 'sqlite') {
      await this.run('UPDATE kot_tickets SET status=?, updated_at=? WHERE id=?', [status, now, kotId]);
      if (status === 'ready') await this.run("UPDATE kot_items SET status='ready', updated_at=? WHERE kot_id=?", [now, kotId]);
      return;
    }
    const ticket = (await this.fallback.all('kot_tickets')).find(row => Number(row.id) === Number(kotId));
    if (ticket) await this.fallback.put('kot_tickets', { ...ticket, status, updated_at: now });
    if (status === 'ready') {
      const items = (await this.fallback.all('kot_items')).filter(row => Number(row.kot_id) === Number(kotId));
      for (const item of items) await this.fallback.put('kot_items', { ...item, status: 'ready', updated_at: now });
    }
  }

  async updateKotItemStatus(itemId, status = 'pending') {
    const now = todayISO();
    if (this.mode === 'sqlite') {
      await this.run('UPDATE kot_items SET status=?, updated_at=? WHERE id=?', [status, now, itemId]);
      const rows = await this.query('SELECT kot_id FROM kot_items WHERE id=?', [itemId]);
      const kotId = rows[0]?.kot_id;
      if (kotId) {
        const items = await this.getKotItems(kotId);
        const ticketStatus = items.every(item => item.status === 'ready') ? 'ready' : (items.some(item => item.status === 'preparing') ? 'preparing' : 'pending');
        await this.run('UPDATE kot_tickets SET status=?, updated_at=? WHERE id=?', [ticketStatus, now, kotId]);
      }
      return;
    }
    const items = await this.fallback.all('kot_items');
    const item = items.find(row => Number(row.id) === Number(itemId));
    if (!item) return;
    await this.fallback.put('kot_items', { ...item, status, updated_at: now });
    const ticketItems = (await this.fallback.all('kot_items')).filter(row => Number(row.kot_id) === Number(item.kot_id));
    const ticketStatus = ticketItems.every(row => row.status === 'ready') ? 'ready' : (ticketItems.some(row => row.status === 'preparing') ? 'preparing' : 'pending');
    const ticket = (await this.fallback.all('kot_tickets')).find(row => Number(row.id) === Number(item.kot_id));
    if (ticket) await this.fallback.put('kot_tickets', { ...ticket, status: ticketStatus, updated_at: now });
  }

  async markKotTicketsForContext({ tableId = null, orderType = 'table', status = 'served' } = {}) {
    const now = todayISO();
    const tickets = await this.getKotTickets();
    const matching = tickets.filter(ticket => orderType === 'table'
      ? Number(ticket.table_id) === Number(tableId)
      : !ticket.table_id && String(ticket.table_name || '').toLowerCase() === String(orderType || '').toLowerCase());
    if (!matching.length) return [];
    if (this.mode === 'sqlite') {
      for (const ticket of matching) {
        await this.run('UPDATE kot_tickets SET status=?, updated_at=? WHERE id=?', [status, now, ticket.id]);
        await this.run('UPDATE kot_items SET status=?, updated_at=? WHERE kot_id=?', [status, now, ticket.id]);
      }
      return matching;
    }
    for (const ticket of matching) {
      await this.fallback.put('kot_tickets', { ...ticket, status, updated_at: now });
      for (const item of ticket.items || []) await this.fallback.put('kot_items', { ...item, status, updated_at: now });
    }
    return matching;
  }

  async closeTableOrder(orderId) {
    const orders = await this.getOpenTableOrders();
    const order = orders.find(row => Number(row.id) === Number(orderId));
    if (!order) return;
    if (this.mode === 'sqlite') {
      await this.run("UPDATE table_orders SET status='closed', updated_at=? WHERE id=?", [todayISO(), orderId]);
      if (order.table_id) await this.releaseTableIfNoOpenOrders(order.table_id);
      return;
    }
    await this.fallback.put('table_orders', { ...order, status: 'closed', updated_at: todayISO() });
    if (order.table_id) {
      await this.releaseTableIfNoOpenOrders(order.table_id);
    }
  }

  async closeTableOrdersForContext({ tableId = null, orderType = 'table' } = {}) {
    const now = todayISO();
    const openOrders = await this.getOpenTableOrders();
    const matchingOrders = openOrders.filter(order => orderType === 'table'
      ? Number(order.table_id) === Number(tableId)
      : order.order_type === orderType && !order.table_id);
    if (!matchingOrders.length) return;

    if (this.mode === 'sqlite') {
      if (orderType === 'table') {
        await this.markKotTicketsForContext({ tableId, orderType, status: 'served' });
        await this.run("UPDATE table_orders SET status='closed', updated_at=? WHERE status='open' AND table_id=?", [now, tableId]);
        await this.releaseTableIfNoOpenOrders(tableId);
      } else {
        await this.markKotTicketsForContext({ tableId, orderType, status: 'served' });
        await this.run("UPDATE table_orders SET status='closed', updated_at=? WHERE status='open' AND order_type=? AND table_id IS NULL", [now, orderType]);
      }
      return;
    }

    await this.markKotTicketsForContext({ tableId, orderType, status: 'served' });
    for (const order of matchingOrders) {
      await this.fallback.put('table_orders', { ...order, status: 'closed', updated_at: now });
    }
    if (orderType === 'table') await this.releaseTableIfNoOpenOrders(tableId);
  }

  async releaseTableIfNoOpenOrders(tableId) {
    if (!tableId) return;
    const hasOpenOrder = (await this.getOpenTableOrders()).some(order => Number(order.table_id) === Number(tableId));
    if (hasOpenOrder) return;
    if (this.mode === 'sqlite') {
      await this.run("UPDATE dining_tables SET status='available' WHERE id=?", [tableId]);
      return;
    }
    const table = (await this.fallback.all('dining_tables')).find(row => Number(row.id) === Number(tableId));
    if (table) await this.fallback.put('dining_tables', { ...table, status: 'available' });
  }

  actorFromUser(user = {}) {
    return {
      user_id: user.user_id || '',
      full_name: user.full_name || '',
      role: user.role || ''
    };
  }

  async saveSale({ invoice_no, items, subtotal, discount, gstTotal, grandTotal, paymentType, referenceNo = '', customerName = '', customerPhone = '', user = null }) {
    const created = todayISO();
    const actor = this.actorFromUser(user);
    if (this.mode === 'sqlite') {
      const saleResult = await this.run(`
        INSERT INTO sales(invoice_no, subtotal, discount, gst_total, grand_total, payment_type, customer_name, customer_phone, cashier_user_id, cashier_name, cashier_role, status, created_at)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'paid', ?)
      `, [invoice_no, subtotal, discount, gstTotal, grandTotal, paymentType, customerName, customerPhone, actor.user_id, actor.full_name, actor.role, created]);
      const saleId = saleResult.changes?.lastId;
      const lines = calculateCartLines(items, discount);
      for (const line of lines) {
        const item = line.item;
        await this.run(`
          INSERT INTO sale_items(sale_id, product_id, product_name, quantity, sale_unit, price, gst_percent, gst_amount, line_total)
          VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [saleId, item.id, item.product_name, line.quantity, line.unit, line.unitPrice, item.gst_percent, line.gstAmount, line.lineTotal]);
        await this.run('UPDATE products SET stock = MAX(stock - ?, 0) WHERE id=?', [line.stockUsed, item.id]);
      }
      await this.run('INSERT INTO payments(sale_id, payment_type, amount, reference_no, created_at) VALUES(?, ?, ?, ?, ?)', [saleId, paymentType, grandTotal, referenceNo, created]);
      return saleId;
    }

    const saleId = await this.fallback.put('sales', { invoice_no, subtotal, discount, gst_total: gstTotal, grand_total: grandTotal, payment_type: paymentType, customer_name: customerName, customer_phone: customerPhone, cashier_user_id: actor.user_id, cashier_name: actor.full_name, cashier_role: actor.role, status: 'paid', created_at: created });
    const lines = calculateCartLines(items, discount);
    for (const line of lines) {
      const item = line.item;
      await this.fallback.put('sale_items', { sale_id: saleId, product_id: item.id, product_name: item.product_name, quantity: line.quantity, sale_unit: line.unit, price: line.unitPrice, gst_percent: item.gst_percent, gst_amount: line.gstAmount, line_total: line.lineTotal });
      await this.saveProduct({ ...item, stock: Math.max(0, Number(item.stock) - stockQuantityUsed(item)) });
    }
    await this.fallback.put('payments', { sale_id: saleId, payment_type: paymentType, amount: grandTotal, reference_no: referenceNo, created_at: created });
    return saleId;
  }

  async getSales({ from = '', to = '', payment = '', search = '' } = {}) {
    let rows = this.mode === 'sqlite'
      ? await this.query('SELECT * FROM sales ORDER BY created_at DESC')
      : await this.fallback.all('sales');
    rows = rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return rows.filter(row => {
      const day = dateOnly(row.created_at);
      const haystack = `${row.invoice_no} ${row.customer_name || ''} ${row.customer_phone || ''} ${row.cashier_user_id || ''} ${row.cashier_name || ''}`.toLowerCase();
      return (!from || day >= from) && (!to || day <= to) && (!payment || row.payment_type === payment) && (!search || haystack.includes(search.toLowerCase()));
    });
  }

  async getSaleItems(saleId) {
    const rows = this.mode === 'sqlite'
      ? await this.query('SELECT * FROM sale_items WHERE sale_id=?', [saleId])
      : await this.fallback.all('sale_items');
    return rows.filter(row => Number(row.sale_id) === Number(saleId));
  }

  async getSaleSnapshot(id) {
    const sale = (await this.getSales()).find(row => Number(row.id) === Number(id));
    if (!sale) return null;
    const items = await this.getSaleItems(id);
    return { sale, items };
  }

  async auditBill(eventType, snapshot, note = '', nextData = null, user = null) {
    if (!snapshot?.sale) return;
    const created = todayISO();
    const previous = JSON.stringify(snapshot);
    const next = nextData ? JSON.stringify(nextData) : '';
    const actor = this.actorFromUser(user);
    if (this.mode === 'sqlite') {
      return await this.run(`
        INSERT INTO bill_audit(sale_id, invoice_no, event_type, previous_data, new_data, note, activity_user_id, activity_user_name, activity_user_role, created_at)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [snapshot.sale.id, snapshot.sale.invoice_no, eventType, previous, next, note, actor.user_id, actor.full_name, actor.role, created]);
    }
    return await this.fallback.put('bill_audit', {
      sale_id: snapshot.sale.id,
      invoice_no: snapshot.sale.invoice_no,
      event_type: eventType,
      previous_data: previous,
      new_data: next,
      note,
      activity_user_id: actor.user_id,
      activity_user_name: actor.full_name,
      activity_user_role: actor.role,
      created_at: created
    });
  }

  async getBillActivity(type = '', { from = '', to = '' } = {}) {
    let rows = this.mode === 'sqlite'
      ? await this.query('SELECT * FROM bill_audit ORDER BY created_at DESC')
      : await this.fallback.all('bill_audit');
    rows = rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return rows.filter(row => {
      const day = dateOnly(row.created_at);
      return (!type || row.event_type === type) && (!from || day >= from) && (!to || day <= to);
    });
  }

  async updateSale(id, updates, user = null) {
    const before = await this.getSaleSnapshot(id);
    if (!before) return;
    const editedItems = Array.isArray(updates.items) && updates.items.length
      ? updates.items
        .map(item => ({
          id: Number(item.id || 0),
          product_id: Number(item.product_id || 0) || null,
          product_name: String(item.product_name || '').trim(),
          quantity: Number(item.quantity || 0),
          sale_unit: item.sale_unit || 'Piece',
          price: Number(item.price || 0),
          gst_percent: Number(item.gst_percent || 0)
        }))
        .filter(item => item.product_name && item.quantity > 0)
      : before.items.map(item => ({
        id: Number(item.id),
        product_id: Number(item.product_id || 0) || null,
        product_name: item.product_name,
        quantity: Number(item.quantity || 0),
        sale_unit: item.sale_unit || 'Piece',
        price: Number(item.price || 0),
        gst_percent: Number(item.gst_percent || 0)
      }));
    if (!editedItems.length) throw new Error('Bill must have at least one product');
    const subtotal = editedItems.reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.price || 0)), 0);
    const discount = Math.min(Math.max(0, Number(updates.discount || 0)), subtotal);
    const lines = editedItems.map(item => {
      const taxable = Number(item.quantity || 0) * Number(item.price || 0);
      const discountShare = subtotal > 0 ? discount * (taxable / subtotal) : 0;
      const taxableAfterDiscount = Math.max(0, taxable - discountShare);
      const gstAmount = taxableAfterDiscount * (Number(item.gst_percent || 0) / 100);
      return { item, taxable, discountShare, taxableAfterDiscount, gstAmount, lineTotal: taxableAfterDiscount + gstAmount };
    });
    const gstTotal = lines.reduce((sum, line) => sum + line.gstAmount, 0);
    const grandTotal = subtotal - discount + gstTotal;
    const paymentType = updates.payment_type || before.sale.payment_type;
    const status = updates.status || before.sale.status || 'paid';
    const beforeItemsById = new Map(before.items.map(item => [Number(item.id), item]));
    const products = await this.getProducts();
    const productMap = new Map(products.map(product => [Number(product.id), product]));
    const saleItemStockUsed = (item = {}) => {
      const product = productMap.get(Number(item.product_id));
      return product
        ? stockQuantityUsed({ ...product, quantity: Number(item.quantity || 0), sale_unit: item.sale_unit || product.base_unit || 'Piece' })
        : Number(item.quantity || 0);
    };

    if (this.mode === 'sqlite') {
      await this.run('UPDATE sales SET subtotal=?, discount=?, gst_total=?, grand_total=?, payment_type=?, status=? WHERE id=?', [subtotal, discount, gstTotal, grandTotal, paymentType, status, id]);
      for (const line of lines) {
        const oldItem = beforeItemsById.get(Number(line.item.id));
        if (oldItem) {
          await this.run('UPDATE sale_items SET product_name=?, quantity=?, sale_unit=?, price=?, gst_percent=?, gst_amount=?, line_total=? WHERE id=?', [line.item.product_name, line.item.quantity, line.item.sale_unit, line.item.price, line.item.gst_percent, line.gstAmount, line.lineTotal, line.item.id]);
          const stockDelta = saleItemStockUsed(oldItem) - saleItemStockUsed(line.item);
          if (stockDelta) await this.run('UPDATE products SET stock = MAX(stock + ?, 0) WHERE id=?', [stockDelta, oldItem.product_id]);
          beforeItemsById.delete(Number(line.item.id));
        } else {
          await this.run(`
            INSERT INTO sale_items(sale_id, product_id, product_name, quantity, sale_unit, price, gst_percent, gst_amount, line_total)
            VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [id, line.item.product_id, line.item.product_name, line.item.quantity, line.item.sale_unit, line.item.price, line.item.gst_percent, line.gstAmount, line.lineTotal]);
          if (line.item.product_id) await this.run('UPDATE products SET stock = MAX(stock - ?, 0) WHERE id=?', [saleItemStockUsed(line.item), line.item.product_id]);
        }
      }
      for (const removed of beforeItemsById.values()) {
        await this.run('DELETE FROM sale_items WHERE id=?', [removed.id]);
        if (removed.product_id) await this.run('UPDATE products SET stock = stock + ? WHERE id=?', [saleItemStockUsed(removed), removed.product_id]);
      }
      await this.run('UPDATE payments SET payment_type=?, amount=? WHERE sale_id=?', [paymentType, grandTotal, id]);
    } else {
      await this.fallback.put('sales', { ...before.sale, subtotal, discount, gst_total: gstTotal, grand_total: grandTotal, payment_type: paymentType, status });
      for (const line of lines) {
        const oldItem = beforeItemsById.get(Number(line.item.id));
        if (oldItem) {
          await this.fallback.put('sale_items', { ...oldItem, ...line.item, gst_amount: line.gstAmount, line_total: line.lineTotal });
          const stockDelta = saleItemStockUsed(oldItem) - saleItemStockUsed(line.item);
          if (stockDelta) {
            const product = productMap.get(Number(oldItem.product_id));
            if (product) {
              const updatedProduct = { ...product, stock: Math.max(0, Number(product.stock || 0) + stockDelta) };
              await this.saveProduct(updatedProduct);
              productMap.set(Number(updatedProduct.id), updatedProduct);
            }
          }
          beforeItemsById.delete(Number(line.item.id));
        } else {
          await this.fallback.put('sale_items', { sale_id: Number(id), product_id: line.item.product_id, product_name: line.item.product_name, quantity: line.item.quantity, sale_unit: line.item.sale_unit, price: line.item.price, gst_percent: line.item.gst_percent, gst_amount: line.gstAmount, line_total: line.lineTotal });
          const product = productMap.get(Number(line.item.product_id));
          if (product) {
            const updatedProduct = { ...product, stock: Math.max(0, Number(product.stock || 0) - saleItemStockUsed(line.item)) };
            await this.saveProduct(updatedProduct);
            productMap.set(Number(updatedProduct.id), updatedProduct);
          }
        }
      }
      for (const removed of beforeItemsById.values()) {
        await this.fallback.delete('sale_items', Number(removed.id));
        if (removed.product_id) {
          const product = productMap.get(Number(removed.product_id));
          if (product) {
            const updatedProduct = { ...product, stock: Number(product.stock || 0) + saleItemStockUsed(removed) };
            await this.saveProduct(updatedProduct);
            productMap.set(Number(updatedProduct.id), updatedProduct);
          }
        }
      }
      const payments = (await this.fallback.all('payments')).filter(row => Number(row.sale_id) === Number(id));
      for (const payment of payments) await this.fallback.put('payments', { ...payment, payment_type: paymentType, amount: grandTotal });
    }
    const after = await this.getSaleSnapshot(id);
    await this.auditBill('modified', before, updates.note || 'Bill modified', after, user);
  }

  async returnSale(id, note = 'Bill returned', user = null) {
    const before = await this.getSaleSnapshot(id);
    if (!before) return;
    if (this.mode === 'sqlite') await this.run("UPDATE sales SET status='returned' WHERE id=?", [id]);
    else await this.fallback.put('sales', { ...before.sale, status: 'returned' });
    await this.auditBill('returned', before, note, await this.getSaleSnapshot(id), user);
  }

  async deleteSale(id, user = null) {
    const before = await this.getSaleSnapshot(id);
    await this.auditBill('deleted', before, 'Bill deleted', null, user);
    if (this.mode === 'sqlite') {
      await this.run('DELETE FROM sale_items WHERE sale_id=?', [id]);
      await this.run('DELETE FROM payments WHERE sale_id=?', [id]);
      return await this.run('DELETE FROM sales WHERE id=?', [id]);
    }
    await Promise.all((await this.getSaleItems(id)).map(item => this.fallback.delete('sale_items', item.id)));
    return await this.fallback.delete('sales', Number(id));
  }

  async holdBill(items, note = '') {
    const hold_no = `HOLD-${Date.now()}`;
    if (this.mode === 'sqlite') return await this.run('INSERT INTO hold_bills(hold_no, cart_json, customer_note, created_at) VALUES(?, ?, ?, ?)', [hold_no, JSON.stringify(items), note, todayISO()]);
    return await this.fallback.put('hold_bills', { hold_no, cart_json: JSON.stringify(items), customer_note: note, created_at: todayISO() });
  }

  async getHoldBills() {
    const rows = this.mode === 'sqlite' ? await this.query('SELECT * FROM hold_bills ORDER BY created_at DESC') : await this.fallback.all('hold_bills');
    return rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }

  async deleteHoldBill(id) {
    if (this.mode === 'sqlite') return await this.run('DELETE FROM hold_bills WHERE id=?', [id]);
    return await this.fallback.delete('hold_bills', Number(id));
  }

  async dashboardStats() {
    const sales = await this.getSales({ from: dateOnly(), to: dateOnly() });
    const allSales = await this.getSales();
    const total = sales.reduce((sum, sale) => sum + Number(sale.grand_total || 0), 0);
    const gst = sales.reduce((sum, sale) => sum + Number(sale.gst_total || 0), 0);
    const weeklySales = [...Array(7)].map((_, index) => {
      const day = new Date();
      day.setDate(day.getDate() - (6 - index));
      const key = dateOnly(day);
      const daySales = allSales.filter(sale => dateOnly(sale.created_at) === key && (sale.status || 'paid') === 'paid');
      return {
        date: key,
        label: day.toLocaleDateString(undefined, { weekday: 'short' }),
        total: daySales.reduce((sum, sale) => sum + Number(sale.grand_total || 0), 0),
        bills: daySales.length
      };
    });
    return { todaySales: total, todayBills: sales.length, totalBills: allSales.length, gstCollected: gst, recentBills: allSales.slice(0, 6), weeklySales };
  }

  async nextInvoice() {
    const rows = await this.getSales();
    const settings = await this.getSettings();
    return invoiceNumber(rows.length, settings.bill_prefix || APP_CONFIG.invoicePrefix);
  }

  async exportBackup() {
    const data = {};
    for (const table of BACKUP_TABLES) {
      data[table] = this.mode === 'sqlite'
        ? await this.query(`SELECT * FROM ${table}`)
        : await this.fallback.all(table);
    }
    return {
      app: 'Ginsoft POS',
      format: 'ginsoft-pos-json-backup',
      version: 1,
      dbVersion: APP_CONFIG.dbVersion,
      exportedAt: todayISO(),
      mode: this.mode,
      tables: data
    };
  }

  async restoreBackup(backup) {
    if (!backup?.tables || typeof backup.tables !== 'object') {
      throw new Error('Invalid backup file');
    }

    if (this.mode === 'sqlite') {
      for (const table of RESTORE_DELETE_ORDER) await this.run(`DELETE FROM ${table}`);
      for (const table of BACKUP_TABLES) {
        const rows = Array.isArray(backup.tables[table]) ? backup.tables[table] : [];
        for (const row of rows) await this.insertBackupRow(table, row);
      }
      await this.persistWeb();
      return;
    }

    for (const table of RESTORE_DELETE_ORDER) await this.fallback.clear(table);
    for (const table of BACKUP_TABLES) {
      const rows = Array.isArray(backup.tables[table]) ? backup.tables[table] : [];
      for (const row of rows) await this.fallback.put(table, row);
    }
  }

  async insertBackupRow(table, row) {
    const columns = Object.keys(row || {});
    if (!columns.length) return;
    const placeholders = columns.map(() => '?').join(', ');
    const columnSql = columns.map(column => `"${column}"`).join(', ');
    await this.run(`INSERT OR REPLACE INTO ${table} (${columnSql}) VALUES (${placeholders})`, columns.map(column => row[column]));
  }
}

export const db = new POSDatabase();
