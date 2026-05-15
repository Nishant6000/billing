import { db } from '../js/db.js';
import { $, calculateCart, calculateCartLines, debounce, escapeHtml, formatBasePrice, formatPackingChain, formatQuantity, money, productDiscountAmount, saleUnitsForProduct } from '../js/utils.js';
import { closeModal, showModal, toast } from '../js/ui.js';

let cart = [];
let activeRestaurantContext = null;
let billingBarcodeStream = null;
let billingBarcodeTimer = null;
let billingBarcodeDetector = null;

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

const renderCart = () => {
  const discount = Number($('#discount')?.value || 0);
  const totals = calculateCart(cart, discount);
  const lines = calculateCartLines(cart, discount);
  $('#cart-items').innerHTML = lines.length ? lines.map(line => {
    const item = line.item;
    return `
    <div class="cart-line">
      <div>
        <strong>${escapeHtml(item.product_name)}</strong>
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
  }).join('') : '<p class="text-muted text-center py-4">Cart is empty</p>';
  $('#cart-totals').innerHTML = `
    <div class="d-flex justify-content-between"><span>Subtotal</span><strong>${money(totals.subtotal)}</strong></div>
    <div class="d-flex justify-content-between"><span>GST</span><strong>${money(totals.gstTotal)}</strong></div>
    <div class="d-flex justify-content-between"><span>Discount</span><strong>${money(totals.discount)}</strong></div>
    <hr><div class="d-flex justify-content-between fs-4"><span>Total</span><strong>${money(totals.grandTotal)}</strong></div>
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
          <strong>${escapeHtml(product.product_name)}</strong>
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
  const existing = cart.find(item => Number(item.id) === Number(id));
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
                <input class="form-control" id="billing-search" placeholder="Search product or scan barcode">
                <button class="btn btn-outline-primary" id="billing-camera-scan" title="Scan barcode with camera"><i class="fa-solid fa-camera"></i></button>
              </div>
            </div>
            <div class="col-lg-4"><button class="btn btn-outline-secondary w-100 h-100" id="resume-bill"><i class="fa-solid fa-clock-rotate-left"></i> Resume Hold</button></div>
          </div>
        </div>
        <div class="row g-3" id="billing-products"></div>
      </div>
      <div class="col-xl-4">
        <div class="pos-card cart-panel">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <h2 class="section-title mb-0">Current Bill</h2>
            <button class="btn btn-sm btn-outline-danger" id="clear-cart"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div id="cart-items"></div>
          <label class="form-label mt-3">Discount</label>
          <input class="form-control" id="discount" type="number" value="0" min="0">
          <div class="mt-3" id="cart-totals"></div>
          <div class="d-grid gap-2 mt-3">
            ${settings.weight_enabled === 'true' ? '<button class="btn btn-outline-primary" id="capture-weight"><i class="fa-solid fa-scale-balanced"></i> Capture Weight</button>' : ''}
            <button class="btn btn-primary-gradient btn-lg" id="pay-now"><i class="fa-solid fa-wallet"></i> Payment</button>
            <button class="btn btn-outline-secondary" id="hold-bill"><i class="fa-solid fa-pause"></i> Hold Bill</button>
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
    item.quantity = Number(item.quantity || 0) + Number(button.dataset.delta);
    cart = cart.filter(row => row.quantity > 0);
    renderCart();
  });
  $('#cart-items').addEventListener('change', (event) => {
    const input = event.target.closest('[data-cart-quantity]');
    if (!input) return;
    const item = cart.find(row => Number(row.id) === Number(input.dataset.cartQuantity));
    if (!item) return;
    item.quantity = Number(input.value || 0);
    cart = cart.filter(row => Number(row.quantity || 0) > 0);
    renderCart();
  });
  $('#cart-items').addEventListener('change', (event) => {
    const select = event.target.closest('[data-cart-unit]');
    if (!select) return;
    const item = cart.find(row => Number(row.id) === Number(select.dataset.cartUnit));
    if (!item) return;
    item.sale_unit = select.value;
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
  $('#pay-now').addEventListener('click', openPayment);
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
        <div><h2 class="section-title mb-1">Table Billing</h2><p class="text-muted mb-0">Open a table, add items, save KOT, and generate the final bill at checkout.</p></div>
        <div class="d-flex gap-2 flex-wrap">
          <button class="btn btn-outline-primary" data-order-type="parcel"><i class="fa-solid fa-bag-shopping"></i> Parcel ${parcelOrder ? '<span class="badge bg-warning text-dark ms-1">Open</span>' : ''}</button>
          <button class="btn btn-outline-primary" data-order-type="takeaway"><i class="fa-solid fa-person-walking-luggage"></i> Takeaway ${takeawayOrder ? '<span class="badge bg-warning text-dark ms-1">Open</span>' : ''}</button>
          <a class="btn btn-primary-gradient" href="#/tables"><i class="fa-solid fa-chair"></i> Manage Tables</a>
        </div>
      </div>
    </div>
    <div class="restaurant-table-grid">
      ${tables.map(table => `
        <button class="table-card ${escapeHtml(table.status || 'available')}" data-table="${table.id}">
          <span class="table-card-icon"><i class="fa-solid fa-chair"></i></span>
          <strong>${escapeHtml(table.table_name)}</strong>
          <small>${escapeHtml(table.area || 'Dining')} | ${table.seats || 4} seats</small>
          <span class="table-status ${escapeHtml(table.status || 'available')}">${escapeHtml(table.status || 'available')}</span>
        </button>
      `).join('')}
    </div>
  `;
  $('#view').addEventListener('click', async (event) => {
    const tableId = event.target.closest('[data-table]')?.dataset.table;
    const orderType = event.target.closest('[data-order-type]')?.dataset.orderType;
    if (tableId) {
      const table = tables.find(row => Number(row.id) === Number(tableId));
      return await openRestaurantOrder({ tableId: Number(tableId), orderType: 'table', label: table?.table_name || 'Table' });
    }
    if (orderType) return await openRestaurantOrder({ tableId: null, orderType, label: orderType === 'parcel' ? 'Parcel' : 'Takeaway' });
  });
};

const openRestaurantOrder = async (context) => {
  activeRestaurantContext = context;
  const order = context.orderType === 'table'
    ? await db.getActiveTableOrder(context.tableId)
    : await db.getActiveTableOrder(null, context.orderType);
  cart = order ? await db.getTableOrderItems(order.id) : [];
  $('#view').innerHTML = `
    <div class="row g-3">
      <div class="col-xl-8">
        <div class="pos-card mb-3">
          <div class="d-flex flex-wrap gap-2 justify-content-between align-items-center mb-3">
            <div><h2 class="section-title mb-1">${escapeHtml(context.label)} Order</h2><p class="text-muted mb-0">${order ? `Running order ${escapeHtml(order.order_no)}` : 'New running order'}</p></div>
            <button class="btn btn-outline-secondary" id="back-to-tables"><i class="fa-solid fa-arrow-left"></i> Tables</button>
          </div>
          <div class="input-group input-group-lg">
            <input class="form-control" id="billing-search" placeholder="Search item or scan barcode">
            <button class="btn btn-outline-primary" id="billing-camera-scan" title="Scan barcode with camera"><i class="fa-solid fa-camera"></i></button>
          </div>
        </div>
        <div class="row g-3" id="billing-products"></div>
      </div>
      <div class="col-xl-4">
        <div class="pos-card cart-panel">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <h2 class="section-title mb-0">Running Order</h2>
            <button class="btn btn-sm btn-outline-danger" id="clear-cart"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div id="cart-items"></div>
          <label class="form-label mt-3">Discount</label>
          <input class="form-control" id="discount" type="number" value="0" min="0">
          <div class="mt-3" id="cart-totals"></div>
          <div class="d-grid gap-2 mt-3">
            <button class="btn btn-outline-primary" id="save-table-order"><i class="fa-solid fa-floppy-disk"></i> Save Order</button>
            <button class="btn btn-outline-secondary" id="print-kot"><i class="fa-solid fa-kitchen-set"></i> Print KOT</button>
            <button class="btn btn-primary-gradient btn-lg" id="pay-now"><i class="fa-solid fa-receipt"></i> Generate Bill</button>
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
    item.quantity = Number(item.quantity || 0) + Number(button.dataset.delta);
    cart = cart.filter(row => row.quantity > 0);
    renderCart();
  });
  $('#cart-items').addEventListener('change', (event) => {
    const input = event.target.closest('[data-cart-quantity]');
    const select = event.target.closest('[data-cart-unit]');
    if (input) {
      const item = cart.find(row => Number(row.id) === Number(input.dataset.cartQuantity));
      if (item) item.quantity = Number(input.value || 0);
      cart = cart.filter(row => Number(row.quantity || 0) > 0);
    }
    if (select) {
      const item = cart.find(row => Number(row.id) === Number(select.dataset.cartUnit));
      if (item) item.sale_unit = select.value;
    }
    renderCart();
  });
  $('#discount').addEventListener('input', renderCart);
  $('#clear-cart').addEventListener('click', () => {
    cart = [];
    resetManualDiscount();
    renderCart();
  });
  $('#save-table-order').addEventListener('click', saveRestaurantOrder);
  $('#print-kot').addEventListener('click', printKot);
  $('#pay-now').addEventListener('click', async () => {
    await saveRestaurantOrder(false);
    await openPayment({ closeRestaurantOrder: true });
  });
};

const saveRestaurantOrder = async (showToast = true) => {
  if (!activeRestaurantContext) return;
  if (!cart.length) return toast('Add items before saving the order', 'warning');
  await db.saveTableOrder({
    tableId: activeRestaurantContext.tableId,
    orderType: activeRestaurantContext.orderType,
    items: cart
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
  const orderId = await db.saveTableOrder({
    tableId: activeRestaurantContext.tableId,
    orderType: activeRestaurantContext.orderType,
    items: cart
  });
  const kot = await db.createKot({ orderId, tableId: activeRestaurantContext.tableId, items: cart });
  const lines = cart.map(item => `<tr><td>${escapeHtml(item.product_name)}</td><td>${formatQuantity(item.quantity, item.sale_unit || item.base_unit || 'Piece')}</td></tr>`).join('');
  showModal(`
    <div class="modal-header"><h5 class="modal-title">${kot.kotNo}</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
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
  if (!cart.length) return toast('Cart is empty', 'warning');
  const totals = calculateCart(cart, Number($('#discount').value || 0));
  showModal(`
    <div class="modal-header"><h5 class="modal-title">Payment</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <p class="text-muted mb-1">Amount Payable</p>
      <h3 class="fw-black mb-3">${money(totals.grandTotal)}</h3>
      <div class="row g-3 mb-2">
        <div class="col-md-6">
          <label class="form-label">Customer Name</label>
          <input class="form-control" id="customer-name" placeholder="Optional">
        </div>
        <div class="col-md-6">
          <label class="form-label">Mobile Number</label>
          <input class="form-control" id="customer-phone" inputmode="tel" placeholder="WhatsApp number">
        </div>
      </div>
      <label class="form-label">Payment method</label>
      <select class="form-select" id="payment-type"><option>Cash</option><option>UPI</option><option>Card</option></select>
      <div id="cash-payment-fields" class="cash-payment-box mt-3">
        <label class="form-label">Received Amount</label>
        <input class="form-control form-control-lg" id="cash-received" type="number" min="0" step="0.01" value="${totals.grandTotal.toFixed(2)}">
        <div class="d-flex justify-content-between align-items-center mt-3">
          <span class="text-muted">Balance to Give</span>
          <strong class="fs-4" id="cash-balance">${money(0)}</strong>
        </div>
      </div>
      <label class="form-label mt-3">Reference number</label>
      <input class="form-control" id="payment-ref" placeholder="Optional for UPI/Card">
    </div>
    <div class="modal-footer"><button class="btn btn-light" data-bs-dismiss="modal">Cancel</button><button class="btn btn-primary-gradient" id="complete-sale">Complete Sale</button></div>
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
    await db.saveSale({ invoice_no: invoice, items: cart, subtotal: totals.subtotal, discount: totals.discount, gstTotal: totals.gstTotal, grandTotal: totals.grandTotal, paymentType, referenceNo: $('#payment-ref').value, customerName, customerPhone });
    if (options.closeRestaurantOrder && activeRestaurantContext) {
      const order = activeRestaurantContext.orderType === 'table'
        ? await db.getActiveTableOrder(activeRestaurantContext.tableId)
        : await db.getActiveTableOrder(null, activeRestaurantContext.orderType);
      if (order) await db.closeTableOrder(order.id);
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
    `GST: ${money(totals.gstTotal)}`,
    `Discount: ${money(totals.discount)}`,
    `Total: ${money(totals.grandTotal)}`,
    '',
    settings.footer_text || 'Thank you.'
  ].filter(Boolean).join('\n');
};

const printReceipt = async (invoice, items, totals, customer = {}) => {
  const settings = await db.getSettings();
  const lines = calculateCartLines(items, totals.discount).map(line => `<tr><td>${escapeHtml(line.item.product_name)}</td><td>${formatQuantity(line.quantity, line.unit)}</td><td class="text-end">${money(line.taxableAfterDiscount)}</td></tr>`).join('');
  const phone = whatsappNumber(customer.customerPhone);
  const message = encodeURIComponent(receiptMessage(settings, invoice, items, totals, customer));
  const whatsappUrl = phone ? `https://wa.me/${phone}?text=${message}` : `https://wa.me/?text=${message}`;
  showModal(`
    <div class="modal-header"><h5 class="modal-title">Receipt</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <div class="receipt-preview print-area">
        <h5 class="text-center">${escapeHtml(settings.shop_name)}</h5>
        <p class="text-center small">${escapeHtml(settings.shop_address)}<br>GSTIN: ${escapeHtml(settings.gstin)}<br>${escapeHtml(settings.phone)}</p>
        <p>Invoice: ${invoice}<br>Date: ${new Date().toLocaleString()}${customer.customerName ? `<br>Customer: ${escapeHtml(customer.customerName)}` : ''}${customer.customerPhone ? `<br>Mobile: ${escapeHtml(customer.customerPhone)}` : ''}</p>
        <table class="table table-sm"><tbody>${lines}</tbody></table>
        <p>GST: ${money(totals.gstTotal)}<br>Discount: ${money(totals.discount)}</p>
        <h5>Total: ${money(totals.grandTotal)}</h5>
        <div class="border p-3 text-center my-2">QR AREA</div>
        <p class="text-center">${escapeHtml(settings.footer_text)}</p>
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
