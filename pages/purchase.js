import { db } from '../js/db.js';
import { $, dateOnly, debounce, escapeHtml, money } from '../js/utils.js';
import { toast } from '../js/ui.js';
import { t } from '../js/i18n.js';

const blankItem = () => ({ item_name: '', hsn: '', quantity: 1, taxable_value: 0, gst_percent: 18 });
let purchaseItems = [blankItem()];

export const renderPurchaseEntry = async () => {
  $('#view').innerHTML = `
    <div class="pos-card">
      <form id="purchase-form">
        <div class="d-flex flex-wrap gap-2 justify-content-between align-items-center mb-3">
          <div>
            <h2 class="section-title mb-1">${t('purchaseBillEntry')}</h2>
            <p class="text-muted mb-0">${t('purchaseEntryHelp')}</p>
          </div>
          <a class="btn btn-outline-primary" href="#/purchase-history"><i class="fa-solid fa-clock-rotate-left"></i> ${t('purchaseHistory')}</a>
        </div>
          <div class="row g-3">
            <div class="col-md-6"><label class="form-label">${t('purchaseBillNo')}</label><input class="form-control" name="purchase_no" required></div>
            <div class="col-md-6"><label class="form-label">${t('billDate')}</label><input class="form-control" name="bill_date" type="date" value="${dateOnly()}" required></div>
            <div class="col-md-6"><label class="form-label">${t('supplierName')}</label><input class="form-control" name="supplier_name" required></div>
            <div class="col-md-6"><label class="form-label">${t('supplierGstin')}</label><input class="form-control" name="supplier_gstin"></div>
            <div class="col-12"><label class="form-label">${t('note')}</label><input class="form-control" name="note" placeholder="${t('optional')}"></div>
          </div>
          <hr>
          <div class="d-flex justify-content-between align-items-center mb-2">
            <h2 class="section-title mb-0">${t('items')}</h2>
            <button class="btn btn-sm btn-outline-primary" type="button" id="add-purchase-item"><i class="fa-solid fa-plus"></i> ${t('addItem')}</button>
          </div>
          <div id="purchase-items"></div>
          <div class="mt-3" id="purchase-totals"></div>
          <button class="btn btn-primary-gradient mt-3"><i class="fa-solid fa-floppy-disk"></i> ${t('savePurchase')}</button>
      </form>
    </div>
  `;

  renderPurchaseItems();

  $('#add-purchase-item').addEventListener('click', () => {
    purchaseItems.push(blankItem());
    renderPurchaseItems();
  });
  $('#purchase-items').addEventListener('input', updatePurchaseItem);
  $('#purchase-items').addEventListener('click', (event) => {
    const index = event.target.closest('[data-remove-purchase-item]')?.dataset.removePurchaseItem;
    if (index === undefined) return;
    purchaseItems = purchaseItems.filter((_, itemIndex) => itemIndex !== Number(index));
    if (!purchaseItems.length) purchaseItems.push(blankItem());
    renderPurchaseItems();
  });
  $('#purchase-form').addEventListener('submit', savePurchase);
};

export const renderPurchaseHistory = async () => {
  $('#view').innerHTML = `
    <div class="pos-card">
      <div class="d-flex flex-wrap gap-2 justify-content-between align-items-center mb-3">
        <div>
          <h2 class="section-title mb-1">${t('purchaseHistory')}</h2>
          <p class="text-muted mb-0">${t('purchaseHistoryHelp')}</p>
        </div>
        <div class="d-flex gap-2 flex-wrap">
          <input class="form-control" id="purchase-from" type="date" style="max-width: 170px">
          <input class="form-control" id="purchase-to" type="date" style="max-width: 170px">
          <input class="form-control" id="purchase-search" style="max-width: 280px" placeholder="${t('searchProductBarcode')}">
          <button class="btn btn-outline-secondary" id="clear-purchase-filter" type="button"><i class="fa-solid fa-filter-circle-xmark"></i></button>
          <a class="btn btn-primary-gradient" href="#/purchase"><i class="fa-solid fa-plus"></i> ${t('newPurchase')}</a>
        </div>
      </div>
      <div class="table-responsive">
        <table class="table">
          <thead><tr><th>${t('bill')}</th><th>${t('supplier')}</th><th>${t('date')}</th><th>GST</th><th>${t('total')}</th><th></th></tr></thead>
          <tbody id="purchase-body"></tbody>
        </table>
      </div>
    </div>
  `;
  await renderPurchaseRows();
  ['purchase-search', 'purchase-from', 'purchase-to'].forEach(id => $(`#${id}`).addEventListener('input', debounce(renderPurchaseRows)));
  $('#clear-purchase-filter').addEventListener('click', async () => {
    $('#purchase-search').value = '';
    $('#purchase-from').value = '';
    $('#purchase-to').value = '';
    await renderPurchaseRows();
  });
  $('#purchase-body').addEventListener('click', async (event) => {
    const id = event.target.closest('[data-delete-purchase]')?.dataset.deletePurchase;
    if (!id || !confirm('Delete this purchase bill?')) return;
    await db.deletePurchase(id);
    toast('Purchase deleted', 'warning');
    await renderPurchaseRows();
  });
};

const renderPurchaseItems = () => {
  $('#purchase-items').innerHTML = purchaseItems.map((item, index) => `
    <div class="purchase-item-row">
      <div><label class="form-label">${t('item')}</label><input class="form-control" data-purchase-field="item_name" data-index="${index}" value="${escapeHtml(item.item_name)}" required></div>
      <div><label class="form-label">${t('hsn')}</label><input class="form-control" data-purchase-field="hsn" data-index="${index}" value="${escapeHtml(item.hsn)}"></div>
      <div><label class="form-label">${t('qty')}</label><input class="form-control" type="number" min="0.01" step="0.01" data-purchase-field="quantity" data-index="${index}" value="${item.quantity}"></div>
      <div><label class="form-label">${t('taxable')}</label><input class="form-control" type="number" min="0" step="0.01" data-purchase-field="taxable_value" data-index="${index}" value="${item.taxable_value}"></div>
      <div><label class="form-label">GST %</label><input class="form-control" type="number" min="0" step="0.01" data-purchase-field="gst_percent" data-index="${index}" value="${item.gst_percent}"></div>
      <button class="cart-delete-btn align-self-end" type="button" data-remove-purchase-item="${index}" title="Remove item"><i class="fa-solid fa-trash"></i></button>
    </div>
  `).join('');
  renderPurchaseTotals();
};

const updatePurchaseItem = (event) => {
  const input = event.target.closest('[data-purchase-field]');
  if (!input) return;
  const item = purchaseItems[Number(input.dataset.index)];
  const field = input.dataset.purchaseField;
  item[field] = ['quantity', 'taxable_value', 'gst_percent'].includes(field) ? Number(input.value || 0) : input.value;
  renderPurchaseTotals();
};

const purchaseTotals = () => {
  const subtotal = purchaseItems.reduce((sum, item) => sum + Number(item.taxable_value || 0), 0);
  const gst = purchaseItems.reduce((sum, item) => sum + Number(item.taxable_value || 0) * (Number(item.gst_percent || 0) / 100), 0);
  return { subtotal, gst, total: subtotal + gst };
};

const renderPurchaseTotals = () => {
  const totals = purchaseTotals();
  $('#purchase-totals').innerHTML = `
    <div class="d-flex justify-content-between"><span>${t('taxableValue')}</span><strong>${money(totals.subtotal)}</strong></div>
    <div class="d-flex justify-content-between"><span>${t('inputGst')}</span><strong>${money(totals.gst)}</strong></div>
    <hr><div class="d-flex justify-content-between fs-5"><span>${t('total')}</span><strong>${money(totals.total)}</strong></div>
  `;
};

const savePurchase = async (event) => {
  event.preventDefault();
  const formElement = event.currentTarget;
  const submitButton = formElement.querySelector('button[type="submit"], button:not([type])');
  if (submitButton) submitButton.disabled = true;
  const form = Object.fromEntries(new FormData(formElement).entries());
  const items = purchaseItems.filter(item => item.item_name.trim() && Number(item.taxable_value || 0) >= 0);
  if (!items.length) {
    if (submitButton) submitButton.disabled = false;
    return toast('Add at least one purchase item', 'warning');
  }
  try {
    await db.savePurchase({ ...form, items });
    purchaseItems = [blankItem()];
    formElement.reset();
    formElement.bill_date.value = dateOnly();
    toast('Purchase bill saved');
    history.replaceState(null, '', '#/purchase-history');
    document.querySelectorAll('.nav-link-pos').forEach(link => link.classList.toggle('active', link.dataset.route === 'purchase-history'));
    await renderPurchaseHistory();
  } catch (error) {
    toast(error.message || 'Unable to save purchase bill', 'danger');
    if (submitButton) submitButton.disabled = false;
  }
};

const renderPurchaseRows = async () => {
  const rows = await db.getPurchases({
    search: $('#purchase-search')?.value || '',
    from: $('#purchase-from')?.value || '',
    to: $('#purchase-to')?.value || ''
  });
  $('#purchase-body').innerHTML = rows.length ? rows.map(row => `
    <tr>
      <td><strong>${escapeHtml(row.purchase_no)}</strong></td>
      <td>${escapeHtml(row.supplier_name)}<div class="text-muted small">${escapeHtml(row.supplier_gstin || '-')}</div></td>
      <td>${new Date(row.bill_date).toLocaleDateString()}</td>
      <td>${money(row.gst_total)}</td>
      <td class="fw-bold">${money(row.grand_total)}</td>
      <td class="text-end"><button class="btn btn-sm btn-outline-danger" data-delete-purchase="${row.id}"><i class="fa-solid fa-trash"></i></button></td>
    </tr>
  `).join('') : `<tr><td colspan="6" class="text-center text-muted py-4">${t('noPurchaseBills')}</td></tr>`;
};
