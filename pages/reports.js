import { db } from '../js/db.js';
import { $, calculateCart, dateOnly, downloadFile, escapeHtml, formatQuantity, money, toCSV } from '../js/utils.js';
import { toast } from '../js/ui.js';
import { t } from '../js/i18n.js';

let reportChart;

export const renderReports = async () => {
  $('#view').innerHTML = `
    <div class="pos-card mb-3">
      <div class="d-flex flex-wrap gap-2 justify-content-between align-items-center">
        <h2 class="section-title mb-0">${t('route.reports')}</h2>
        <div class="d-flex gap-2 flex-wrap">
          <select class="form-select" id="report-type">
            <option value="sales">${t('salesSummary')}</option>
            <option value="paid">${t('paidBills')}</option>
            <option value="unpaid">${t('savedUnpaidBills')}</option>
            <option value="deleted">${t('deletedBills')}</option>
            <option value="modified">${t('modifiedBills')}</option>
            <option value="returned">${t('returnedBills')}</option>
          </select>
          <input class="form-control" id="report-from" type="date" value="${dateOnly()}">
          <input class="form-control" id="report-to" type="date" value="${dateOnly()}">
          <button class="btn btn-outline-primary" id="run-report"><i class="fa-solid fa-rotate"></i></button>
          <button class="btn btn-outline-success" id="export-report"><i class="fa-solid fa-download"></i> ${t('exportCsv')}</button>
        </div>
      </div>
    </div>
    <div class="row g-3" id="sales-report-view">
      <div class="col-lg-3"><div class="metric-card"><p>${t('dailySales')}</p><h3 id="r-sales">₹0.00</h3></div></div>
      <div class="col-lg-3"><div class="metric-card"><p>${t('gstReport')}</p><h3 id="r-gst">₹0.00</h3></div></div>
      <div class="col-lg-3"><div class="metric-card"><p>${t('cash')}</p><h3 id="r-cash">₹0.00</h3></div></div>
      <div class="col-lg-3"><div class="metric-card"><p>${t('upiCard')}</p><h3 id="r-digital">₹0.00</h3></div></div>
      <div class="col-xl-7"><div class="pos-card"><h2 class="section-title">${t('paymentReport')}</h2><canvas id="report-chart" height="150"></canvas></div></div>
      <div class="col-xl-5"><div class="pos-card"><h2 class="section-title">${t('productSales')}</h2><div class="table-responsive"><table class="table"><thead><tr><th>${t('product')}</th><th>${t('qty')}</th><th>${t('total')}</th></tr></thead><tbody id="product-report"></tbody></table></div></div></div>
    </div>
    <div class="pos-card d-none" id="activity-report-view">
      <h2 class="section-title" id="activity-title">${t('billActivity')}</h2>
      <div class="table-responsive">
        <table class="table">
          <thead><tr><th>${t('invoice')}</th><th>${t('activity')}</th><th>${t('user')}</th><th>${t('note')}</th><th>${t('billAmount')}</th><th>${t('date')}</th></tr></thead>
          <tbody id="activity-report-body"></tbody>
        </table>
      </div>
    </div>
  `;
  await runReport();
  ['report-type', 'report-from', 'report-to'].forEach(id => $(`#${id}`).addEventListener('input', runReport));
  $('#run-report').addEventListener('click', runReport);
  $('#export-report').addEventListener('click', async () => {
    const type = $('#report-type').value;
    const rows = await exportRowsForType(type);
    downloadFile(`${type}-report.csv`, toCSV(rows));
    toast(t('reportExported'));
  });
};

const runReport = async () => {
  const type = $('#report-type').value;
  if (['paid', 'returned'].includes(type)) return await runStatusReport(type);
  if (type === 'unpaid') return await runUnpaidReport();
  if (type !== 'sales') return await runActivityReport(type);
  $('#sales-report-view').classList.remove('d-none');
  $('#activity-report-view').classList.add('d-none');
  const sales = (await db.getSales({ from: $('#report-from').value, to: $('#report-to').value }))
    .filter(sale => (sale.status || 'paid') === 'paid');
  const total = sales.reduce((sum, row) => sum + Number(row.grand_total), 0);
  const gst = sales.reduce((sum, row) => sum + Number(row.gst_total), 0);
  const cash = sales.filter(row => row.payment_type === 'Cash').reduce((sum, row) => sum + Number(row.grand_total), 0);
  const digital = total - cash;
  $('#r-sales').textContent = money(total);
  $('#r-gst').textContent = money(gst);
  $('#r-cash').textContent = money(cash);
  $('#r-digital').textContent = money(digital);

  const itemMap = new Map();
  for (const sale of sales) {
    const items = await db.getSaleItems(sale.id);
    items.forEach(item => {
      const key = `${item.product_name}|${item.sale_unit || 'Piece'}`;
      const current = itemMap.get(key) || { name: item.product_name, unit: item.sale_unit || 'Piece', qty: 0, total: 0 };
      current.qty += Number(item.quantity);
      current.total += Number(item.line_total);
      itemMap.set(key, current);
    });
  }
  $('#product-report').innerHTML = [...itemMap.values()].map(row => `<tr><td>${escapeHtml(row.name)}</td><td>${formatQuantity(row.qty, row.unit)}</td><td>${money(row.total)}</td></tr>`).join('');

  if (window.Chart) {
    reportChart?.destroy();
    reportChart = new Chart($('#report-chart'), {
      type: 'doughnut',
      data: { labels: [t('cash'), t('upiCard')], datasets: [{ data: [cash, digital], backgroundColor: ['#16a34a', '#2563eb'] }] },
      options: { plugins: { legend: { position: 'bottom' } } }
    });
  }
};

const runStatusReport = async (status) => {
  $('#sales-report-view').classList.add('d-none');
  $('#activity-report-view').classList.remove('d-none');
  $('#activity-title').textContent = status === 'paid' ? t('paidBills') : t('returnedBills');
  const rows = await statusRows(status);
  $('#activity-report-body').innerHTML = rows.length ? rows.map(row => `
    <tr>
      <td><strong>${escapeHtml(row.invoice_no)}</strong></td>
      <td><span class="badge-soft">${escapeHtml(row.activity)}</span></td>
      <td>${userCell(row)}</td>
      <td>${escapeHtml(row.note || '-')}</td>
      <td class="fw-bold">${money(row.bill_amount)}</td>
      <td>${new Date(row.date).toLocaleString()}</td>
    </tr>
  `).join('') : `<tr><td colspan="6" class="text-center text-muted py-4">${t('noBillsFound')}</td></tr>`;
};

const runActivityReport = async (type) => {
  $('#sales-report-view').classList.add('d-none');
  $('#activity-report-view').classList.remove('d-none');
  const titleMap = { deleted: t('deletedBills'), modified: t('modifiedBills'), returned: t('returnedBills') };
  $('#activity-title').textContent = titleMap[type] || t('billActivity');
  const rows = await db.getBillActivity(type, { from: $('#report-from').value, to: $('#report-to').value });
  $('#activity-report-body').innerHTML = rows.length ? rows.map(row => `
    <tr>
      <td><strong>${escapeHtml(row.invoice_no)}</strong></td>
      <td><span class="badge-soft">${escapeHtml(row.event_type)}</span></td>
      <td>${userCell(activityUser(row))}</td>
      <td>${escapeHtml(row.note || '-')}</td>
      <td class="fw-bold">${money(activityBillAmount(row))}</td>
      <td>${new Date(row.created_at).toLocaleString()}</td>
    </tr>
  `).join('') : `<tr><td colspan="6" class="text-center text-muted py-4">${t('noBillActivityFound')}</td></tr>`;
};

const exportRowsForType = async (type) => {
  if (type === 'sales') return await db.getSales({ from: $('#report-from').value, to: $('#report-to').value });
  if (['paid', 'returned'].includes(type)) return await statusRows(type);
  if (type === 'unpaid') return await unpaidRows();
  return formatBillActivityForExport(await db.getBillActivity(type, { from: $('#report-from').value, to: $('#report-to').value }));
};

const runUnpaidReport = async () => {
  $('#sales-report-view').classList.add('d-none');
  $('#activity-report-view').classList.remove('d-none');
  $('#activity-title').textContent = t('savedUnpaidBills');
  const rows = await unpaidRows();
  $('#activity-report-body').innerHTML = rows.length ? rows.map(row => `
    <tr>
      <td><strong>${escapeHtml(row.invoice_no)}</strong><div class="text-muted small">${escapeHtml(row.table || '-')}</div></td>
      <td><span class="badge-soft">${escapeHtml(row.activity)}</span></td>
      <td>${userCell(row)}</td>
      <td>${escapeHtml(row.note || '-')}</td>
      <td class="fw-bold">${money(row.bill_amount)}</td>
      <td>${new Date(row.date).toLocaleString()}</td>
    </tr>
  `).join('') : `<tr><td colspan="6" class="text-center text-muted py-4">${t('noSavedUnpaidBillsFound')}</td></tr>`;
};

const unpaidRows = async () => {
  const from = $('#report-from').value;
  const to = $('#report-to').value;
  const tables = await db.getDiningTables();
  const tableMap = new Map(tables.map(table => [Number(table.id), table]));
  const orders = await db.getOpenTableOrders();
  const rows = [];
  for (const order of orders) {
    const day = dateOnly(order.updated_at || order.created_at);
    if ((from && day < from) || (to && day > to)) continue;
    const items = await db.getTableOrderItems(order.id);
    const totals = calculateCart(items, 0);
    const table = tableMap.get(Number(order.table_id));
    rows.push({
      invoice_no: order.order_no,
      activity: 'saved unpaid',
      note: order.order_type === 'table' ? 'Table order saved, payment pending' : `${order.order_type} order saved, payment pending`,
      bill_amount: totals.grandTotal,
      date: order.updated_at || order.created_at,
      user_name: order.order_user_name || '',
      user_id: order.order_user_id || '',
      user_role: order.order_user_role || '',
      table: table ? `${table.table_name} (${table.area || 'Dining'})` : order.order_type,
      item_count: items.length,
      products: items.map(item => `${item.product_name} x ${formatQuantity(item.quantity, item.sale_unit || item.base_unit || 'Piece')}`).join(' | ')
    });
  }
  return rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
};

const statusRows = async (status) => {
  const sales = await db.getSales({ from: $('#report-from').value, to: $('#report-to').value });
  return sales
    .filter(sale => (sale.status || 'paid') === status)
    .map(sale => ({
      invoice_no: sale.invoice_no,
      activity: status,
      note: status === 'paid' ? 'Current paid bill' : 'Current returned bill',
      bill_amount: Number(sale.grand_total || 0),
      date: sale.created_at,
      user_name: sale.cashier_name || '',
      user_id: sale.cashier_user_id || '',
      user_role: sale.cashier_role || '',
      payment_type: sale.payment_type,
      gst: Number(sale.gst_total || 0),
      discount: Number(sale.discount || 0)
    }));
};

const formatBillActivityForExport = (rows) => rows.map(row => {
  const previous = parseAuditSnapshot(row.previous_data);
  const next = parseAuditSnapshot(row.new_data);
  const sale = previous.sale || {};
  const nextSale = next.sale || {};
  const items = previous.items || [];
  return {
    invoice_no: row.invoice_no,
    activity: row.event_type,
    user_name: row.activity_user_name || sale.cashier_name || nextSale.cashier_name || '',
    user_id: row.activity_user_id || sale.cashier_user_id || nextSale.cashier_user_id || '',
    user_role: row.activity_user_role || sale.cashier_role || nextSale.cashier_role || '',
    note: row.note || '',
    activity_date: new Date(row.created_at).toLocaleString(),
    bill_date: sale.created_at ? new Date(sale.created_at).toLocaleString() : '',
    payment_before: sale.payment_type || '',
    payment_after: nextSale.payment_type || '',
    status_before: sale.status || '',
    status_after: nextSale.status || '',
    subtotal_before: numberText(sale.subtotal),
    discount_before: numberText(sale.discount),
    gst_before: numberText(sale.gst_total),
    total_before: numberText(sale.grand_total),
    subtotal_after: numberText(nextSale.subtotal),
    discount_after: numberText(nextSale.discount),
    gst_after: numberText(nextSale.gst_total),
    total_after: numberText(nextSale.grand_total),
    product_count: items.length,
    products: items.map(item => `${item.product_name} x ${formatQuantity(item.quantity, item.sale_unit || 'Piece')} @ ${numberText(item.price)} = ${numberText(item.line_total)}`).join(' | ')
  };
});

const parseAuditSnapshot = (value) => {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch (_) {
    return {};
  }
};

const activityBillAmount = (row) => {
  const nextSale = parseAuditSnapshot(row.new_data).sale;
  const previousSale = parseAuditSnapshot(row.previous_data).sale;
  return Number(nextSale?.grand_total ?? previousSale?.grand_total ?? 0);
};

const activityUser = (row) => {
  const nextSale = parseAuditSnapshot(row.new_data).sale || {};
  const previousSale = parseAuditSnapshot(row.previous_data).sale || {};
  return {
    user_name: row.activity_user_name || previousSale.cashier_name || nextSale.cashier_name || '',
    user_id: row.activity_user_id || previousSale.cashier_user_id || nextSale.cashier_user_id || '',
    user_role: row.activity_user_role || previousSale.cashier_role || nextSale.cashier_role || ''
  };
};

const userCell = (row = {}) => {
  const name = row.user_name || row.cashier_name || row.activity_user_name || '';
  const id = row.user_id || row.cashier_user_id || row.activity_user_id || '';
  const role = row.user_role || row.cashier_role || row.activity_user_role || '';
  if (!name && !id) return '<span class="text-muted">-</span>';
  return `<strong>${escapeHtml(name || id)}</strong><div class="text-muted small">${escapeHtml([id, role].filter(Boolean).join(' | '))}</div>`;
};

const numberText = (value) => value === undefined || value === null || value === '' ? '' : Number(value).toFixed(2);
