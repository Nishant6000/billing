import { db } from '../js/db.js';
import { getCurrentUser } from '../js/auth.js';
import { $, dateOnly, debounce, escapeHtml, formatQuantity, money } from '../js/utils.js';
import { closeModal, showModal, toast } from '../js/ui.js';
import { t } from '../js/i18n.js';

const renderRows = async () => {
  const sales = await db.getSales({
    from: $('#sales-from').value,
    to: $('#sales-to').value,
    payment: $('#sales-payment').value,
    search: $('#sales-search').value
  });
  $('#sales-body').innerHTML = sales.map(sale => `
    <tr class="touch-row">
      <td><strong>${escapeHtml(sale.invoice_no)}</strong><div class="text-muted small">${new Date(sale.created_at).toLocaleString()}</div>${sale.customer_name || sale.customer_phone ? `<div class="text-muted small">${escapeHtml(sale.customer_name || t('customer'))} ${escapeHtml(sale.customer_phone || '')}</div>` : ''}</td>
      <td><span class="badge-soft">${escapeHtml(paymentLabel(sale.payment_type))}</span><div class="text-muted small">${escapeHtml(statusLabel(sale.status || 'paid'))}</div></td>
      <td>${money(sale.gst_total)}</td>
      <td class="fw-bold">${money(sale.grand_total)}</td>
      <td class="text-end">
        <button class="btn btn-sm btn-outline-primary" data-view="${sale.id}" title="${t('viewBill')}"><i class="fa-solid fa-eye"></i></button>
        <button class="btn btn-sm btn-outline-success" data-whatsapp="${sale.id}" title="${t('sendWhatsapp')}"><i class="fa-brands fa-whatsapp"></i></button>
        <button class="btn btn-sm btn-outline-success" data-modify="${sale.id}" title="${t('modifyBill')}"><i class="fa-solid fa-pen-to-square"></i></button>
        <button class="btn btn-sm btn-outline-secondary" data-reprint="${sale.id}" title="${t('reprintBill')}"><i class="fa-solid fa-print"></i></button>
        <button class="btn btn-sm btn-outline-warning" data-return="${sale.id}" title="${t('returnBill')}"><i class="fa-solid fa-rotate-left"></i></button>
        <button class="btn btn-sm btn-outline-danger" data-delete="${sale.id}" title="${t('deleteBill')}"><i class="fa-solid fa-trash"></i></button>
      </td>
    </tr>
  `).join('');
};

export const renderSales = async () => {
  $('#view').innerHTML = `
    <div class="pos-card">
      <h2 class="section-title">${t('billHistory')}</h2>
      <div class="row g-2 mb-3">
        <div class="col-md-3"><input class="form-control" id="sales-search" placeholder="${t('invoiceNumber')}"></div>
        <div class="col-md-2"><input class="form-control" id="sales-from" type="date" value="${dateOnly()}"></div>
        <div class="col-md-2"><input class="form-control" id="sales-to" type="date" value="${dateOnly()}"></div>
        <div class="col-md-2"><select class="form-select" id="sales-payment"><option value="">${t('allPayments')}</option><option value="Cash">${t('cash')}</option><option value="UPI">UPI</option><option value="Card">${t('card')}</option></select></div>
        <div class="col-md-3"><button class="btn btn-outline-secondary w-100" id="clear-sales-filter"><i class="fa-solid fa-filter-circle-xmark"></i> ${t('clearFilters')}</button></div>
      </div>
      <div class="table-responsive">
        <table class="table">
          <thead><tr><th>${t('invoice')}</th><th>${t('paymentStatus')}</th><th>GST</th><th>${t('total')}</th><th></th></tr></thead>
          <tbody id="sales-body"></tbody>
        </table>
      </div>
    </div>
  `;
  await renderRows();
  ['sales-search', 'sales-from', 'sales-to', 'sales-payment'].forEach(id => $(`#${id}`).addEventListener('input', debounce(renderRows)));
  $('#clear-sales-filter').addEventListener('click', async () => {
    $('#sales-search').value = '';
    $('#sales-from').value = '';
    $('#sales-to').value = '';
    $('#sales-payment').value = '';
    await renderRows();
  });
  $('#sales-body').addEventListener('click', async (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    const id = button.dataset.view || button.dataset.whatsapp || button.dataset.modify || button.dataset.reprint || button.dataset.return || button.dataset.delete;
    const sale = (await db.getSales()).find(row => Number(row.id) === Number(id));
    if (button.dataset.whatsapp) return await sendSaleOnWhatsApp(sale);
    if (button.dataset.modify) return await openModifySale(sale);
    if (button.dataset.delete && confirm(t('confirmDeleteBill'))) {
      await db.deleteSale(id, getCurrentUser());
      toast(t('billDeleted'), 'warning');
      return await renderRows();
    }
    if (button.dataset.return && confirm(t('confirmReturnBill'))) {
      await db.returnSale(id, t('billReturned'), getCurrentUser());
      toast(t('billMarkedReturned'), 'warning');
      return await renderRows();
    }
    await showSale(sale, Boolean(button.dataset.reprint));
  });
};

const openModifySale = async (sale) => {
  showModal(`
    <div class="modal-header"><h5 class="modal-title">${t('modify')} ${escapeHtml(sale.invoice_no)}</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
    <form id="modify-sale-form">
      <div class="modal-body">
        <div class="row g-3">
          <div class="col-md-4"><label class="form-label">${t('paymentType')}</label><select class="form-select" name="payment_type"><option value="Cash" ${sale.payment_type === 'Cash' ? 'selected' : ''}>${t('cash')}</option><option value="UPI" ${sale.payment_type === 'UPI' ? 'selected' : ''}>UPI</option><option value="Card" ${sale.payment_type === 'Card' ? 'selected' : ''}>${t('card')}</option></select></div>
          <div class="col-md-4"><label class="form-label">${t('status')}</label><select class="form-select" name="status"><option value="paid" ${sale.status === 'paid' ? 'selected' : ''}>${t('paid')}</option><option value="returned" ${sale.status === 'returned' ? 'selected' : ''}>${t('returned')}</option></select></div>
          <div class="col-md-4"><label class="form-label">${t('billDiscount')}</label><input class="form-control" name="discount" type="number" min="0" step="0.01" value="${Number(sale.discount || 0)}"></div>
          <div class="col-12"><label class="form-label">${t('modificationNote')}</label><input class="form-control" name="note" placeholder="${t('reasonForModification')}"></div>
        </div>
      </div>
      <div class="modal-footer"><button class="btn btn-light" type="button" data-bs-dismiss="modal">${t('cancel')}</button><button class="btn btn-primary-gradient">${t('saveChanges')}</button></div>
    </form>
  `);
  $('#modify-sale-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget).entries());
    await db.updateSale(sale.id, form, getCurrentUser());
    closeModal();
    toast(t('billModified'));
    await renderRows();
  });
};

const showSale = async (sale, shouldPrint = false) => {
  const items = await db.getSaleItems(sale.id);
  const settings = await db.getSettings();
  const whatsappUrl = await saleWhatsAppUrl(sale, items);
  const receiptHtml = (settings.printer_theme || 'thermal') === 'desktop'
    ? desktopInvoiceHtml(settings, sale, items)
    : thermalReceiptHtml(settings, sale, items);
  showModal(`
    <div class="modal-header"><h5 class="modal-title">${escapeHtml(sale.invoice_no)}</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      ${receiptHtml}
    </div>
    <div class="modal-footer">
      <a class="btn btn-outline-success" href="${whatsappUrl}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i> ${t('sendWhatsapp')}</a>
      <button class="btn btn-outline-primary" onclick="window.print()"><i class="fa-solid fa-file-pdf"></i> ${t('savePdf')}</button>
      <button class="btn btn-outline-success" id="sales-save-send-whatsapp"><i class="fa-solid fa-file-pdf"></i> ${t('saveSendPdf')}</button>
      <button class="btn btn-primary-gradient" onclick="window.print()"><i class="fa-solid fa-print"></i> ${t('print')}</button>
    </div>
  `);
  $('#sales-save-send-whatsapp')?.addEventListener('click', () => {
    window.print();
    setTimeout(() => window.open(whatsappUrl, '_blank', 'noopener'), 700);
  });
  if (shouldPrint) setTimeout(() => window.print(), 350);
};

const thermalReceiptHtml = (settings, sale, items) => `
  <div class="receipt-preview print-area receipt-theme-thermal">
    ${settings.receipt_logo ? `<img class="receipt-logo" src="${escapeHtml(settings.receipt_logo)}" alt="${t('receiptLogo')}">` : ''}
    <h5 class="text-center">${escapeHtml(settings.receipt_header || settings.shop_name || t('receipt'))}</h5>
    <p>${t('date')}: ${new Date(sale.created_at).toLocaleString()}<br>${t('payment')}: ${escapeHtml(paymentLabel(sale.payment_type))}${sale.customer_name ? `<br>${t('customer')}: ${escapeHtml(sale.customer_name)}` : ''}${sale.customer_phone ? `<br>${t('mobile')}: ${escapeHtml(sale.customer_phone)}` : ''}</p>
    <table class="table table-sm"><tbody>${items.map(item => `<tr><td>${escapeHtml(item.product_name)}</td><td>${formatQuantity(item.quantity, item.sale_unit || 'Piece')}</td><td class="text-end">${money(item.line_total)}</td></tr>`).join('')}</tbody></table>
    <p>GST: ${money(sale.gst_total)}<br>${t('discount')}: ${money(sale.discount)}</p>
    <h5>${t('total')}: ${money(sale.grand_total)}</h5>
    <p class="text-center">${escapeHtml(settings.receipt_footer || settings.footer_text || '')}</p>
  </div>
`;

const desktopInvoiceHtml = (settings, sale, items) => {
  const subtotal = Number(sale.subtotal || 0);
  const discount = Number(sale.discount || 0);
  const gst = Number(sale.gst_total || 0);
  const total = Number(sale.grand_total || 0);
  return `
    <div class="receipt-preview print-area receipt-theme-desktop tally-invoice">
      <div class="tally-title">${escapeHtml(settings.receipt_header || t('taxInvoice'))}</div>
      <div class="tally-shop-row">
        <div class="tally-logo-cell">${settings.receipt_logo ? `<img class="receipt-logo" src="${escapeHtml(settings.receipt_logo)}" alt="${t('receiptLogo')}">` : ''}</div>
        <div class="tally-shop-details">
          <h4>${escapeHtml(settings.shop_name || 'Ginsoft POS')}</h4>
          <p>${escapeHtml(settings.shop_address || '')}</p>
          <p>${t('gstin')}: ${escapeHtml(settings.gstin || '-')} | ${t('phone')}: ${escapeHtml(settings.phone || '-')}</p>
        </div>
      </div>
      <div class="tally-info-grid">
        <div>
          <strong>${t('billTo')}</strong>
          <p>${escapeHtml(sale.customer_name || t('walkInCustomer'))}</p>
          <p>${t('mobile')}: ${escapeHtml(sale.customer_phone || '-')}</p>
        </div>
        <div>
          <p><strong>${t('invoiceNo')}:</strong> ${escapeHtml(sale.invoice_no)}</p>
          <p><strong>${t('date')}:</strong> ${new Date(sale.created_at).toLocaleString()}</p>
          <p><strong>${t('payment')}:</strong> ${escapeHtml(paymentLabel(sale.payment_type))}</p>
        </div>
      </div>
      <table class="tally-items">
        <thead>
          <tr><th>${t('sl')}</th><th>${t('particulars')}</th><th>${t('qty')}</th><th>${t('rate')}</th><th>GST %</th><th class="text-end">${t('amount')}</th></tr>
        </thead>
        <tbody>
          ${items.map((item, index) => `
            <tr>
              <td>${index + 1}</td>
              <td>${escapeHtml(item.product_name)}</td>
              <td>${escapeHtml(formatQuantity(item.quantity, item.sale_unit || 'Piece'))}</td>
              <td>${money(item.price)}</td>
              <td>${Number(item.gst_percent || 0).toFixed(2)}</td>
              <td class="text-end">${money(item.line_total)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div class="tally-summary-row">
        <div class="tally-amount-words">
          <strong>${t('amountChargeable')}:</strong>
          <p>${escapeHtml(amountInWords(total))}</p>
        </div>
        <table class="tally-totals">
          <tr><td>${t('subtotal')}</td><td>${money(subtotal)}</td></tr>
          <tr><td>${t('discount')}</td><td>${money(discount)}</td></tr>
          <tr><td>GST</td><td>${money(gst)}</td></tr>
          <tr class="grand"><td>${t('grandTotal')}</td><td>${money(total)}</td></tr>
        </table>
      </div>
      <div class="tally-footer-row">
        <div>${escapeHtml(settings.receipt_footer || settings.footer_text || t('thankYou'))}</div>
        <div class="tally-signature">${t('authorisedSignatory')}</div>
      </div>
    </div>
  `;
};

const amountInWords = (value) => {
  const rounded = Math.round(Number(value || 0));
  if (!rounded) return t('rupeesZeroOnly');
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const underHundred = n => n < 20 ? ones[n] : `${tens[Math.floor(n / 10)]} ${ones[n % 10]}`.trim();
  const underThousand = n => `${n >= 100 ? `${ones[Math.floor(n / 100)]} Hundred ` : ''}${n % 100 ? underHundred(n % 100) : ''}`.trim();
  const parts = [
    [10000000, 'Crore'],
    [100000, 'Lakh'],
    [1000, 'Thousand']
  ];
  let remaining = rounded;
  const words = [];
  for (const [factor, label] of parts) {
    const count = Math.floor(remaining / factor);
    if (count) {
      words.push(`${underThousand(count)} ${label}`);
      remaining %= factor;
    }
  }
  if (remaining) words.push(underThousand(remaining));
  return `${t('rupees')} ${words.join(' ')} ${t('only')}`;
};

const sendSaleOnWhatsApp = async (sale) => {
  const items = await db.getSaleItems(sale.id);
  window.open(await saleWhatsAppUrl(sale, items), '_blank', 'noopener');
};

const saleWhatsAppUrl = async (sale, items) => {
  const settings = await db.getSettings();
  const phone = String(sale.customer_phone || '').replace(/\D/g, '');
  const lines = items.map(item => `${item.product_name} - ${formatQuantity(item.quantity, item.sale_unit || 'Piece')} - ${money(item.line_total)}`).join('\n');
  const message = encodeURIComponent([
    `${settings.shop_name || 'Ginsoft POS'} ${t('bill')}`,
    `${t('invoice')}: ${sale.invoice_no}`,
    sale.customer_name ? `${t('customer')}: ${sale.customer_name}` : '',
    `${t('date')}: ${new Date(sale.created_at).toLocaleString()}`,
    '',
    lines,
    '',
    `GST: ${money(sale.gst_total)}`,
    `${t('discount')}: ${money(sale.discount)}`,
    `${t('total')}: ${money(sale.grand_total)}`,
    '',
    settings.receipt_footer || settings.footer_text || t('thankYou')
  ].filter(Boolean).join('\n'));
  return phone ? `https://wa.me/${phone}?text=${message}` : `https://wa.me/?text=${message}`;
};

const paymentLabel = (payment = '') => {
  const normalized = String(payment || '').toLowerCase();
  if (normalized === 'cash') return t('cash');
  if (normalized === 'card') return t('card');
  return payment || '-';
};

const statusLabel = (status = '') => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'paid') return t('paid');
  if (normalized === 'returned') return t('returned');
  return status || '-';
};
