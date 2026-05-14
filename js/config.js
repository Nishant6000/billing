export const APP_CONFIG = {
  dbName: 'offline_pos_db',
  dbVersion: 3,
  currency: '₹',
  invoicePrefix: 'INV',
  routes: [
    { id: 'dashboard', title: 'Dashboard', icon: 'fa-gauge-high' },
    { id: 'billing', title: 'Billing', icon: 'fa-cart-shopping' },
    { id: 'products', title: 'Products', icon: 'fa-boxes-stacked' },
    { id: 'purchase', title: 'Purchase Entry', icon: 'fa-truck-ramp-box' },
    { id: 'purchase-history', title: 'Purchase History', icon: 'fa-clipboard-list' },
    { id: 'sales', title: 'Sales', icon: 'fa-receipt' },
    { id: 'reports', title: 'Reports', icon: 'fa-chart-line' },
    { id: 'gst-export', title: 'GST Export', icon: 'fa-file-export' },
    { id: 'settings', title: 'Settings', icon: 'fa-gear' },
    { id: 'printer', title: 'Printer', icon: 'fa-print' },
    { id: 'barcode', title: 'Barcode', icon: 'fa-barcode' },
    { id: 'backup', title: 'Backup', icon: 'fa-database' }
  ],
  defaultSettings: {
    shop_name: 'Zento POS Store',
    shop_address: 'Main Market Road, India',
    gstin: '29ABCDE1234F1Z5',
    phone: '+91 90000 00000',
    footer_text: 'Thank you. Visit again.',
    paper_size: '80mm',
    gst_enabled: 'true',
    bill_prefix: 'INV'
  }
};
