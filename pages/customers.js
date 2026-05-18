import { db } from '../js/db.js';
import { $, debounce, downloadFile, escapeHtml, toCSV } from '../js/utils.js';
import { closeModal, showModal, toast } from '../js/ui.js';
import { t } from '../js/i18n.js';

let customerPage = 1;
let customerPageSize = 10;

const customerRows = (customers = []) => customers.map(customer => {
  const saleOnly = customer.source === 'sale';
  return `
    <tr class="touch-row">
      <td>
        <strong>${escapeHtml(customer.customer_name)}</strong>
        <div class="text-muted small">${escapeHtml(customer.mobile)}</div>
      </td>
      <td>${escapeHtml(customer.gstin || '-')}</td>
      <td>${escapeHtml(customer.address || '-')}</td>
      <td class="text-end">
        <button class="btn btn-sm btn-outline-primary" data-edit-customer="${customer.id}" title="${saleOnly ? t('saveCustomer') : t('edit')}"><i class="fa-solid ${saleOnly ? 'fa-user-plus' : 'fa-pen'}"></i></button>
        ${saleOnly ? '' : `<button class="btn btn-sm btn-outline-danger" data-delete-customer="${customer.id}" title="${t('delete')}"><i class="fa-solid fa-trash"></i></button>`}
      </td>
    </tr>
  `;
}).join('');

const renderCustomerTable = async () => {
  const customers = await db.getCustomers($('#customer-search')?.value || '');
  const totalPages = Math.max(1, Math.ceil(customers.length / customerPageSize));
  customerPage = Math.min(Math.max(1, customerPage), totalPages);
  const start = (customerPage - 1) * customerPageSize;
  const visibleCustomers = customers.slice(start, start + customerPageSize);
  $('#customers-body').innerHTML = customers.length
    ? customerRows(visibleCustomers)
    : `<tr><td colspan="4" class="text-center text-muted py-4">${t('noCustomersFound')}</td></tr>`;
  $('#customers-page-info').textContent = customers.length
    ? `${start + 1}-${Math.min(start + customerPageSize, customers.length)} / ${customers.length}`
    : '0 / 0';
  $('#customers-prev').disabled = customerPage <= 1;
  $('#customers-next').disabled = customerPage >= totalPages;
};

const exportCustomersCsv = async () => {
  const customers = await db.getCustomers($('#customer-search')?.value || '');
  const rows = customers.map(customer => ({
    customer_name: customer.customer_name || '',
    mobile: customer.mobile || '',
    gstin: customer.gstin || '',
    address: customer.address || '',
    source: customer.source === 'sale' ? 'sales history' : 'customer',
    created_at: customer.created_at || '',
    updated_at: customer.updated_at || ''
  }));
  downloadFile('customers.csv', toCSV(rows));
  toast(t('exportCsv'));
};

const openCustomerModal = (customer = null) => {
  showModal(`
    <form id="customer-form">
      <div class="modal-header">
        <h5 class="modal-title">${customer ? t('editCustomer') : t('addCustomer')}</h5>
        <button class="btn-close" type="button" data-bs-dismiss="modal" aria-label="${t('close')}"></button>
      </div>
      <div class="modal-body">
        <input type="hidden" name="id" value="${escapeHtml(customer?.id || '')}">
        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label">${t('customerName')} <span class="text-danger">*</span></label>
            <input class="form-control" name="customer_name" value="${escapeHtml(customer?.customer_name || '')}" required>
          </div>
          <div class="col-md-6">
            <label class="form-label">${t('mobileNumber')} <span class="text-danger">*</span></label>
            <input class="form-control" name="mobile" inputmode="tel" value="${escapeHtml(customer?.mobile || '')}" required>
          </div>
          <div class="col-md-6">
            <label class="form-label">${t('gstin')} <span class="text-muted small">(${t('optional')})</span></label>
            <input class="form-control" name="gstin" value="${escapeHtml(customer?.gstin || '')}">
          </div>
          <div class="col-md-6">
            <label class="form-label">${t('address')} <span class="text-muted small">(${t('optional')})</span></label>
            <textarea class="form-control" name="address" rows="2">${escapeHtml(customer?.address || '')}</textarea>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-light" type="button" data-bs-dismiss="modal">${t('cancel')}</button>
        <button class="btn btn-primary-gradient" type="submit"><i class="fa-solid fa-floppy-disk"></i> ${t('saveCustomer')}</button>
      </div>
    </form>
  `);

  $('#customer-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      await db.saveCustomer(form);
      closeModal();
      toast(t('customerSaved'));
      await renderCustomerTable();
    } catch (error) {
      toast(error.message, 'danger');
    }
  });
};

export const renderCustomers = async () => {
  $('#view').innerHTML = `
    <div class="pos-card">
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <div>
          <h2 class="section-title mb-1">${t('customers')}</h2>
          <p class="text-muted mb-0">${t('customersHelp')}</p>
        </div>
        <div class="d-flex flex-wrap gap-2">
          <button class="btn btn-outline-success" id="export-customers" type="button"><i class="fa-solid fa-file-csv"></i> ${t('exportCsv')}</button>
          <button class="btn btn-primary-gradient" id="add-customer" type="button"><i class="fa-solid fa-user-plus"></i> ${t('addCustomer')}</button>
        </div>
      </div>
      <div class="row g-2 mb-3">
        <div class="col-md-8"><input class="form-control" id="customer-search" placeholder="${t('searchCustomerMobile')}"></div>
        <div class="col-md-4">
          <select class="form-select" id="customers-page-size">
            <option value="10">10 / page</option>
            <option value="25">25 / page</option>
            <option value="50">50 / page</option>
            <option value="100">100 / page</option>
          </select>
        </div>
      </div>
      <div class="table-responsive">
        <table class="table align-middle">
          <thead><tr><th>${t('customer')}</th><th>${t('gstin')}</th><th>${t('address')}</th><th></th></tr></thead>
          <tbody id="customers-body"></tbody>
        </table>
      </div>
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mt-3">
        <span class="text-muted small" id="customers-page-info">0 / 0</span>
        <div class="btn-group">
          <button class="btn btn-outline-secondary" id="customers-prev" type="button"><i class="fa-solid fa-chevron-left"></i></button>
          <button class="btn btn-outline-secondary" id="customers-next" type="button"><i class="fa-solid fa-chevron-right"></i></button>
        </div>
      </div>
    </div>
  `;
  await renderCustomerTable();
  $('#customer-search').addEventListener('input', debounce(() => {
    customerPage = 1;
    renderCustomerTable();
  }));
  $('#customers-page-size').addEventListener('change', async () => {
    customerPageSize = Number($('#customers-page-size').value || 10);
    customerPage = 1;
    await renderCustomerTable();
  });
  $('#customers-prev').addEventListener('click', async () => {
    customerPage -= 1;
    await renderCustomerTable();
  });
  $('#customers-next').addEventListener('click', async () => {
    customerPage += 1;
    await renderCustomerTable();
  });
  $('#export-customers').addEventListener('click', exportCustomersCsv);
  $('#add-customer').addEventListener('click', () => openCustomerModal());
  $('#customers-body').addEventListener('click', async (event) => {
    const editId = event.target.closest('[data-edit-customer]')?.dataset.editCustomer;
    const deleteId = event.target.closest('[data-delete-customer]')?.dataset.deleteCustomer;
    if (editId) {
      const customer = (await db.getCustomers()).find(row => String(row.id) === String(editId));
      if (customer) openCustomerModal(customer.source === 'sale' ? { ...customer, id: '' } : customer);
    }
    if (deleteId && confirm(t('confirmDeleteCustomer'))) {
      await db.deleteCustomer(deleteId);
      toast(t('customerDeleted'), 'warning');
      await renderCustomerTable();
    }
  });
};
