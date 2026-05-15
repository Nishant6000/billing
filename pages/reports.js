import { db } from '../js/db.js';
import { $, calculateCart, dateOnly, downloadFile, escapeHtml, formatQuantity, money, toCSV } from '../js/utils.js';
import { toast } from '../js/ui.js';

let reportChart;

export const renderReports = async () => {
  $('#view').innerHTML = `
    <div class="pos-card mb-3">
      <div class="d-flex flex-wrap gap-2 justify-content-between align-items-center">
        <h2 class="section-title mb-0">Reports</h2>
        <div class="d-flex gap-2 flex-wrap">
          <select class="form-select" id="report-type">
            <option value="sales">Sales Summary</option>
            <option value="paid">Paid Bills</option>
            <option value="unpaid">Saved Unpaid Bills</option>
            <option value="deleted">Deleted Bills</option>
            <option value="modified">Modified Bills</option>
            <option value="returned">Returned Bills</option>
          </select>
          <input class="form-control" id="report-from" type="date" value="${dateOnly()}">
          <input class="form-control" id="report-to" type="date" value="${dateOnly()}">
          <button class="btn btn-outline-primary" id="run-report"><i class="fa-solid fa-rotate"></i></button>
          <button class="btn btn-outline-success" id="export-report"><i class="fa-solid fa-download"></i> Export CSV</button>
        </div>
      </div>
    </div>
    <div class="row g-3" id="sales-report-view">
      <div class="col-lg-3"><div class="metric-card"><p>Daily Sales</p><h3 id="r-sales">₹0.00</h3></div></div>
      <div class="col-lg-3"><div class="metric-card"><p>GST Report</p><h3 id="r-gst">₹0.00</h3></div></div>
      <div class="col-lg-3"><div class="metric-card"><p>Cash</p><h3 id="r-cash">₹0.00</h3></div></div>
      <div class="col-lg-3"><div class="metric-card"><p>UPI/Card</p><h3 id="r-digital">₹0.00</h3></div></div>
      <div class="col-xl-7"><div class="pos-card"><h2 class="section-title">Payment Report</h2><canvas id="report-chart" height="150"></canvas></div></div>
      <div class="col-xl-5"><div class="pos-card"><h2 class="section-title">Product Sales</h2><div class="table-responsive"><table class="table"><thead><tr><th>Product</th><th>Qty</th><th>Total</th></tr></thead><tbody id="product-report"></tbody></table></div></div></div>
    </div>
    <div class="pos-card d-none" id="activity-report-view">
      <h2 class="section-title" id="activity-title">Bill Activity</h2>
      <div class="table-responsive">
        <table class="table">
          <thead><tr><th>Invoice</th><th>Activity</th><th>Note</th><th>Bill Amount</th><th>Date</th></tr></thead>
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
    toast('Report exported');
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
      data: { labels: ['Cash', 'UPI/Card'], datasets: [{ data: [cash, digital], backgroundColor: ['#16a34a', '#2563eb'] }] },
      options: { plugins: { legend: { position: 'bottom' } } }
    });
  }
};

const runStatusReport = async (status) => {
  $('#sales-report-view').classList.add('d-none');
  $('#activity-report-view').classList.remove('d-none');
  $('#activity-title').textContent = status === 'paid' ? 'Paid Bills' : 'Returned Bills';
  const rows = await statusRows(status);
  $('#activity-report-body').innerHTML = rows.length ? rows.map(row => `
    <tr>
      <td><strong>${escapeHtml(row.invoice_no)}</strong></td>
      <td><span class="badge-soft">${escapeHtml(row.activity)}</span></td>
      <td>${escapeHtml(row.note || '-')}</td>
      <td class="fw-bold">${money(row.bill_amount)}</td>
      <td>${new Date(row.date).toLocaleString()}</td>
    </tr>
  `).join('') : '<tr><td colspan="5" class="text-center text-muted py-4">No bills found.</td></tr>';
};

const runActivityReport = async (type) => {
  $('#sales-report-view').classList.add('d-none');
  $('#activity-report-view').classList.remove('d-none');
  const titleMap = { deleted: 'Deleted Bills', modified: 'Modified Bills', returned: 'Returned Bills' };
  $('#activity-title').textContent = titleMap[type] || 'Bill Activity';
  const rows = await db.getBillActivity(type, { from: $('#report-from').value, to: $('#report-to').value });
  $('#activity-report-body').innerHTML = rows.length ? rows.map(row => `
    <tr>
      <td><strong>${escapeHtml(row.invoice_no)}</strong></td>
      <td><span class="badge-soft">${escapeHtml(row.event_type)}</span></td>
      <td>${escapeHtml(row.note || '-')}</td>
      <td class="fw-bold">${money(activityBillAmount(row))}</td>
      <td>${new Date(row.created_at).toLocaleString()}</td>
    </tr>
  `).join('') : '<tr><td colspan="5" class="text-center text-muted py-4">No bill activity found.</td></tr>';
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
  $('#activity-title').textContent = 'Saved Unpaid Bills';
  const rows = await unpaidRows();
  $('#activity-report-body').innerHTML = rows.length ? rows.map(row => `
    <tr>
      <td><strong>${escapeHtml(row.invoice_no)}</strong><div class="text-muted small">${escapeHtml(row.table || '-')}</div></td>
      <td><span class="badge-soft">${escapeHtml(row.activity)}</span></td>
      <td>${escapeHtml(row.note || '-')}</td>
      <td class="fw-bold">${money(row.bill_amount)}</td>
      <td>${new Date(row.date).toLocaleString()}</td>
    </tr>
  `).join('') : '<tr><td colspan="5" class="text-center text-muted py-4">No saved unpaid bills found.</td></tr>';
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

const numberText = (value) => value === undefined || value === null || value === '' ? '' : Number(value).toFixed(2);
