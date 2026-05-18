import { db } from '../js/db.js';
import { $, debounce, escapeHtml } from '../js/utils.js';
import { closeModal, showModal, toast } from '../js/ui.js';
import { displayStatus, displayTableArea, displayTableName, t } from '../js/i18n.js';

const tableForm = (table = {}) => `
  <div class="modal-header"><h5 class="modal-title">${table.id ? t('editTable') : t('addTable')}</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
  <form id="table-form">
    <div class="modal-body">
      <input type="hidden" name="id" value="${table.id || ''}">
      <div class="row g-3">
        <div class="col-md-6"><label class="form-label">${t('tableName')}</label><input class="form-control" name="table_name" value="${escapeHtml(table.table_name || '')}" placeholder="${t('table')} 1 / AC-1" required></div>
        <div class="col-md-6"><label class="form-label">${t('area')}</label><input class="form-control" name="area" value="${escapeHtml(table.area || '')}" placeholder="${t('groundFloor')} / ${t('family')} / ${t('outdoor')}"></div>
        <div class="col-md-6"><label class="form-label">${t('seats')}</label><input class="form-control" name="seats" type="number" min="1" value="${table.seats || 4}"></div>
        <div class="col-md-6"><label class="form-label">${t('status')}</label><select class="form-select" name="status"><option value="available">${t('available')}</option><option value="reserved" ${table.status === 'reserved' ? 'selected' : ''}>${t('reserved')}</option></select></div>
      </div>
    </div>
    <div class="modal-footer"><button class="btn btn-light" type="button" data-bs-dismiss="modal">${t('cancel')}</button><button class="btn btn-primary-gradient">${t('saveTable')}</button></div>
  </form>
`;

const renderRows = async (search = '') => {
  const tables = (await db.getDiningTables()).filter(table => `${table.table_name} ${table.area}`.toLowerCase().includes(search.toLowerCase()));
  $('#tables-body').innerHTML = tables.map(table => `
    <tr class="touch-row">
      <td><strong>${escapeHtml(displayTableName(table.table_name))}</strong><div class="text-muted small">${escapeHtml(table.area ? displayTableArea(table.area) : t('noArea'))}</div></td>
      <td>${table.seats || 4}</td>
      <td><span class="table-status ${escapeHtml(table.status || 'available')}">${escapeHtml(displayStatus(table.status || 'available'))}</span></td>
      <td class="text-end">
        <button class="btn btn-sm btn-outline-primary" data-edit="${table.id}"><i class="fa-solid fa-pen"></i></button>
        <button class="btn btn-sm btn-outline-danger" data-delete="${table.id}"><i class="fa-solid fa-trash"></i></button>
      </td>
    </tr>
  `).join('');
};

export const renderTables = async () => {
  $('#view').innerHTML = `
    <div class="pos-card">
      <div class="d-flex flex-wrap gap-2 justify-content-between align-items-center mb-3">
        <div><h2 class="section-title mb-1">${t('route.tables')}</h2><p class="text-muted mb-0">${t('tablesHelp')}</p></div>
        <button class="btn btn-primary-gradient" id="add-table"><i class="fa-solid fa-plus"></i> ${t('addTable')}</button>
      </div>
      <div class="row g-2 mb-3">
        <div class="col-md-8"><input class="form-control" id="table-search" placeholder="${t('searchTableArea')}"></div>
        <div class="col-md-4"><a class="btn btn-outline-primary w-100" href="#/billing"><i class="fa-solid fa-utensils"></i> ${t('openTableBilling')}</a></div>
      </div>
      <div class="table-responsive">
        <table class="table">
          <thead><tr><th>${t('table')}</th><th>${t('seats')}</th><th>${t('status')}</th><th></th></tr></thead>
          <tbody id="tables-body"></tbody>
        </table>
      </div>
    </div>
  `;
  await renderRows();
  $('#table-search').addEventListener('input', debounce(event => renderRows(event.target.value)));
  $('#add-table').addEventListener('click', () => openTableModal());
  $('#tables-body').addEventListener('click', async (event) => {
    const editId = event.target.closest('[data-edit]')?.dataset.edit;
    const deleteId = event.target.closest('[data-delete]')?.dataset.delete;
    if (editId) {
      const table = (await db.getDiningTables()).find(item => Number(item.id) === Number(editId));
      return openTableModal(table);
    }
    if (deleteId && confirm('Delete this table?')) {
      try {
        await db.deleteDiningTable(deleteId);
        toast(t('tableDeleted'), 'warning');
        await renderRows($('#table-search').value);
      } catch (error) {
        toast(error.message, 'warning');
      }
    }
  });
};

const openTableModal = (table = {}) => {
  showModal(tableForm(table));
  $('#table-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget).entries());
    await db.saveDiningTable({
      id: form.id ? Number(form.id) : undefined,
      table_name: form.table_name.trim(),
      area: form.area.trim(),
      seats: Number(form.seats || 4),
      status: form.status || 'available'
    });
    closeModal();
    toast(t('tableSaved'));
    await renderRows($('#table-search')?.value || '');
  });
};
