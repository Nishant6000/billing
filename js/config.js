export const APP_CONFIG = {
  dbName: 'offline_pos_db',
  dbVersion: 8,
  currency: '₹',
  invoicePrefix: 'INV',
  routes: [
    { id: 'dashboard', title: 'Dashboard', icon: 'fa-gauge-high' },
    { id: 'billing', title: 'Billing', icon: 'fa-cart-shopping' },
    { id: 'tables', title: 'Tables', icon: 'fa-chair' },
    { id: 'products', title: 'Products', icon: 'fa-boxes-stacked' },
    { id: 'purchase', title: 'Purchase Entry', icon: 'fa-truck-ramp-box' },
    { id: 'purchase-history', title: 'Purchase History', icon: 'fa-clipboard-list' },
    { id: 'sales', title: 'Sales', icon: 'fa-receipt' },
    { id: 'whatsapp-marketing', title: 'WhatsApp Marketing', icon: 'fa-brands fa-whatsapp' },
    { id: 'reports', title: 'Reports', icon: 'fa-chart-line' },
    { id: 'gst-export', title: 'GST Export', icon: 'fa-file-export' },
    { id: 'settings', title: 'Settings', icon: 'fa-gear' },
    { id: 'printer', title: 'Printer', icon: 'fa-print' },
    { id: 'barcode', title: 'Barcode', icon: 'fa-barcode' },
    { id: 'backup', title: 'Backup', icon: 'fa-database' }
  ],
  roles: ['Owner', 'Manager', 'Cashier', 'Inventory', 'Accountant'],
  roleAccess: {
    Owner: ['*'],
    Manager: ['dashboard', 'billing', 'tables', 'products', 'purchase', 'purchase-history', 'sales', 'whatsapp-marketing', 'reports', 'gst-export', 'printer', 'barcode', 'backup'],
    Cashier: ['dashboard', 'billing', 'tables', 'sales', 'barcode'],
    Inventory: ['dashboard', 'products', 'purchase', 'purchase-history', 'barcode', 'backup'],
    Accountant: ['dashboard', 'sales', 'purchase-history', 'reports', 'gst-export', 'backup']
  },
  defaultSettings: {
    shop_name: 'Ginsoft POS Store',
    shop_address: 'Main Market Road, India',
    gstin: '29ABCDE1234F1Z5',
    phone: '+91 90000 00000',
    footer_text: 'Thank you. Visit again.',
    paper_size: '80mm',
    printer_theme: 'thermal',
    receipt_header: 'Tax Invoice',
    receipt_footer: 'Thank you. Visit again.',
    receipt_logo: '',
    gst_enabled: 'true',
    bill_prefix: 'INV',
    billing_mode: 'direct',
    weight_enabled: 'false',
    language: 'en'
  }
};
