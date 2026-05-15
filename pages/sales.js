import { db } from '../js/db.js';
import { $, dateOnly, debounce, escapeHtml, formatQuantity, money } from '../js/utils.js';
import { closeModal, showModal, toast } from '../js/ui.js';

const renderRows = async () => {
  const sales = await db.getSales({
    from: $('#sales-from').value,
    to: $('#sales-to').value,
    payment: $('#sales-payment').value,
    search: $('#sales-search').value
  });
  $('#sales-body').innerHTML = sales.map(sale => `
    <tr class="touch-row">
      <td><strong>${escapeHtml(sale.invoice_no)}</strong><div class="text-muted small">${new Date(sale.created_at).toLocaleString()}</div>${sale.customer_name || sale.customer_phone ? `<div class="text-muted small">${escapeHtml(sale.customer_name || 'Customer')} ${escapeHtml(sale.customer_phone || '')}</div>` : ''}</td>
      <td><span class="badge-soft">${sale.payment_type}</span><div class="text-muted small">${escapeHtml(sale.status || 'paid')}</div></td>
      <td>${money(sale.gst_total)}</td>
      <td class="fw-bold">${money(sale.grand_total)}</td>
      <td class="text-end">
        <button class="btn btn-sm btn-outline-primary" data-view="${sale.id}"><i class="fa-solid fa-eye"></i></button>
        <button class="btn btn-sm btn-outline-success" data-whatsapp="${sale.id}" title="Send WhatsApp"><i class="fa-brands fa-whatsapp"></i></button>
        <button class="btn btn-sm btn-outline-success" data-modify="${sale.id}"><i class="fa-solid fa-pen-to-square"></i></button>
        <button class="btn btn-sm btn-outline-secondary" data-reprint="${sale.id}"><i class="fa-solid fa-print"></i></button>
        <button class="btn btn-sm btn-outline-warning" data-return="${sale.id}"><i class="fa-solid fa-rotate-left"></i></button>
        <button class="btn btn-sm btn-outline-danger" data-delete="${sale.id}"><i class="fa-solid fa-trash"></i></button>
      </td>
    </tr>
  `).join('');
};

export const renderSales = async () => {
  $('#view').innerHTML = `
    <div class="pos-card">
      <h2 class="section-title">Bill History</h2>
      <div class="row g-2 mb-3">
        <div class="col-md-3"><input class="form-control" id="sales-search" placeholder="Invoice number"></div>
        <div class="col-md-2"><input class="form-control" id="sales-from" type="date" value="${dateOnly()}"></div>
        <div class="col-md-2"><input class="form-control" id="sales-to" type="date" value="${dateOnly()}"></div>
        <div class="col-md-2"><select class="form-select" id="sales-payment"><option value="">All Payments</option><option>Cash</option><option>UPI</option><option>Card</option></select></div>
        <div class="col-md-3"><button class="btn btn-outline-secondary w-100" id="clear-sales-filter"><i class="fa-solid fa-filter-circle-xmark"></i> Clear Filters</button></div>
      </div>
      <div class="table-responsive">
        <table class="table">
          <thead><tr><th>Invoice</th><th>Payment / Status</th><th>GST</th><th>Total</th><th></th></tr></thead>
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
    if (button.dataset.delete && confirm('Delete this bill?')) {
      await db.deleteSale(id);
      toast('Bill deleted', 'warning');
      return await renderRows();
    }
    if (button.dataset.return && confirm('Mark this bill as returned?')) {
      await db.returnSale(id);
      toast('Bill marked returned', 'warning');
      return await renderRows();
    }
    await showSale(sale, Boolean(button.dataset.reprint));
  });
};

const openModifySale = async (sale) => {
  showModal(`
    <div class="modal-header"><h5 class="modal-title">Modify ${escapeHtml(sale.invoice_no)}</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
    <form id="modify-sale-form">
      <div class="modal-body">
        <div class="row g-3">
          <div class="col-md-4"><label class="form-label">Payment Type</label><select class="form-select" name="payment_type"><option ${sale.payment_type === 'Cash' ? 'selected' : ''}>Cash</option><option ${sale.payment_type === 'UPI' ? 'selected' : ''}>UPI</option><option ${sale.payment_type === 'Card' ? 'selected' : ''}>Card</option></select></div>
          <div class="col-md-4"><label class="form-label">Status</label><select class="form-select" name="status"><option value="paid" ${sale.status === 'paid' ? 'selected' : ''}>Paid</option><option value="returned" ${sale.status === 'returned' ? 'selected' : ''}>Returned</option></select></div>
          <div class="col-md-4"><label class="form-label">Bill Discount</label><input class="form-control" name="discount" type="number" min="0" step="0.01" value="${Number(sale.discount || 0)}"></div>
          <div class="col-12"><label class="form-label">Modification Note</label><input class="form-control" name="note" placeholder="Reason for modification"></div>
        </div>
      </div>
      <div class="modal-footer"><button class="btn btn-light" type="button" data-bs-dismiss="modal">Cancel</button><button class="btn btn-primary-gradient">Save Changes</button></div>
    </form>
  `);
  $('#modify-sale-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget).entries());
    await db.updateSale(sale.id, form);
    closeModal();
    toast('Bill modified');
    await renderRows();
  });
};

const showSale = async (sale, shouldPrint = false) => {
  const items = await db.getSaleItems(sale.id);
  const whatsappUrl = await saleWhatsAppUrl(sale, items);
  showModal(`
    <div class="modal-header"><h5 class="modal-title">${escapeHtml(sale.invoice_no)}</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <div class="receipt-preview print-area">
        <p>Date: ${new Date(sale.created_at).toLocaleString()}<br>Payment: ${sale.payment_type}${sale.customer_name ? `<br>Customer: ${escapeHtml(sale.customer_name)}` : ''}${sale.customer_phone ? `<br>Mobile: ${escapeHtml(sale.customer_phone)}` : ''}</p>
        <table class="table table-sm"><tbody>${items.map(item => `<tr><td>${escapeHtml(item.product_name)}</td><td>${formatQuantity(item.quantity, item.sale_unit || 'Piece')}</td><td class="text-end">${money(item.line_total)}</td></tr>`).join('')}</tbody></table>
        <p>GST: ${money(sale.gst_total)}<br>Discount: ${money(sale.discount)}</p>
        <h5>Total: ${money(sale.grand_total)}</h5>
      </div>
    </div>
    <div class="modal-footer">
      <a class="btn btn-outline-success" href="${whatsappUrl}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i> Send WhatsApp</a>
      <button class="btn btn-outline-primary" onclick="window.print()"><i class="fa-solid fa-file-pdf"></i> Save PDF</button>
      <button class="btn btn-outline-success" id="sales-save-send-whatsapp"><i class="fa-solid fa-file-pdf"></i> Save & Send PDF</button>
      <button class="btn btn-primary-gradient" onclick="window.print()"><i class="fa-solid fa-print"></i> Print</button>
    </div>
  `);
  $('#sales-save-send-whatsapp')?.addEventListener('click', () => {
    window.print();
    setTimeout(() => window.open(whatsappUrl, '_blank', 'noopener'), 700);
  });
  if (shouldPrint) setTimeout(() => window.print(), 350);
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
    `${settings.shop_name || 'Zento POS'} Bill`,
    `Invoice: ${sale.invoice_no}`,
    sale.customer_name ? `Customer: ${sale.customer_name}` : '',
    `Date: ${new Date(sale.created_at).toLocaleString()}`,
    '',
    lines,
    '',
    `GST: ${money(sale.gst_total)}`,
    `Discount: ${money(sale.discount)}`,
    `Total: ${money(sale.grand_total)}`,
    '',
    settings.footer_text || 'Thank you.'
  ].filter(Boolean).join('\n'));
  return phone ? `https://wa.me/${phone}?text=${message}` : `https://wa.me/?text=${message}`;
};
