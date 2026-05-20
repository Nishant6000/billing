import { db } from '../js/db.js';
import { getCurrentUser } from '../js/auth.js';
import { $, calculateCart, calculateCartLines, debounce, escapeHtml, formatBasePrice, formatPackingChain, formatQuantity, money, productDiscountAmount, saleUnitsForProduct, stockQuantityUsed } from '../js/utils.js';
import { closeModal, showModal, toast } from '../js/ui.js';
import { displayStatus, displayTableArea, displayTableName, localizedProductName, t } from '../js/i18n.js';
import { pushKotToCloud, updateCloudKotStatus } from '../js/hotel-cloud.js';

let cart = [];
let activeRestaurantContext = null;
let billingBarcodeStream = null;
let billingBarcodeTimer = null;
let billingBarcodeDetector = null;

const normalizeCartItems = (items = []) => {
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
};

const resetManualDiscount = () => {
  const discountInput = $('#discount');
  if (discountInput) discountInput.value = '0';
};

const billingProductMeta = (product) => {
  const displays = String(product.billing_display || 'stock').split(',').map(item => item.trim()).filter(Boolean);
  const values = {
    stock: `Stock ${product.stock}`,
    gst: `GST ${product.gst_percent}%`,
    shelf_no: `Shelf ${product.shelf_no || '-'}`,
    box_no: `Box ${product.box_no || '-'}`,
    description: product.description || 'No description'
  };
  return (displays.length ? displays : ['stock']).map(display => values[display] || values.stock);
};

const productPriceMarkup = (product) => {
  const discount = productDiscountAmount(product);
  if (!discount) return `<span class="badge-soft">${formatBasePrice(product)}</span>`;
  return `
    <span class="badge-soft">${formatBasePrice(product)}</span>
    <span class="text-muted small text-decoration-line-through">${money(product.selling_price)}</span>
  `;
};

const unitSelectMarkup = (item) => saleUnitsForProduct(item)
  .map(unit => `<option value="${unit}" ${(item.sale_unit || item.base_unit || 'Piece') === unit ? 'selected' : ''}>${unit}</option>`)
  .join('');

const availableStock = (item) => Number(item.stock ?? Number.POSITIVE_INFINITY);

const stockMessage = (item) => {
  if (availableStock(item) <= 0) return `${item.product_name} is out of stock`;
  return `${item.product_name} has only ${formatQuantity(availableStock(item), item.base_unit || 'Piece')} in stock`;
};

const hasEnoughStock = (item) => availableStock(item) === Number.POSITIVE_INFINITY || stockQuantityUsed(item) <= availableStock(item);

const validateCartStock = () => {
  const invalidItem = cart.find(item => !hasEnoughStock(item));
  if (!invalidItem) return true;
  toast(stockMessage(invalidItem), 'warning');
  return false;
};

const renderCart = () => {
  cart = normalizeCartItems(cart);
  const discount = Number($('#discount')?.value || 0);
  const totals = calculateCart(cart, discount);
  const lines = calculateCartLines(cart, discount);
  $('#cart-items').innerHTML = lines.length ? lines.map(line => {
    const item = line.item;
    return `
    <div class="cart-line">
      <div>
        <strong>${escapeHtml(localizedProductName(item))}</strong>
        ${localizedProductName(item) !== item.product_name ? `<div class="text-muted small">${escapeHtml(item.product_name)}</div>` : ''}
        <div class="text-muted small">${formatBasePrice(item)} | GST ${item.gst_percent}%${productDiscountAmount(item) ? ` | Saved ${money(productDiscountAmount(item))}` : ''}</div>
        ${formatPackingChain(item) ? `<div class="text-muted small">${escapeHtml(formatPackingChain(item))}</div>` : ''}
        <div class="text-muted small">Selling ${formatQuantity(line.quantity, line.unit)} = ${money(line.taxable)}</div>
        <div class="cart-quantity-editor mt-2">
          <button data-qty="${item.id}" data-delta="-1"><i class="fa-solid fa-minus"></i></button>
          <input class="form-control form-control-sm" data-cart-quantity="${item.id}" type="number" min="0.001" step="0.001" value="${item.quantity}">
          <select class="form-select form-select-sm" data-cart-unit="${item.id}">${unitSelectMarkup(item)}</select>
          <button data-qty="${item.id}" data-delta="1"><i class="fa-solid fa-plus"></i></button>
        </div>
      </div>
      <div class="text-end">
        <button class="cart-delete-btn mb-2" data-remove="${item.id}" aria-label="Remove ${escapeHtml(item.product_name)}" title="Remove item">
          <i class="fa-solid fa-trash"></i>
        </button>
        <div class="fw-bold">${money(line.lineTotal)}</div>
      </div>
    </div>
  `;
  }).join('') : `<p class="text-muted text-center py-4">${t('cartEmpty')}</p>`;
  $('#cart-totals').innerHTML = `
    <div class="d-flex justify-content-between"><span>${t('subtotal')}</span><strong>${money(totals.subtotal)}</strong></div>
    <div class="d-flex justify-content-between"><span>CGST</span><strong>${money(totals.gstTotal / 2)}</strong></div>
    <div class="d-flex justify-content-between"><span>SGST</span><strong>${money(totals.gstTotal / 2)}</strong></div>
    <div class="d-flex justify-content-between"><span>GST</span><strong>${money(totals.gstTotal)}</strong></div>
    <div class="d-flex justify-content-between"><span>${t('discount')}</span><strong>${money(totals.discount)}</strong></div>
    <hr><div class="d-flex justify-content-between fs-4"><span>${t('total')}</span><strong>${money(totals.grandTotal)}</strong></div>
  `;
};

const renderProducts = async (search = '') => {
  const products = await db.getProducts(search);
  $('#billing-products').innerHTML = products.map(product => `
    <div class="col-sm-6 col-xl-4">
      <button class="product-tile" data-product="${product.id}">
        <div class="product-photo">
          ${product.image
            ? `<img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.product_name)}">`
            : '<div class="product-photo-empty"><i class="fa-solid fa-image"></i></div>'}
        </div>
        <div class="d-flex justify-content-between gap-2">
          <strong>${escapeHtml(localizedProductName(product))}</strong>
          <span class="d-inline-flex flex-column align-items-end gap-1">${productPriceMarkup(product)}</span>
        </div>
        <div class="billing-product-meta">
          ${billingProductMeta(product).map(item => `<div>${escapeHtml(item)}</div>`).join('')}
        </div>
      </button>
    </div>
  `).join('');
};

const addProductToCart = async (id) => {
  const product = (await db.getProducts()).find(item => Number(item.id) === Number(id));
  if (!product) return;
  if (availableStock(product) <= 0) return toast(`${product.product_name} is out of stock`, 'warning');
  const existing = cart.find(item => Number(item.id) === Number(id));
  const candidate = existing
    ? { ...existing, quantity: activeRestaurantContext ? Number(existing.base_quantity || 1) : Number(existing.quantity || 0) + Number(existing.base_quantity || 1) }
    : { ...product, quantity: Number(product.base_quantity || 1), sale_unit: product.base_unit || 'Piece' };
  if (!hasEnoughStock(candidate)) return toast(stockMessage(candidate), 'warning');
  if (existing && activeRestaurantContext) {
    existing.quantity = Number(existing.base_quantity || 1);
    existing.sale_unit = existing.base_unit || 'Piece';
  } else if (existing) existing.quantity = Number(existing.quantity || 0) + Number(existing.base_quantity || 1);
  else cart.push({ ...product, quantity: Number(product.base_quantity || 1), sale_unit: product.base_unit || 'Piece' });
  renderCart();
};

export const renderBilling = async () => {
  const settings = await db.getSettings();
  if (settings.billing_mode === 'table') return await renderTableBilling();

  $('#view').innerHTML = `
    <div class="row g-3">
      <div class="col-xl-8">
        <div class="pos-card mb-3">
          <div class="row g-2 align-items-center">
            <div class="col-lg-8">
              <div class="input-group input-group-lg">
                <input class="form-control" id="billing-search" placeholder="${t('searchProductScan')}">
                <button class="btn btn-outline-primary" id="billing-camera-scan" title="Scan barcode with camera"><i class="fa-solid fa-camera"></i></button>
              </div>
            </div>
            <div class="col-lg-4"><button class="btn btn-outline-secondary w-100 h-100" id="resume-bill"><i class="fa-solid fa-clock-rotate-left"></i> ${t('resumeHold')}</button></div>
          </div>
        </div>
        <div class="row g-3" id="billing-products"></div>
      </div>
      <div class="col-xl-4">
        <div class="pos-card cart-panel">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <h2 class="section-title mb-0">${t('currentBill')}</h2>
            <button class="btn btn-sm btn-outline-danger" id="clear-cart"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div id="cart-items"></div>
          <label class="form-label mt-3">${t('discount')}</label>
          <input class="form-control" id="discount" type="number" value="0" min="0">
          <div class="mt-3" id="cart-totals"></div>
          <div class="d-grid gap-2 mt-3">
            ${settings.weight_enabled === 'true' ? `<button class="btn btn-outline-primary" id="capture-weight"><i class="fa-solid fa-scale-balanced"></i> ${t('captureWeight')}</button>` : ''}
            <button class="btn btn-primary-gradient btn-lg" id="pay-now"><i class="fa-solid fa-wallet"></i> ${t('payment')}</button>
            <button class="btn btn-outline-secondary" id="hold-bill"><i class="fa-solid fa-pause"></i> ${t('holdBill')}</button>
          </div>
          <p class="text-muted small mt-3 mb-0">Shortcuts: Alt+N new bill, Enter from search adds first visible product.</p>
        </div>
      </div>
    </div>
  `;
  await renderProducts();
  renderCart();

  $('#billing-search').addEventListener('input', debounce(event => renderProducts(event.target.value)));
  $('#billing-search').addEventListener('keydown', async (event) => {
    if (event.key === 'Enter') $('#billing-products [data-product]')?.click();
  });
  $('#billing-products').addEventListener('click', async (event) => {
    const id = event.target.closest('[data-product]')?.dataset.product;
    if (!id) return;
    await addProductToCart(id);
  });
  $('#cart-items').addEventListener('click', (event) => {
    const removeButton = event.target.closest('[data-remove]');
    if (removeButton) {
      cart = cart.filter(row => Number(row.id) !== Number(removeButton.dataset.remove));
      renderCart();
      return;
    }

    const button = event.target.closest('[data-qty]');
    if (!button) return;
    const item = cart.find(row => Number(row.id) === Number(button.dataset.qty));
    const previousQuantity = Number(item.quantity || 0);
    item.quantity = previousQuantity + Number(button.dataset.delta);
    if (!hasEnoughStock(item)) {
      item.quantity = previousQuantity;
      toast(stockMessage(item), 'warning');
    }
    cart = cart.filter(row => row.quantity > 0);
    renderCart();
  });
  $('#cart-items').addEventListener('change', (event) => {
    const input = event.target.closest('[data-cart-quantity]');
    if (!input) return;
    const item = cart.find(row => Number(row.id) === Number(input.dataset.cartQuantity));
    if (!item) return;
    const previousQuantity = Number(item.quantity || 0);
    item.quantity = Number(input.value || 0);
    if (!hasEnoughStock(item)) {
      item.quantity = previousQuantity;
      toast(stockMessage(item), 'warning');
    }
    cart = cart.filter(row => Number(row.quantity || 0) > 0);
    renderCart();
  });
  $('#cart-items').addEventListener('change', (event) => {
    const select = event.target.closest('[data-cart-unit]');
    if (!select) return;
    const item = cart.find(row => Number(row.id) === Number(select.dataset.cartUnit));
    if (!item) return;
    const previousUnit = item.sale_unit;
    item.sale_unit = select.value;
    if (!hasEnoughStock(item)) {
      item.sale_unit = previousUnit;
      toast(stockMessage(item), 'warning');
    }
    renderCart();
  });
  $('#discount').addEventListener('input', renderCart);
  $('#clear-cart').addEventListener('click', () => {
    cart = [];
    resetManualDiscount();
    renderCart();
  });
  $('#hold-bill').addEventListener('click', async () => {
    if (!cart.length) return toast('Add products before holding a bill', 'warning');
    await db.holdBill(cart);
    cart = [];
    resetManualDiscount();
    renderCart();
    toast('Bill held');
  });
  $('#resume-bill').addEventListener('click', openHoldBills);
  $('#capture-weight')?.addEventListener('click', openWeightCapture);
  $('#billing-camera-scan').addEventListener('click', openBillingBarcodeScanner);
  $('#pay-now').addEventListener('click', () => {
    if (validateCartStock()) openPayment();
  });
  await addPendingBarcodeToCart();
};

const openWeightCapture = () => {
  showModal(`
    <div class="modal-header"><h5 class="modal-title">Capture Weight</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <div class="cash-payment-box">
        <div class="d-flex align-items-center gap-3">
          <i class="fa-solid fa-scale-balanced fs-2 text-primary"></i>
          <div>
            <h6 class="mb-1">Bluetooth weighing scale ready point</h6>
            <p class="text-muted mb-0">In the next phase this button will read live weight from the billing machine through Bluetooth and apply it to the selected weight product.</p>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-footer"><button class="btn btn-primary-gradient" data-bs-dismiss="modal">OK</button></div>
  `);
};

const renderTableBilling = async () => {
  activeRestaurantContext = null;
  cart = [];
  const tables = await db.getDiningTables();
  const openOrders = await db.getOpenTableOrders();
  const parcelOrder = openOrders.find(order => order.order_type === 'parcel' && !order.table_id);
  const takeawayOrder = openOrders.find(order => order.order_type === 'takeaway' && !order.table_id);
  $('#view').innerHTML = `
    <div class="pos-card mb-3">
      <div class="d-flex flex-wrap gap-2 justify-content-between align-items-center">
        <div><h2 class="section-title mb-1">${t('tableBillingTitle')}</h2><p class="text-muted mb-0">${t('tableBillingHelp')}</p></div>
        <div class="d-flex gap-2 flex-wrap">
          <button class="btn btn-outline-primary" data-order-type="parcel"><i class="fa-solid fa-bag-shopping"></i> ${t('parcel')} ${parcelOrder ? '<span class="badge bg-warning text-dark ms-1">Open</span>' : ''}</button>
          <button class="btn btn-outline-primary" data-order-type="takeaway"><i class="fa-solid fa-person-walking-luggage"></i> ${t('takeaway')} ${takeawayOrder ? '<span class="badge bg-warning text-dark ms-1">Open</span>' : ''}</button>
          <a class="btn btn-primary-gradient" href="#/tables"><i class="fa-solid fa-chair"></i> ${t('manageTables')}</a>
        </div>
      </div>
    </div>
    <div class="restaurant-table-grid">
      ${tables.map(table => `
        <button class="table-card ${escapeHtml(table.status || 'available')}" data-table="${table.id}">
          <span class="table-card-icon"><i class="fa-solid fa-chair"></i></span>
          <strong>${escapeHtml(displayTableName(table.table_name))}</strong>
          <small>${escapeHtml(table.area ? displayTableArea(table.area) : t('dining'))} | ${table.seats || 4} ${t('seats')}</small>
          <span class="table-status ${escapeHtml(table.status || 'available')}">${escapeHtml(displayStatus(table.status || 'available'))}</span>
        </button>
      `).join('')}
    </div>
  `;
  $('#view').onclick = async (event) => {
    const tableId = event.target.closest('[data-table]')?.dataset.table;
    const orderType = event.target.closest('[data-order-type]')?.dataset.orderType;
    if (tableId) {
      const table = tables.find(row => Number(row.id) === Number(tableId));
      return await openRestaurantOrder({ tableId: Number(tableId), orderType: 'table', label: displayTableName(table?.table_name || t('table')) });
    }
    if (orderType) return await openRestaurantOrder({ tableId: null, orderType, label: orderType === 'parcel' ? 'Parcel' : 'Takeaway' });
  };
};

const openRestaurantOrder = async (context) => {
  activeRestaurantContext = context;
  const order = context.orderType === 'table'
    ? await db.getActiveTableOrder(context.tableId)
    : await db.getActiveTableOrder(null, context.orderType);
  cart = normalizeCartItems(order ? await db.getTableOrderItems(order.id) : []);
  $('#view').innerHTML = `
    <div class="row g-3">
      <div class="col-xl-8">
        <div class="pos-card mb-3">
          <div class="d-flex flex-wrap gap-2 justify-content-between align-items-center mb-3">
            <div><h2 class="section-title mb-1">${escapeHtml(context.label)} Order</h2><p class="text-muted mb-0">${order ? `Running order ${escapeHtml(order.order_no)}` : 'New running order'}</p></div>
            <button class="btn btn-outline-secondary" id="back-to-tables"><i class="fa-solid fa-arrow-left"></i> ${t('backToTables')}</button>
          </div>
          <div class="input-group input-group-lg">
            <input class="form-control" id="billing-search" placeholder="${t('searchProductScan')}">
            <button class="btn btn-outline-primary" id="billing-camera-scan" title="Scan barcode with camera"><i class="fa-solid fa-camera"></i></button>
          </div>
        </div>
        <div class="row g-3" id="billing-products"></div>
      </div>
      <div class="col-xl-4">
        <div class="pos-card cart-panel">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <h2 class="section-title mb-0">${t('currentOrder')}</h2>
            <button class="btn btn-sm btn-outline-danger" id="clear-cart"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div id="cart-items"></div>
          <label class="form-label mt-3">${t('discount')}</label>
          <input class="form-control" id="discount" type="number" value="0" min="0">
          <div class="mt-3" id="cart-totals"></div>
          <div class="d-grid gap-2 mt-3">
            <button class="btn btn-outline-primary" id="save-table-order"><i class="fa-solid fa-floppy-disk"></i> ${t('saveOrder')}</button>
            <button class="btn btn-outline-secondary" id="print-kot"><i class="fa-solid fa-kitchen-set"></i> ${t('printKot')}</button>
            <button class="btn btn-primary-gradient btn-lg" id="pay-now"><i class="fa-solid fa-receipt"></i> ${t('generateBill')}</button>
          </div>
        </div>
      </div>
    </div>
  `;
  await renderProducts();
  renderCart();
  bindRestaurantOrderEvents();
};

const bindRestaurantOrderEvents = () => {
  $('#back-to-tables').addEventListener('click', renderTableBilling);
  $('#billing-search').addEventListener('input', debounce(event => renderProducts(event.target.value)));
  $('#billing-search').addEventListener('keydown', async (event) => {
    if (event.key === 'Enter') $('#billing-products [data-product]')?.click();
  });
  $('#billing-camera-scan').addEventListener('click', openBillingBarcodeScanner);
  $('#billing-products').addEventListener('click', async (event) => {
    const id = event.target.closest('[data-product]')?.dataset.product;
    if (id) await addProductToCart(id);
  });
  $('#cart-items').addEventListener('click', (event) => {
    const removeButton = event.target.closest('[data-remove]');
    if (removeButton) {
      cart = cart.filter(row => Number(row.id) !== Number(removeButton.dataset.remove));
      renderCart();
      return;
    }
    const button = event.target.closest('[data-qty]');
    if (!button) return;
    const item = cart.find(row => Number(row.id) === Number(button.dataset.qty));
    const previousQuantity = Number(item.quantity || 0);
    item.quantity = previousQuantity + Number(button.dataset.delta);
    if (!hasEnoughStock(item)) {
      item.quantity = previousQuantity;
      toast(stockMessage(item), 'warning');
    }
    cart = cart.filter(row => row.quantity > 0);
    renderCart();
  });
  $('#cart-items').addEventListener('change', (event) => {
    const input = event.target.closest('[data-cart-quantity]');
    const select = event.target.closest('[data-cart-unit]');
    if (input) {
      const item = cart.find(row => Number(row.id) === Number(input.dataset.cartQuantity));
      if (item) {
        const previousQuantity = Number(item.quantity || 0);
        item.quantity = Number(input.value || 0);
        if (!hasEnoughStock(item)) {
          item.quantity = previousQuantity;
          toast(stockMessage(item), 'warning');
        }
      }
      cart = cart.filter(row => Number(row.quantity || 0) > 0);
    }
    if (select) {
      const item = cart.find(row => Number(row.id) === Number(select.dataset.cartUnit));
      if (item) {
        const previousUnit = item.sale_unit;
        item.sale_unit = select.value;
        if (!hasEnoughStock(item)) {
          item.sale_unit = previousUnit;
          toast(stockMessage(item), 'warning');
        }
      }
    }
    renderCart();
  });
  $('#discount').addEventListener('input', renderCart);
  $('#clear-cart').addEventListener('click', () => {
    cart = [];
    resetManualDiscount();
    renderCart();
  });
  $('#save-table-order').addEventListener('click', () => {
    if (validateCartStock()) saveRestaurantOrder();
  });
  $('#print-kot').addEventListener('click', () => {
    if (validateCartStock()) printKot();
  });
  $('#pay-now').addEventListener('click', async () => {
    if (!validateCartStock()) return;
    await saveRestaurantOrder(false);
    await openPayment({ closeRestaurantOrder: true });
  });
};

const saveRestaurantOrder = async (showToast = true) => {
  if (!activeRestaurantContext) return;
  if (!cart.length) return toast('Add items before saving the order', 'warning');
  cart = normalizeCartItems(cart);
  if (!validateCartStock()) return;
  await db.saveTableOrder({
    tableId: activeRestaurantContext.tableId,
    orderType: activeRestaurantContext.orderType,
    items: cart,
    user: getCurrentUser()
  });
  if (showToast) {
    toast('Order saved');
    cart = [];
    activeRestaurantContext = null;
    resetManualDiscount();
    await renderTableBilling();
  }
};

const printKot = async () => {
  if (!activeRestaurantContext) return;
  if (!cart.length) return toast('Add items before printing KOT', 'warning');
  cart = normalizeCartItems(cart);
  if (!validateCartStock()) return;
  const orderId = await db.saveTableOrder({
    tableId: activeRestaurantContext.tableId,
    orderType: activeRestaurantContext.orderType,
    items: cart,
    user: getCurrentUser()
  });
  const byStation = cart.reduce((map, item) => {
    const station = item.fulfillment_station === 'store' ? 'store' : 'kitchen';
    if (!map.has(station)) map.set(station, []);
    map.get(station).push(item);
    return map;
  }, new Map());
  const createdKots = [];
  for (const [station, items] of byStation.entries()) {
    const kot = await db.createKot({ orderId, tableId: activeRestaurantContext.tableId, items, station });
    createdKots.push({ ...kot, station, items });
    try {
      await pushKotToCloud(kot.kotId);
    } catch (error) {
      toast(`${station === 'store' ? 'Store Room' : 'Kitchen'} KOT saved locally. Cloud sync failed: ${error.message}`, 'warning');
    }
  }
  const lines = createdKots.flatMap(kot => [
    `<tr><th colspan="2">${kot.station === 'store' ? 'Store Room' : 'Kitchen'} - ${escapeHtml(kot.kotNo)}</th></tr>`,
    ...kot.items.map(item => `<tr><td>${escapeHtml(item.product_name)}</td><td>${formatQuantity(item.quantity, item.sale_unit || item.base_unit || 'Piece')}</td></tr>`)
  ]).join('');
  showModal(`
    <div class="modal-header"><h5 class="modal-title">KOT Created</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <div class="receipt-preview print-area">
        <h5 class="text-center">KOT</h5>
        <p>${escapeHtml(activeRestaurantContext.label)}<br>${new Date().toLocaleString()}</p>
        <table class="table table-sm"><tbody>${lines}</tbody></table>
      </div>
    </div>
    <div class="modal-footer"><button class="btn btn-primary-gradient" onclick="window.print()"><i class="fa-solid fa-print"></i> Print KOT</button></div>
  `);
  toast('KOT saved');
};

const addPendingBarcodeToCart = async () => {
  const barcode = sessionStorage.getItem('pos-pending-barcode');
  if (!barcode) return;
  sessionStorage.removeItem('pos-pending-barcode');
  $('#billing-search').value = barcode;
  await renderProducts(barcode);
  const product = (await db.getProducts(barcode)).find(item => String(item.barcode || '') === String(barcode));
  if (product) {
    await addProductToCart(product.id);
    toast('Scanned product added to bill');
  } else {
    toast('No product found for scanned barcode', 'warning');
  }
};

const openBillingBarcodeScanner = async () => {
  showModal(`
    <div class="modal-header"><h5 class="modal-title">Scan Barcode</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <div class="barcode-camera-frame">
        <video id="billing-barcode-video" muted playsinline></video>
        <div class="barcode-scan-line"></div>
      </div>
      <div class="alert alert-info mt-3 mb-0" id="billing-barcode-status">Starting camera...</div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline-danger" id="stop-billing-barcode"><i class="fa-solid fa-stop"></i> Stop</button>
    </div>
  `);
  $('#stop-billing-barcode').addEventListener('click', () => {
    stopBillingBarcodeScanner();
    closeModal();
  });
  $('#app-modal').addEventListener('hidden.bs.modal', stopBillingBarcodeScanner, { once: true });
  await startBillingBarcodeScanner();
};

const startBillingBarcodeScanner = async () => {
  if (!('BarcodeDetector' in window)) {
    $('#billing-barcode-status').className = 'alert alert-warning mt-3 mb-0';
    $('#billing-barcode-status').textContent = 'Camera barcode scanning is not supported in this browser. Use manual search or Bluetooth scanner.';
    return;
  }
  try {
    billingBarcodeDetector = billingBarcodeDetector || new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'qr_code'] });
    billingBarcodeStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    const video = $('#billing-barcode-video');
    video.srcObject = billingBarcodeStream;
    await video.play();
    $('#billing-barcode-status').className = 'alert alert-success mt-3 mb-0';
    $('#billing-barcode-status').textContent = 'Point the camera at a barcode.';
    scanBillingBarcodeLoop();
  } catch (error) {
    $('#billing-barcode-status').className = 'alert alert-danger mt-3 mb-0';
    $('#billing-barcode-status').textContent = `Unable to open camera: ${error.message}`;
  }
};

const scanBillingBarcodeLoop = async () => {
  if (!billingBarcodeStream || !billingBarcodeDetector) return;
  try {
    const codes = await billingBarcodeDetector.detect($('#billing-barcode-video'));
    if (codes.length) {
      await addBarcodeToCurrentBill(codes[0].rawValue);
      return;
    }
  } catch (_) {}
  billingBarcodeTimer = setTimeout(scanBillingBarcodeLoop, 500);
};

const stopBillingBarcodeScanner = () => {
  clearTimeout(billingBarcodeTimer);
  billingBarcodeTimer = null;
  billingBarcodeStream?.getTracks().forEach(track => track.stop());
  billingBarcodeStream = null;
  const video = $('#billing-barcode-video');
  if (video) video.srcObject = null;
};

const addBarcodeToCurrentBill = async (code) => {
  if (!code) return;
  stopBillingBarcodeScanner();
  const products = await db.getProducts(code);
  const product = products.find(item => String(item.barcode || '') === String(code)) || products[0];
  if (!product) {
    $('#billing-barcode-status').className = 'alert alert-warning mt-3 mb-0';
    $('#billing-barcode-status').textContent = `No product found for barcode ${code}.`;
    return;
  }
  await addProductToCart(product.id);
  $('#billing-search').value = code;
  await renderProducts(code);
  closeModal();
  toast(`${product.product_name} added to bill`);
};

const openPayment = async (options = {}) => {
  if (!cart.length) return toast(t('cartEmpty'), 'warning');
  cart = normalizeCartItems(cart);
  if (!validateCartStock()) return;
  const totals = calculateCart(cart, Number($('#discount').value || 0));
  const customers = await db.getCustomers();
  showModal(`
    <div class="modal-header"><h5 class="modal-title">${t('payment')}</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <p class="text-muted mb-1">Amount Payable</p>
      <h3 class="fw-black mb-3">${money(totals.grandTotal)}</h3>
      <div class="row g-3 mb-2">
        <div class="col-12">
          <label class="form-label">${t('selectCustomer')}</label>
          <div class="position-relative mb-2">
            <input class="form-control" id="sale-customer-search" placeholder="${t('searchSavedCustomer')}" autocomplete="off">
            <div class="customer-suggest-box d-none" id="sale-customer-suggestions"></div>
          </div>
          <select class="form-select" id="sale-customer-select">
            <option value="">${t('walkInManualEntry')}</option>
            ${customers.map(customer => `<option value="${customer.id}">${escapeHtml(customer.customer_name)} - ${escapeHtml(customer.mobile)}</option>`).join('')}
          </select>
        </div>
        <div class="col-md-6">
          <label class="form-label">${t('customerName')}</label>
          <input class="form-control" id="customer-name" placeholder="${t('optional')}">
        </div>
        <div class="col-md-6">
          <label class="form-label">${t('mobileNumber')}</label>
          <input class="form-control" id="customer-phone" inputmode="tel" placeholder="WhatsApp number">
        </div>
      </div>
      <label class="form-label">${t('paymentMethod')}</label>
      <select class="form-select" id="payment-type"><option>Cash</option><option>UPI</option><option>Card</option></select>
      <div id="cash-payment-fields" class="cash-payment-box mt-3">
        <label class="form-label">${t('receivedAmount')}</label>
        <input class="form-control form-control-lg" id="cash-received" type="number" min="0" step="0.01" value="${totals.grandTotal.toFixed(2)}">
        <div class="d-flex justify-content-between align-items-center mt-3">
          <span class="text-muted">${t('balanceToGive')}</span>
          <strong class="fs-4" id="cash-balance">${money(0)}</strong>
        </div>
      </div>
      <label class="form-label mt-3">${t('referenceNumber')}</label>
      <input class="form-control" id="payment-ref" placeholder="Optional for UPI/Card">
    </div>
    <div class="modal-footer"><button class="btn btn-light" data-bs-dismiss="modal">${t('cancel')}</button><button class="btn btn-primary-gradient" id="complete-sale">${t('completeSale')}</button></div>
  `);

  const updateCashFields = () => {
    const isCash = $('#payment-type').value === 'Cash';
    $('#cash-payment-fields').classList.toggle('d-none', !isCash);
    const received = Number($('#cash-received').value || 0);
    const balance = Math.max(0, received - totals.grandTotal);
    $('#cash-balance').textContent = money(balance);
  };

  $('#payment-type').addEventListener('change', updateCashFields);
  $('#cash-received').addEventListener('input', updateCashFields);
  const customerOptionHtml = (customerList = []) => `
    <option value="">${t('walkInManualEntry')}</option>
    ${customerList
      .map(customer => `<option value="${customer.id}">${escapeHtml(customer.customer_name)} - ${escapeHtml(customer.mobile)}</option>`)
      .join('')}
  `;
  const customerSuggestionHtml = (customerList = []) => customerList.length
    ? customerList.slice(0, 8).map(customer => `
      <button class="customer-suggest-item" type="button" data-customer-id="${customer.id}">
        <span>
          <strong>${escapeHtml(customer.customer_name)}</strong>
          <small>${escapeHtml(customer.mobile || '')}</small>
        </span>
        ${customer.gstin ? `<em>${escapeHtml(customer.gstin)}</em>` : ''}
      </button>
    `).join('')
    : `<div class="customer-suggest-empty">${t('noCustomersFound')}</div>`;
  const applySelectedCustomer = () => {
    const customer = customers.find(row => String(row.id) === String($('#sale-customer-select').value));
    if (!customer) {
      $('#customer-name').value = '';
      $('#customer-phone').value = '';
      return;
    }
    $('#customer-name').value = customer.customer_name || '';
    $('#customer-phone').value = customer.mobile || '';
  };
  const selectCustomer = (id) => {
    $('#sale-customer-select').value = String(id || '');
    applySelectedCustomer();
    const customer = customers.find(row => String(row.id) === String(id));
    if (customer) $('#sale-customer-search').value = `${customer.customer_name || ''} ${customer.mobile || ''}`.trim();
    $('#sale-customer-suggestions').classList.add('d-none');
  };
  const renderCustomerSuggestions = (customerList = []) => {
    $('#sale-customer-suggestions').innerHTML = customerSuggestionHtml(customerList);
    $('#sale-customer-suggestions').classList.remove('d-none');
  };
  $('#sale-customer-search').addEventListener('input', () => {
    const term = $('#sale-customer-search').value.trim().toLowerCase();
    const filteredCustomers = customers
      .filter(customer => `${customer.customer_name || ''} ${customer.mobile || ''} ${customer.gstin || ''}`.toLowerCase().includes(term));
    $('#sale-customer-select').innerHTML = customerOptionHtml(filteredCustomers);
    renderCustomerSuggestions(term ? filteredCustomers : customers);
    if (term && filteredCustomers.length) {
      $('#sale-customer-select').value = String(filteredCustomers[0].id);
      applySelectedCustomer();
    } else {
      $('#sale-customer-select').value = '';
      applySelectedCustomer();
    }
  });
  $('#sale-customer-search').addEventListener('focus', () => renderCustomerSuggestions(customers));
  $('#sale-customer-suggestions').addEventListener('click', (event) => {
    const customerId = event.target.closest('[data-customer-id]')?.dataset.customerId;
    if (customerId) selectCustomer(customerId);
  });
  $('#sale-customer-select').addEventListener('change', () => {
    applySelectedCustomer();
    const customer = customers.find(row => String(row.id) === String($('#sale-customer-select').value));
    $('#sale-customer-search').value = customer ? `${customer.customer_name || ''} ${customer.mobile || ''}`.trim() : '';
    $('#sale-customer-suggestions').classList.add('d-none');
  });
  updateCashFields();

  $('#complete-sale').addEventListener('click', async () => {
    const paymentType = $('#payment-type').value;
    if (paymentType === 'Cash' && Number($('#cash-received').value || 0) < totals.grandTotal) {
      toast('Received cash is less than bill total', 'warning');
      $('#cash-received').focus();
      return;
    }
    const invoice = await db.nextInvoice();
    const customerName = $('#customer-name').value.trim();
    const customerPhone = $('#customer-phone').value.trim();
    if (customerName && customerPhone) {
      const selectedCustomer = customers.find(row => String(row.id) === String($('#sale-customer-select').value));
      const existingCustomer = customers.find(row => String(row.mobile || '').trim() === customerPhone);
      if (selectedCustomer?.source === 'sale') {
        await db.saveCustomer({ customer_name: customerName, mobile: customerPhone });
      } else if (!selectedCustomer && !existingCustomer) {
        await db.saveCustomer({ customer_name: customerName, mobile: customerPhone });
      }
    }
    await db.saveSale({ invoice_no: invoice, items: cart, subtotal: totals.subtotal, discount: totals.discount, gstTotal: totals.gstTotal, grandTotal: totals.grandTotal, paymentType, referenceNo: $('#payment-ref').value, customerName, customerPhone, user: getCurrentUser() });
    if (options.closeRestaurantOrder && activeRestaurantContext) {
      const openTickets = (await db.getKotTickets()).filter(ticket => activeRestaurantContext.orderType === 'table'
        ? Number(ticket.table_id) === Number(activeRestaurantContext.tableId)
        : !ticket.table_id && String(ticket.table_name || '').toLowerCase() === String(activeRestaurantContext.orderType || '').toLowerCase());
      await db.closeTableOrdersForContext(activeRestaurantContext);
      for (const ticket of openTickets) {
        try {
          await updateCloudKotStatus(ticket.kot_no, 'served');
        } catch (_) {}
      }
    }
    const soldCart = [...cart];
    cart = [];
    activeRestaurantContext = null;
    resetManualDiscount();
    closeModal();
    toast(`Bill ${invoice} saved`);
    printReceipt(invoice, soldCart, totals, { customerName, customerPhone });
    if (options.closeRestaurantOrder) {
      await renderTableBilling();
      return;
    }
    renderCart();
    await renderProducts($('#billing-search').value);
  });
};

const openHoldBills = async () => {
  const holds = await db.getHoldBills();
  showModal(`
    <div class="modal-header"><h5 class="modal-title">Held Bills</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      ${holds.length ? holds.map(hold => `<button class="btn btn-outline-primary w-100 text-start mb-2" data-resume="${hold.id}">${hold.hold_no}<span class="float-end">${new Date(hold.created_at).toLocaleString()}</span></button>`).join('') : '<p class="text-muted">No held bills.</p>'}
    </div>
  `);
  $('#app-modal-content').addEventListener('click', async (event) => {
    const id = event.target.closest('[data-resume]')?.dataset.resume;
    if (!id) return;
    const hold = holds.find(row => Number(row.id) === Number(id));
    cart = JSON.parse(hold.cart_json);
    await db.deleteHoldBill(id);
    closeModal();
    renderCart();
    toast('Held bill resumed');
  });
};

const whatsappNumber = (phone = '') => phone.replace(/\D/g, '');

const receiptMessage = (settings, invoice, items, totals, customer = {}) => {
  const lines = calculateCartLines(items, totals.discount)
    .map(line => `${line.item.product_name} - ${formatQuantity(line.quantity, line.unit)} - ${money(line.taxableAfterDiscount)}`)
    .join('\n');
  return [
    `${settings.shop_name || 'Ginsoft POS'} Bill`,
    `Invoice: ${invoice}`,
    customer.customerName ? `Customer: ${customer.customerName}` : '',
    `Date: ${new Date().toLocaleString()}`,
    '',
    lines,
    '',
    `CGST: ${money(totals.gstTotal / 2)}`,
    `SGST: ${money(totals.gstTotal / 2)}`,
    `GST: ${money(totals.gstTotal)}`,
    `Discount: ${money(totals.discount)}`,
    `Total: ${money(totals.grandTotal)}`,
    '',
    settings.receipt_footer || settings.footer_text || 'Thank you.'
  ].filter(Boolean).join('\n');
};

const printReceipt = async (invoice, items, totals, customer = {}) => {
  const settings = await db.getSettings();
  const savedCustomers = customer.customerPhone ? await db.getCustomers(customer.customerPhone) : [];
  const savedCustomer = savedCustomers.find(row => String(row.mobile || '').trim() === String(customer.customerPhone || '').trim()) || {};
  const billCustomer = {
    customerName: customer.customerName || savedCustomer.customer_name || '',
    customerPhone: customer.customerPhone || savedCustomer.mobile || '',
    gstin: savedCustomer.gstin || '',
    address: savedCustomer.address || ''
  };
  const lines = calculateCartLines(items, totals.discount).map(line => `<tr><td>${escapeHtml(line.item.product_name)}</td><td>${formatQuantity(line.quantity, line.unit)}</td><td class="text-end">${money(line.taxableAfterDiscount)}</td></tr>`).join('');
  const phone = whatsappNumber(billCustomer.customerPhone);
  const message = encodeURIComponent(receiptMessage(settings, invoice, items, totals, billCustomer));
  const whatsappUrl = phone ? `https://wa.me/${phone}?text=${message}` : `https://wa.me/?text=${message}`;
  showModal(`
    <div class="modal-header"><h5 class="modal-title">Receipt</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <div class="receipt-preview print-area receipt-theme-${escapeHtml(settings.printer_theme || 'thermal')}">
        ${settings.receipt_logo ? `<img class="receipt-logo" src="${escapeHtml(settings.receipt_logo)}" alt="Receipt logo">` : ''}
        <h5 class="text-center">${escapeHtml(settings.receipt_header || settings.shop_name)}</h5>
        <p class="text-center small">${escapeHtml(settings.shop_address)}<br>GSTIN: ${escapeHtml(settings.gstin)}<br>${escapeHtml(settings.phone)}</p>
        <p>Invoice: ${invoice}<br>Date: ${new Date().toLocaleString()}${billCustomer.customerName ? `<br>Customer: ${escapeHtml(billCustomer.customerName)}` : ''}${billCustomer.customerPhone ? `<br>Mobile: ${escapeHtml(billCustomer.customerPhone)}` : ''}${billCustomer.gstin ? `<br>GSTIN: ${escapeHtml(billCustomer.gstin)}` : ''}${billCustomer.address ? `<br>Address: ${escapeHtml(billCustomer.address)}` : ''}</p>
        <table class="table table-sm"><tbody>${lines}</tbody></table>
        <p>CGST: ${money(totals.gstTotal / 2)}<br>SGST: ${money(totals.gstTotal / 2)}<br>GST: ${money(totals.gstTotal)}<br>Discount: ${money(totals.discount)}</p>
        <h5>Total: ${money(totals.grandTotal)}</h5>
        <div class="border p-3 text-center my-2">QR AREA</div>
        <p class="text-center">${escapeHtml(settings.receipt_footer || settings.footer_text)}</p>
      </div>
    </div>
    <div class="modal-footer">
      <a class="btn btn-outline-success" href="${whatsappUrl}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i> Send WhatsApp</a>
      <button class="btn btn-outline-primary" onclick="window.print()"><i class="fa-solid fa-file-pdf"></i> Save PDF</button>
      <button class="btn btn-outline-success" id="save-send-whatsapp"><i class="fa-solid fa-file-pdf"></i> Save & Send PDF</button>
      <button class="btn btn-primary-gradient" onclick="window.print()"><i class="fa-solid fa-print"></i> Print</button>
    </div>
  `);
  $('#save-send-whatsapp')?.addEventListener('click', () => {
    window.print();
    setTimeout(() => window.open(whatsappUrl, '_blank', 'noopener'), 700);
  });
};
