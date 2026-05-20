import { db } from '../js/db.js';
import { $, escapeHtml, formatQuantity } from '../js/utils.js';
import { toast } from '../js/ui.js';
import { fetchCloudKots, updateCloudKotItemStatus, updateCloudKotStatus } from '../js/hotel-cloud.js';

let kitchenTimer = null;
let cloudTickets = [];

const statusColumns = ['pending', 'preparing', 'ready'];
let stationFilter = 'all';

const syncFromCloud = async () => {
  try {
    cloudTickets = await fetchCloudKots();
  } catch (_) {
    cloudTickets = [];
    // Cloud listing is optional; local KOTs remain the offline source.
  }
};

const kitchenCard = (kot) => `
  <article class="kitchen-ticket">
    <div class="d-flex justify-content-between gap-2 mb-2">
      <div><strong>${escapeHtml(kot.table_name || 'Order')}</strong><div class="text-muted small">${escapeHtml(kot.kot_no)} | ${kot.station === 'store' ? 'Store Room' : 'Kitchen'}</div></div>
      <span class="badge text-bg-${kot.status === 'ready' ? 'success' : kot.status === 'preparing' ? 'warning' : 'secondary'}">${escapeHtml(kot.status)}</span>
    </div>
    <div class="d-grid gap-2">
      ${(kot.items || []).map(item => `
        <div class="kitchen-item">
          <div><strong>${escapeHtml(item.product_name)}</strong><div class="text-muted small">${formatQuantity(item.quantity, item.sale_unit || 'Piece')} | ${escapeHtml(item.status || 'pending')}</div></div>
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-warning" ${item.id ? `data-item-status="${item.id}"` : 'data-cloud-item="true"'} data-kot-no="${escapeHtml(kot.kot_no)}" data-product-name="${escapeHtml(item.product_name)}" data-status="preparing">Prep</button>
            <button class="btn btn-outline-success" ${item.id ? `data-item-status="${item.id}"` : 'data-cloud-item="true"'} data-kot-no="${escapeHtml(kot.kot_no)}" data-product-name="${escapeHtml(item.product_name)}" data-status="ready">Ready</button>
          </div>
        </div>
      `).join('')}
    </div>
    <div class="d-flex gap-2 mt-3">
      <button class="btn btn-sm btn-outline-warning flex-fill" ${kot.id ? `data-kot-status="${kot.id}"` : 'data-cloud-kot="true"'} data-kot-no="${escapeHtml(kot.kot_no)}" data-status="preparing">Preparing</button>
      <button class="btn btn-sm btn-success flex-fill" ${kot.id ? `data-kot-status="${kot.id}"` : 'data-cloud-kot="true"'} data-kot-no="${escapeHtml(kot.kot_no)}" data-status="ready">Ready</button>
    </div>
  </article>
`;

const renderKitchenColumns = async () => {
  const localTickets = await db.getKotTickets();
  const byKotNo = new Map(cloudTickets.map(kot => [kot.kot_no, { ...kot, status: kot.cloud_status || kot.status }]));
  localTickets.forEach(kot => byKotNo.set(kot.kot_no, kot));
  const tickets = [...byKotNo.values()].filter(kot => stationFilter === 'all' || (kot.station || 'kitchen') === stationFilter);
  statusColumns.forEach(status => {
    const rows = tickets.filter(kot => (kot.status || 'pending') === status);
    $(`#kitchen-${status}`).innerHTML = rows.length
      ? rows.map(kitchenCard).join('')
      : `<div class="text-muted text-center py-4">No ${status} orders</div>`;
  });
};

export const renderKitchenDisplay = async () => {
  if (kitchenTimer) clearInterval(kitchenTimer);
  $('#view').innerHTML = `
    <section class="pos-card mb-3">
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2">
        <div><h2 class="section-title mb-1">Kitchen / Store Display</h2><p class="text-muted mb-0">Pending, preparing, and ready KOTs for this hotel.</p></div>
        <div class="d-flex flex-wrap gap-2">
          <select class="form-select" id="station-filter">
            <option value="all">All Stations</option>
            <option value="kitchen">Kitchen</option>
            <option value="store">Store Room</option>
          </select>
          <button class="btn btn-outline-primary" id="refresh-kitchen"><i class="fa-solid fa-rotate"></i> Refresh</button>
        </div>
      </div>
    </section>
    <div class="kitchen-board">
      ${statusColumns.map(status => `
        <section class="kitchen-column">
          <h3>${status[0].toUpperCase() + status.slice(1)}</h3>
          <div class="d-grid gap-3" id="kitchen-${status}"></div>
        </section>
      `).join('')}
    </div>
  `;
  await syncFromCloud();
  await renderKitchenColumns();
  $('#refresh-kitchen').addEventListener('click', async () => {
    await syncFromCloud();
    await renderKitchenColumns();
  });
  $('#station-filter').addEventListener('change', async (event) => {
    stationFilter = event.target.value;
    await renderKitchenColumns();
  });
  $('#view').addEventListener('click', async (event) => {
    const kotStatus = event.target.closest('[data-kot-status]');
    const cloudKotStatus = event.target.closest('[data-cloud-kot]');
    const itemStatus = event.target.closest('[data-item-status]');
    const cloudItemStatus = event.target.closest('[data-cloud-item]');
    const statusButton = kotStatus || cloudKotStatus;
    if (statusButton) {
      if (kotStatus) await db.updateKotStatus(kotStatus.dataset.kotStatus, kotStatus.dataset.status);
      try { await updateCloudKotStatus(statusButton.dataset.kotNo, statusButton.dataset.status); } catch (_) {}
      if (statusButton.dataset.status === 'ready') toast('Order ready');
      return renderKitchenColumns();
    }
    const itemButton = itemStatus || cloudItemStatus;
    if (itemButton) {
      if (itemStatus) await db.updateKotItemStatus(itemStatus.dataset.itemStatus, itemStatus.dataset.status);
      try { await updateCloudKotItemStatus(itemButton.dataset.kotNo, itemButton.dataset.productName, itemButton.dataset.status); } catch (_) {}
      return renderKitchenColumns();
    }
  });
  kitchenTimer = setInterval(renderKitchenColumns, 30000);
};
