import { db } from '../js/db.js';
import { $, calculateCart, calculateCartLines, debounce, effectiveUnitPrice, escapeHtml, money, productDiscountAmount } from '../js/utils.js';
import { closeModal, showModal, toast } from '../js/ui.js';

let cart = [];

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
  if (!discount) return `<span class="badge-soft">${money(product.selling_price)}</span>`;
  return `
    <span class="badge-soft">${money(effectiveUnitPrice(product))}</span>
    <span class="text-muted small text-decoration-line-through">${money(product.selling_price)}</span>
  `;
};

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
        <div class="text-muted small">${money(effectiveUnitPrice(item))} | GST ${item.gst_percent}%${productDiscountAmount(item) ? ` | Saved ${money(productDiscountAmount(item))}` : ''}</div>
        <div class="qty-stepper mt-2">
          <button data-qty="${item.id}" data-delta="-1"><i class="fa-solid fa-minus"></i></button>
          <strong>${item.quantity}</strong>
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

export const renderBilling = async () => {
  $('#view').innerHTML = `
    <div class="row g-3">
      <div class="col-xl-8">
        <div class="pos-card mb-3">
          <div class="row g-2 align-items-center">
            <div class="col-lg-8"><input class="form-control form-control-lg" id="billing-search" placeholder="Search product or scan barcode"></div>
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
    const product = (await db.getProducts()).find(item => Number(item.id) === Number(id));
    const existing = cart.find(item => Number(item.id) === Number(id));
    if (existing) existing.quantity += 1;
    else cart.push({ ...product, quantity: 1 });
    renderCart();
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
    item.quantity += Number(button.dataset.delta);
    cart = cart.filter(row => row.quantity > 0);
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
  $('#pay-now').addEventListener('click', openPayment);
};

const openPayment = async () => {
  if (!cart.length) return toast('Cart is empty', 'warning');
  const totals = calculateCart(cart, Number($('#discount').value || 0));
  showModal(`
    <div class="modal-header"><h5 class="modal-title">Payment</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <p class="text-muted mb-1">Amount Payable</p>
      <h3 class="fw-black mb-3">${money(totals.grandTotal)}</h3>
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
    await db.saveSale({ invoice_no: invoice, items: cart, subtotal: totals.subtotal, discount: totals.discount, gstTotal: totals.gstTotal, grandTotal: totals.grandTotal, paymentType, referenceNo: $('#payment-ref').value });
    const soldCart = [...cart];
    cart = [];
    resetManualDiscount();
    closeModal();
    renderCart();
    toast(`Bill ${invoice} saved`);
    printReceipt(invoice, soldCart, totals);
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

const printReceipt = async (invoice, items, totals) => {
  const settings = await db.getSettings();
  const lines = calculateCartLines(items, totals.discount).map(line => `<tr><td>${escapeHtml(line.item.product_name)}</td><td>${line.quantity}</td><td class="text-end">${money(line.taxableAfterDiscount)}</td></tr>`).join('');
  showModal(`
    <div class="modal-header"><h5 class="modal-title">Receipt</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <div class="receipt-preview print-area">
        <h5 class="text-center">${escapeHtml(settings.shop_name)}</h5>
        <p class="text-center small">${escapeHtml(settings.shop_address)}<br>GSTIN: ${escapeHtml(settings.gstin)}<br>${escapeHtml(settings.phone)}</p>
        <p>Invoice: ${invoice}<br>Date: ${new Date().toLocaleString()}</p>
        <table class="table table-sm"><tbody>${lines}</tbody></table>
        <p>GST: ${money(totals.gstTotal)}<br>Discount: ${money(totals.discount)}</p>
        <h5>Total: ${money(totals.grandTotal)}</h5>
        <div class="border p-3 text-center my-2">QR AREA</div>
        <p class="text-center">${escapeHtml(settings.footer_text)}</p>
      </div>
    </div>
    <div class="modal-footer"><button class="btn btn-primary-gradient" onclick="window.print()"><i class="fa-solid fa-print"></i> Print</button></div>
  `);
};
