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

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (bytes) => {
  let crc = 0xffffffff;
  bytes.forEach(byte => {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  });
  return (crc ^ 0xffffffff) >>> 0;
};

const textBytes = (value) => new TextEncoder().encode(value);

const writeUInt16 = (target, offset, value) => {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
};

const writeUInt32 = (target, offset, value) => {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
};

const concatBytes = (parts) => {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  parts.forEach(part => {
    output.set(part, offset);
    offset += part.length;
  });
  return output;
};

const zipStore = (files) => {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  files.forEach(file => {
    const name = textBytes(file.name);
    const data = file.data instanceof Uint8Array ? file.data : textBytes(file.data);
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length);
    writeUInt32(local, 0, 0x04034b50);
    writeUInt16(local, 4, 20);
    writeUInt16(local, 6, 0);
    writeUInt16(local, 8, 0);
    writeUInt16(local, 10, 0);
    writeUInt16(local, 12, 0);
    writeUInt32(local, 14, crc);
    writeUInt32(local, 18, data.length);
    writeUInt32(local, 22, data.length);
    writeUInt16(local, 26, name.length);
    writeUInt16(local, 28, 0);
    local.set(name, 30);
    localParts.push(local, data);

    const central = new Uint8Array(46 + name.length);
    writeUInt32(central, 0, 0x02014b50);
    writeUInt16(central, 4, 20);
    writeUInt16(central, 6, 20);
    writeUInt16(central, 8, 0);
    writeUInt16(central, 10, 0);
    writeUInt16(central, 12, 0);
    writeUInt16(central, 14, 0);
    writeUInt32(central, 16, crc);
    writeUInt32(central, 20, data.length);
    writeUInt32(central, 24, data.length);
    writeUInt16(central, 28, name.length);
    writeUInt16(central, 30, 0);
    writeUInt16(central, 32, 0);
    writeUInt16(central, 34, 0);
    writeUInt16(central, 36, 0);
    writeUInt32(central, 38, 0);
    writeUInt32(central, 42, offset);
    central.set(name, 46);
    centralParts.push(central);
    offset += local.length + data.length;
  });

  const centralDirectory = concatBytes(centralParts);
  const end = new Uint8Array(22);
  writeUInt32(end, 0, 0x06054b50);
  writeUInt16(end, 8, files.length);
  writeUInt16(end, 10, files.length);
  writeUInt32(end, 12, centralDirectory.length);
  writeUInt32(end, 16, offset);
  return concatBytes([...localParts, centralDirectory, end]);
};

const xmlEscape = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

const columnName = (index) => {
  let name = '';
  let value = index + 1;
  while (value > 0) {
    const modulo = (value - 1) % 26;
    name = String.fromCharCode(65 + modulo) + name;
    value = Math.floor((value - modulo) / 26);
  }
  return name;
};

export const toXLSX = (rows, sheetName = 'Report') => {
  const columns = rows.length ? Object.keys(rows[0]) : ['No Data'];
  const allRows = rows.length ? rows : [{ 'No Data': '' }];
  const sheetRows = [
    columns,
    ...allRows.map(row => columns.map(column => row[column] ?? ''))
  ].map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, columnIndex) => {
    const cell = `${columnName(columnIndex)}${rowIndex + 1}`;
    const numeric = value !== '' && value !== null && Number.isFinite(Number(value)) && !String(value).startsWith('0');
    return numeric
      ? `<c r="${cell}"><v>${Number(value)}</v></c>`
      : `<c r="${cell}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`;
  }).join('')}</row>`).join('');
  const worksheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEscape(sheetName).slice(0, 31)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  return zipStore([
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', data: workbook },
    { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>' },
    { name: 'xl/worksheets/sheet1.xml', data: worksheet }
  ]);
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
