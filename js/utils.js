import { APP_CONFIG } from './config.js';

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export const money = (value) => `${APP_CONFIG.currency}${Number(value || 0).toFixed(2)}`;
export const todayISO = () => new Date().toISOString();
export const dateOnly = (value = new Date()) => new Date(value).toISOString().slice(0, 10);
export const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

export const invoiceNumber = (lastId = 0, prefix = APP_CONFIG.invoicePrefix) => {
  const date = new Date();
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  return `${prefix}-${stamp}-${String(lastId + 1).padStart(5, '0')}`;
};

export const downloadFile = (filename, content, type = 'text/csv') => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

export const toCSV = (rows) => {
  if (!rows.length) return '';
  const columns = Object.keys(rows[0]);
  const body = rows.map(row => columns.map(col => `"${String(row[col] ?? '').replaceAll('"', '""')}"`).join(','));
  return [columns.join(','), ...body].join('\n');
};

export const debounce = (callback, wait = 180) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => callback(...args), wait);
  };
};

export const productDiscountAmount = (item) => {
  const price = Number(item.selling_price || 0);
  const value = Math.max(0, Number(item.product_discount_value || 0));
  if ((item.product_discount_type || 'none') === 'percent') return Math.min(price, price * (value / 100));
  if ((item.product_discount_type || 'none') === 'amount') return Math.min(price, value);
  return 0;
};

export const effectiveUnitPrice = (item) => Math.max(0, Number(item.selling_price || 0) - productDiscountAmount(item));

export const calculateCartLines = (items, discount = 0) => {
  const subtotal = items.reduce((sum, item) => sum + effectiveUnitPrice(item) * Number(item.quantity || 0), 0);
  const appliedDiscount = Math.min(Math.max(0, Number(discount || 0)), subtotal);
  return items.map(item => {
    const quantity = Number(item.quantity || 0);
    const taxable = effectiveUnitPrice(item) * quantity;
    const discountShare = subtotal > 0 ? appliedDiscount * (taxable / subtotal) : 0;
    const taxableAfterDiscount = Math.max(0, taxable - discountShare);
    const gstAmount = taxableAfterDiscount * (Number(item.gst_percent || 0) / 100);
    return {
      item,
      quantity,
      unitPrice: effectiveUnitPrice(item),
      taxable,
      discountShare,
      taxableAfterDiscount,
      gstAmount,
      lineTotal: taxableAfterDiscount + gstAmount
    };
  });
};

export const calculateCart = (items, discount = 0) => {
  const subtotal = items.reduce((sum, item) => sum + effectiveUnitPrice(item) * Number(item.quantity || 0), 0);
  const appliedDiscount = Math.min(Math.max(0, Number(discount || 0)), subtotal);
  const lines = calculateCartLines(items, appliedDiscount);
  const gstTotal = lines.reduce((sum, line) => sum + line.gstAmount, 0);
  const grandTotal = Math.max(0, subtotal - appliedDiscount + gstTotal);
  return { subtotal, gstTotal, discount: appliedDiscount, grandTotal };
};
