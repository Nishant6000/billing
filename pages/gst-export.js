import { db } from '../js/db.js';
import { $, dateOnly, downloadFile, money, toCSV } from '../js/utils.js';
import { toast } from '../js/ui.js';

export const renderGstExport = async () => {
  $('#view').innerHTML = `
    <div class="pos-card">
      <div class="d-flex flex-wrap gap-2 justify-content-between align-items-center mb-3">
        <div><h2 class="section-title mb-1">GST Export</h2><p class="text-muted mb-0">Download CSV or Excel-compatible CA reports.</p></div>
        <div class="d-flex gap-2 flex-wrap">
          <input class="form-control" id="gst-from" type="date" value="${dateOnly()}">
          <input class="form-control" id="gst-to" type="date" value="${dateOnly()}">
          <button class="btn btn-outline-success" id="gst-csv"><i class="fa-solid fa-file-csv"></i> CSV</button>
          <button class="btn btn-outline-primary" id="gst-xls"><i class="fa-solid fa-file-excel"></i> XLSX Compatible</button>
        </div>
      </div>
      <div id="gst-summary"></div>
    </div>
  `;
  await renderSummary();
  $('#gst-from').addEventListener('input', renderSummary);
  $('#gst-to').addEventListener('input', renderSummary);
  $('#gst-csv').addEventListener('click', () => exportGst('csv'));
  $('#gst-xls').addEventListener('click', () => exportGst('xls'));
};

const gstRows = async () => {
  const sales = await db.getSales({ from: $('#gst-from').value, to: $('#gst-to').value });
  return sales.map(sale => ({
    invoice_no: sale.invoice_no,
    date: new Date(sale.created_at).toLocaleDateString(),
    taxable_value: Number(sale.subtotal).toFixed(2),
    gst_collected: Number(sale.gst_total).toFixed(2),
    invoice_total: Number(sale.grand_total).toFixed(2),
    payment_type: sale.payment_type
  }));
};

const renderSummary = async () => {
  const rows = await gstRows();
  const taxable = rows.reduce((sum, row) => sum + Number(row.taxable_value), 0);
  const gst = rows.reduce((sum, row) => sum + Number(row.gst_collected), 0);
  $('#gst-summary').innerHTML = `
    <div class="row g-3 mb-3">
      <div class="col-md-4"><div class="metric-card"><p>Taxable Value</p><h3>${money(taxable)}</h3></div></div>
      <div class="col-md-4"><div class="metric-card"><p>GST Summary</p><h3>${money(gst)}</h3></div></div>
      <div class="col-md-4"><div class="metric-card"><p>Invoices</p><h3>${rows.length}</h3></div></div>
    </div>
    <div class="table-responsive"><table class="table"><thead><tr><th>Invoice</th><th>Date</th><th>Taxable</th><th>GST</th><th>Total</th><th>Payment</th></tr></thead><tbody>${rows.map(row => `<tr><td>${row.invoice_no}</td><td>${row.date}</td><td>${row.taxable_value}</td><td>${row.gst_collected}</td><td>${row.invoice_total}</td><td>${row.payment_type}</td></tr>`).join('')}</tbody></table></div>
  `;
};

const exportGst = async (type) => {
  const rows = await gstRows();
  const csv = toCSV(rows);
  downloadFile(type === 'csv' ? 'gst-ca-report.csv' : 'gst-ca-report.xls', csv, type === 'csv' ? 'text/csv' : 'application/vnd.ms-excel');
  toast('GST report downloaded');
};
