import { APP_CONFIG } from './config.js';
import { calculateCartLines, dateOnly, invoiceNumber, todayISO } from './utils.js';

class IndexedDBFallback {
  constructor() {
    this.db = null;
  }

  async open() {
    this.db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(APP_CONFIG.dbName, APP_CONFIG.dbVersion);
      request.onupgradeneeded = () => {
        const db = request.result;
        ['categories', 'products', 'sales', 'sale_items', 'payments', 'hold_bills', 'settings', 'bill_audit'].forEach(store => {
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
      const request = this.store(name, 'readwrite').put(row);
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
}

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
    await this.ensureProductColumns();
    if (Capacitor.getPlatform() === 'web') await this.sqlite.saveToStore(APP_CONFIG.dbName);
  }

  async ensureProductColumns() {
    const columns = await this.query('PRAGMA table_info(products)');
    const names = columns.map(column => column.name);
    if (!names.includes('shelf_no')) await this.run('ALTER TABLE products ADD COLUMN shelf_no TEXT');
    if (!names.includes('box_no')) await this.run('ALTER TABLE products ADD COLUMN box_no TEXT');
    if (!names.includes('description')) await this.run('ALTER TABLE products ADD COLUMN description TEXT');
    if (!names.includes('billing_display')) await this.run("ALTER TABLE products ADD COLUMN billing_display TEXT NOT NULL DEFAULT 'stock'");
    if (!names.includes('product_discount_type')) await this.run("ALTER TABLE products ADD COLUMN product_discount_type TEXT NOT NULL DEFAULT 'none'");
    if (!names.includes('product_discount_value')) await this.run('ALTER TABLE products ADD COLUMN product_discount_value REAL NOT NULL DEFAULT 0');
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
    const categories = await this.getCategories();
    if (!categories.length) {
      for (const name of ['Grocery', 'Snacks', 'Beverages', 'Personal Care']) {
        await this.saveCategory({ category_name: name });
      }
    }
    const products = await this.getProducts();
    if (!products.length) {
      await this.saveProduct({ category_id: 1, product_name: 'Premium Rice 1kg', barcode: '890100000001', selling_price: 78, product_discount_type: 'none', product_discount_value: 0, gst_percent: 5, stock: 120, shelf_no: 'A1', box_no: 'B01', description: 'Long grain daily rice pack', billing_display: 'stock', image: '' });
      await this.saveProduct({ category_id: 2, product_name: 'Masala Chips', barcode: '890100000002', selling_price: 20, product_discount_type: 'percent', product_discount_value: 5, gst_percent: 12, stock: 200, shelf_no: 'A2', box_no: 'B02', description: 'Spicy snack pouch', billing_display: 'shelf_no', image: '' });
      await this.saveProduct({ category_id: 3, product_name: 'Cold Coffee', barcode: '890100000003', selling_price: 55, product_discount_type: 'amount', product_discount_value: 5, gst_percent: 18, stock: 75, shelf_no: 'C1', box_no: 'CH1', description: 'Ready to drink coffee', billing_display: 'box_no', image: '' });
      await this.saveProduct({ category_id: 4, product_name: 'Herbal Soap', barcode: '890100000004', selling_price: 42, product_discount_type: 'none', product_discount_value: 0, gst_percent: 18, stock: 90, shelf_no: 'D3', box_no: 'BX4', description: 'Gentle herbal bath soap', billing_display: 'description', image: '' });
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
        WHERE LOWER(p.product_name) LIKE ? OR LOWER(IFNULL(p.barcode, '')) LIKE ?
        ORDER BY p.product_name
      `, [`%${search.toLowerCase()}%`, `%${search.toLowerCase()}%`]);
    }
    const categories = await this.getCategories();
    return (await this.fallback.all('products'))
      .filter(p => `${p.product_name} ${p.barcode}`.toLowerCase().includes(search.toLowerCase()))
      .map(p => ({ ...p, category_name: categories.find(c => Number(c.id) === Number(p.category_id))?.category_name || '' }))
      .sort((a, b) => a.product_name.localeCompare(b.product_name));
  }

  async saveProduct(product) {
    const row = { ...product, created_at: product.created_at || todayISO() };
    if (this.mode === 'sqlite') {
      if (row.id) {
        return await this.run(`
          UPDATE products SET category_id=?, product_name=?, barcode=?, selling_price=?, product_discount_type=?, product_discount_value=?, gst_percent=?, stock=?, shelf_no=?, box_no=?, description=?, billing_display=?, image=? WHERE id=?
        `, [row.category_id, row.product_name, row.barcode, row.selling_price, row.product_discount_type || 'none', row.product_discount_value || 0, row.gst_percent, row.stock, row.shelf_no || '', row.box_no || '', row.description || '', row.billing_display || 'stock', row.image, row.id]);
      }
      return await this.run(`
        INSERT INTO products(category_id, product_name, barcode, selling_price, product_discount_type, product_discount_value, gst_percent, stock, shelf_no, box_no, description, billing_display, image, created_at)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [row.category_id, row.product_name, row.barcode, row.selling_price, row.product_discount_type || 'none', row.product_discount_value || 0, row.gst_percent, row.stock, row.shelf_no || '', row.box_no || '', row.description || '', row.billing_display || 'stock', row.image, row.created_at]);
    }
    return await this.fallback.put('products', row);
  }

  async deleteProduct(id) {
    if (this.mode === 'sqlite') return await this.run('DELETE FROM products WHERE id=?', [id]);
    return await this.fallback.delete('products', Number(id));
  }

  async saveSale({ invoice_no, items, subtotal, discount, gstTotal, grandTotal, paymentType, referenceNo = '' }) {
    const created = todayISO();
    if (this.mode === 'sqlite') {
      const saleResult = await this.run(`
        INSERT INTO sales(invoice_no, subtotal, discount, gst_total, grand_total, payment_type, status, created_at)
        VALUES(?, ?, ?, ?, ?, ?, 'paid', ?)
      `, [invoice_no, subtotal, discount, gstTotal, grandTotal, paymentType, created]);
      const saleId = saleResult.changes?.lastId;
      const lines = calculateCartLines(items, discount);
      for (const line of lines) {
        const item = line.item;
        await this.run(`
          INSERT INTO sale_items(sale_id, product_id, product_name, quantity, price, gst_percent, gst_amount, line_total)
          VALUES(?, ?, ?, ?, ?, ?, ?, ?)
        `, [saleId, item.id, item.product_name, line.quantity, line.unitPrice, item.gst_percent, line.gstAmount, line.lineTotal]);
        await this.run('UPDATE products SET stock = MAX(stock - ?, 0) WHERE id=?', [item.quantity, item.id]);
      }
      await this.run('INSERT INTO payments(sale_id, payment_type, amount, reference_no, created_at) VALUES(?, ?, ?, ?, ?)', [saleId, paymentType, grandTotal, referenceNo, created]);
      return saleId;
    }

    const saleId = await this.fallback.put('sales', { invoice_no, subtotal, discount, gst_total: gstTotal, grand_total: grandTotal, payment_type: paymentType, status: 'paid', created_at: created });
    const lines = calculateCartLines(items, discount);
    for (const line of lines) {
      const item = line.item;
      await this.fallback.put('sale_items', { sale_id: saleId, product_id: item.id, product_name: item.product_name, quantity: line.quantity, price: line.unitPrice, gst_percent: item.gst_percent, gst_amount: line.gstAmount, line_total: line.lineTotal });
      await this.saveProduct({ ...item, stock: Math.max(0, Number(item.stock) - Number(item.quantity)) });
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
      return (!from || day >= from) && (!to || day <= to) && (!payment || row.payment_type === payment) && (!search || row.invoice_no.toLowerCase().includes(search.toLowerCase()));
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

  async auditBill(eventType, snapshot, note = '', nextData = null) {
    if (!snapshot?.sale) return;
    const created = todayISO();
    const previous = JSON.stringify(snapshot);
    const next = nextData ? JSON.stringify(nextData) : '';
    if (this.mode === 'sqlite') {
      return await this.run(`
        INSERT INTO bill_audit(sale_id, invoice_no, event_type, previous_data, new_data, note, created_at)
        VALUES(?, ?, ?, ?, ?, ?, ?)
      `, [snapshot.sale.id, snapshot.sale.invoice_no, eventType, previous, next, note, created]);
    }
    return await this.fallback.put('bill_audit', {
      sale_id: snapshot.sale.id,
      invoice_no: snapshot.sale.invoice_no,
      event_type: eventType,
      previous_data: previous,
      new_data: next,
      note,
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

  async updateSale(id, updates) {
    const before = await this.getSaleSnapshot(id);
    if (!before) return;
    const items = before.items.map(item => ({
      ...item,
      sale_item_id: item.id,
      id: item.product_id,
      selling_price: Number(item.price),
      quantity: Number(item.quantity)
    }));
    const subtotal = items.reduce((sum, item) => sum + Number(item.selling_price) * Number(item.quantity), 0);
    const discount = Math.min(Math.max(0, Number(updates.discount || 0)), subtotal);
    const lines = calculateCartLines(items, discount);
    const gstTotal = lines.reduce((sum, line) => sum + line.gstAmount, 0);
    const grandTotal = subtotal - discount + gstTotal;
    const paymentType = updates.payment_type || before.sale.payment_type;
    const status = updates.status || before.sale.status || 'paid';

    if (this.mode === 'sqlite') {
      await this.run('UPDATE sales SET subtotal=?, discount=?, gst_total=?, grand_total=?, payment_type=?, status=? WHERE id=?', [subtotal, discount, gstTotal, grandTotal, paymentType, status, id]);
      for (const line of lines) {
        await this.run('UPDATE sale_items SET price=?, gst_amount=?, line_total=? WHERE id=?', [line.unitPrice, line.gstAmount, line.lineTotal, line.item.sale_item_id]);
      }
      await this.run('UPDATE payments SET payment_type=?, amount=? WHERE sale_id=?', [paymentType, grandTotal, id]);
    } else {
      await this.fallback.put('sales', { ...before.sale, subtotal, discount, gst_total: gstTotal, grand_total: grandTotal, payment_type: paymentType, status });
      for (const line of lines) {
        await this.fallback.put('sale_items', { ...line.item, id: line.item.sale_item_id, product_id: line.item.product_id, price: line.unitPrice, gst_amount: line.gstAmount, line_total: line.lineTotal });
      }
      const payments = (await this.fallback.all('payments')).filter(row => Number(row.sale_id) === Number(id));
      for (const payment of payments) await this.fallback.put('payments', { ...payment, payment_type: paymentType, amount: grandTotal });
    }
    const after = await this.getSaleSnapshot(id);
    await this.auditBill('modified', before, updates.note || 'Bill modified', after);
  }

  async returnSale(id, note = 'Bill returned') {
    const before = await this.getSaleSnapshot(id);
    if (!before) return;
    if (this.mode === 'sqlite') await this.run("UPDATE sales SET status='returned' WHERE id=?", [id]);
    else await this.fallback.put('sales', { ...before.sale, status: 'returned' });
    await this.auditBill('returned', before, note, await this.getSaleSnapshot(id));
  }

  async deleteSale(id) {
    const before = await this.getSaleSnapshot(id);
    await this.auditBill('deleted', before, 'Bill deleted');
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
    return { todaySales: total, todayBills: sales.length, totalBills: allSales.length, gstCollected: gst, recentBills: allSales.slice(0, 6) };
  }

  async nextInvoice() {
    const rows = await this.getSales();
    const settings = await this.getSettings();
    return invoiceNumber(rows.length, settings.bill_prefix || APP_CONFIG.invoicePrefix);
  }
}

export const db = new POSDatabase();
