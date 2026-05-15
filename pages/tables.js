import { db } from '../js/db.js';
import { $, debounce, escapeHtml } from '../js/utils.js';
import { closeModal, showModal, toast } from '../js/ui.js';

const tableForm = (table = {}) => `
  <div class="modal-header"><h5 class="modal-title">${table.id ? 'Edit' : 'Add'} Table</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
  <form id="table-form">
    <div class="modal-body">
      <input type="hidden" name="id" value="${table.id || ''}">
      <div class="row g-3">
        <div class="col-md-6"><label class="form-label">Table Name</label><input class="form-control" name="table_name" value="${escapeHtml(table.table_name || '')}" placeholder="Table 1 / AC-1" required></div>
        <div class="col-md-6"><label class="form-label">Area</label><input class="form-control" name="area" value="${escapeHtml(table.area || '')}" placeholder="Ground Floor / Family / Outdoor"></div>
        <div class="col-md-6"><label class="form-label">Seats</label><input class="form-control" name="seats" type="number" min="1" value="${table.seats || 4}"></div>
        <div class="col-md-6"><label class="form-label">Status</label><select class="form-select" name="status"><option value="available">Available</option><option value="reserved" ${table.status === 'reserved' ? 'selected' : ''}>Reserved</option></select></div>
      </div>
    </div>
    <div class="modal-footer"><button class="btn btn-light" type="button" data-bs-dismiss="modal">Cancel</button><button class="btn btn-primary-gradient">Save Table</button></div>
  </form>
`;

const renderRows = async (search = '') => {
  const tables = (await db.getDiningTables()).filter(table => `${table.table_name} ${table.area}`.toLowerCase().includes(search.toLowerCase()));
  $('#tables-body').innerHTML = tables.map(table => `
    <tr class="touch-row">
      <td><strong>${escapeHtml(table.table_name)}</strong><div class="text-muted small">${escapeHtml(table.area || 'No area')}</div></td>
      <td>${table.seats || 4}</td>
      <td><span class="table-status ${escapeHtml(table.status || 'available')}">${escapeHtml(table.status || 'available')}</span></td>
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
        <div><h2 class="section-title mb-1">Tables</h2><p class="text-muted mb-0">Manage dining tables, seating areas, parcel counters, and reservation status.</p></div>
        <button class="btn btn-primary-gradient" id="add-table"><i class="fa-solid fa-plus"></i> Add Table</button>
      </div>
      <div class="row g-2 mb-3">
        <div class="col-md-8"><input class="form-control" id="table-search" placeholder="Search table or area"></div>
        <div class="col-md-4"><a class="btn btn-outline-primary w-100" href="#/billing"><i class="fa-solid fa-utensils"></i> Open Table Billing</a></div>
      </div>
      <div class="table-responsive">
        <table class="table">
          <thead><tr><th>Table</th><th>Seats</th><th>Status</th><th></th></tr></thead>
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
        toast('Table deleted', 'warning');
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
    toast('Table saved');
    await renderRows($('#table-search')?.value || '');
  });
};
