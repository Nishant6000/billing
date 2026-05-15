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

export const UNIT_GROUPS = {
  weight: { KG: 1000, Gram: 1, MG: 0.001 },
  liquid: { Liter: 1000, ML: 1 },
  count: { Piece: 1, Tablet: 1, Sheet: 1, Box: 1, Packet: 1 }
};

export const PACKAGING_ORDER = ['Box', 'Packet', 'Sheet', 'Tablet'];

export const UNIT_OPTIONS = Object.entries(UNIT_GROUPS).flatMap(([group, units]) =>
  Object.keys(units).map(unit => ({ group, unit }))
);

export const unitGroup = (unit = 'Piece') =>
  UNIT_OPTIONS.find(option => option.unit === unit)?.group || 'count';

export const compatibleUnits = (unit = 'Piece') =>
  Object.keys(UNIT_GROUPS[unitGroup(unit)] || UNIT_GROUPS.count);

const unitFactor = (unit = 'Piece') => UNIT_GROUPS[unitGroup(unit)]?.[unit] ?? 1;

export const canonicalQuantity = (quantity = 0, unit = 'Piece') => Number(quantity || 0) * unitFactor(unit);

export const parsePackageUnits = (value = '') => {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value) || {};
  } catch (_) {
    return {};
  }
};

export const packagingMultiplier = (item, unit = 'Piece') => {
  const packageUnits = parsePackageUnits(item.package_units_json);
  const packetsPerBox = Math.max(0, Number(packageUnits.packets_per_box || 0));
  const sheetsPerPacket = Math.max(0, Number(packageUnits.sheets_per_packet || 0));
  const tabletsPerSheet = Math.max(0, Number(packageUnits.tablets_per_sheet || 0));
  if (unit === 'Box' && packetsPerBox && sheetsPerPacket && tabletsPerSheet) return packetsPerBox * sheetsPerPacket * tabletsPerSheet;
  if (unit === 'Packet' && sheetsPerPacket && tabletsPerSheet) return sheetsPerPacket * tabletsPerSheet;
  if (unit === 'Sheet' && tabletsPerSheet) return tabletsPerSheet;
  if (unit === 'Tablet') return 1;
  return null;
};

export const hasPackagingChain = (item) =>
  unitGroup(item.base_unit || 'Piece') === 'count' && PACKAGING_ORDER.includes(item.base_unit || '') && packagingMultiplier(item, item.base_unit) !== null;

export const saleUnitsForProduct = (item) => {
  if (!hasPackagingChain(item)) return compatibleUnits(item.base_unit || 'Piece');
  const baseIndex = PACKAGING_ORDER.indexOf(item.base_unit || 'Tablet');
  return PACKAGING_ORDER
    .slice(Math.max(0, baseIndex))
    .filter(unit => unit === item.base_unit || packagingMultiplier(item, unit) !== null);
};

export const productDiscountAmount = (item) => {
  const price = Number(item.selling_price || 0);
  const value = Math.max(0, Number(item.product_discount_value || 0));
  if ((item.product_discount_type || 'none') === 'percent') return Math.min(price, price * (value / 100));
  if ((item.product_discount_type || 'none') === 'amount') return Math.min(price, value);
  return 0;
};

export const effectiveUnitPrice = (item) => Math.max(0, Number(item.selling_price || 0) - productDiscountAmount(item));

export const baseQuantity = (item) => Math.max(0.000001, Number(item.base_quantity || 1));
export const baseUnit = (item) => item.base_unit || 'Piece';
export const saleUnit = (item) => item.sale_unit || baseUnit(item);

export const baseQuantityCanonical = (item) => {
  const multiplier = packagingMultiplier(item, baseUnit(item));
  return multiplier === null ? canonicalQuantity(baseQuantity(item), baseUnit(item)) : baseQuantity(item) * multiplier;
};

export const customerQuantityCanonical = (item) => {
  const multiplier = packagingMultiplier(item, saleUnit(item));
  return multiplier === null ? canonicalQuantity(Number(item.quantity || 0), saleUnit(item)) : Number(item.quantity || 0) * multiplier;
};

export const dynamicLineTaxable = (item) => {
  const baseCanonical = baseQuantityCanonical(item);
  if (baseCanonical <= 0) return 0;
  return effectiveUnitPrice(item) * (customerQuantityCanonical(item) / baseCanonical);
};

export const dynamicUnitPrice = (item) => {
  const quantity = Number(item.quantity || 0);
  return quantity > 0 ? dynamicLineTaxable(item) / quantity : 0;
};

export const stockQuantityUsed = (item) => {
  const baseCanonical = baseQuantityCanonical(item);
  return baseCanonical > 0 ? customerQuantityCanonical(item) / baseCanonical : Number(item.quantity || 0);
};

export const formatQuantity = (quantity, unit = 'Piece') => {
  const numeric = Number(quantity || 0);
  const formatted = Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  return `${formatted} ${unit}`;
};

export const formatBasePrice = (item) => `${money(effectiveUnitPrice(item))} / ${formatQuantity(baseQuantity(item), baseUnit(item))}`;

export const formatPackingChain = (item) => {
  const packageUnits = parsePackageUnits(item.package_units_json);
  const parts = [];
  if (Number(packageUnits.packets_per_box || 0) > 0) parts.push(`${packageUnits.packets_per_box} Packet/Box`);
  if (Number(packageUnits.sheets_per_packet || 0) > 0) parts.push(`${packageUnits.sheets_per_packet} Sheet/Packet`);
  if (Number(packageUnits.tablets_per_sheet || 0) > 0) parts.push(`${packageUnits.tablets_per_sheet} Tablet/Sheet`);
  return parts.join(' | ');
};

export const calculateCartLines = (items, discount = 0) => {
  const subtotal = items.reduce((sum, item) => sum + dynamicLineTaxable(item), 0);
  const appliedDiscount = Math.min(Math.max(0, Number(discount || 0)), subtotal);
  return items.map(item => {
    const quantity = Number(item.quantity || 0);
    const taxable = dynamicLineTaxable(item);
    const discountShare = subtotal > 0 ? appliedDiscount * (taxable / subtotal) : 0;
    const taxableAfterDiscount = Math.max(0, taxable - discountShare);
    const gstAmount = taxableAfterDiscount * (Number(item.gst_percent || 0) / 100);
    return {
      item,
      quantity,
      unit: saleUnit(item),
      unitPrice: dynamicUnitPrice(item),
      stockUsed: stockQuantityUsed(item),
      taxable,
      discountShare,
      taxableAfterDiscount,
      gstAmount,
      lineTotal: taxableAfterDiscount + gstAmount
    };
  });
};

export const calculateCart = (items, discount = 0) => {
  const subtotal = items.reduce((sum, item) => sum + dynamicLineTaxable(item), 0);
  const appliedDiscount = Math.min(Math.max(0, Number(discount || 0)), subtotal);
  const lines = calculateCartLines(items, appliedDiscount);
  const gstTotal = lines.reduce((sum, line) => sum + line.gstAmount, 0);
  const grandTotal = Math.max(0, subtotal - appliedDiscount + gstTotal);
  return { subtotal, gstTotal, discount: appliedDiscount, grandTotal };
};
