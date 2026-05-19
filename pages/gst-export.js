import { db } from '../js/db.js';
import { $, dateOnly, downloadFile, money, toCSV, toXLSX } from '../js/utils.js';
import { toast } from '../js/ui.js';
import { t } from '../js/i18n.js';

export const renderGstExport = async () => {
  $('#view').innerHTML = `
    <div class="pos-card">
      <div class="d-flex flex-wrap gap-2 justify-content-between align-items-center mb-3">
        <div><h2 class="section-title mb-1">${t('route.gst-export')}</h2><p class="text-muted mb-0">${t('gstExportHelp')}</p></div>
        <div class="d-flex gap-2 flex-wrap">
          <input class="form-control" id="gst-from" type="date" value="${dateOnly()}">
          <input class="form-control" id="gst-to" type="date" value="${dateOnly()}">
          <button class="btn btn-outline-success" id="gst-csv"><i class="fa-solid fa-file-csv"></i> CSV</button>
          <button class="btn btn-outline-primary" id="gst-xls"><i class="fa-solid fa-file-excel"></i> ${t('xlsxCompatible')}</button>
        </div>
      </div>
      <div id="gst-summary"></div>
    </div>
  `;
  await renderSummary();
  $('#gst-from').addEventListener('input', renderSummary);
  $('#gst-to').addEventListener('input', renderSummary);
  $('#gst-csv').addEventListener('click', () => exportGst('csv'));
  $('#gst-xls').addEventListener('click', () => exportGst('xlsx'));
};

const gstRows = async () => {
  const sales = (await db.getSales({ from: $('#gst-from').value, to: $('#gst-to').value }))
    .filter(sale => (sale.status || 'paid') === 'paid')
    .map(sale => ({
      type: t('sale'),
      invoice_no: sale.invoice_no,
      party: t('customer'),
      gstin: '',
      date: new Date(sale.created_at).toLocaleDateString(),
      taxable_value: Number(sale.subtotal).toFixed(2),
      output_gst: Number(sale.gst_total).toFixed(2),
      input_gst: '0.00',
      invoice_total: Number(sale.grand_total).toFixed(2),
      payment_type: sale.payment_type
    }));
  const purchases = (await db.getPurchases({ from: $('#gst-from').value, to: $('#gst-to').value }))
    .map(purchase => ({
      type: t('purchase'),
      invoice_no: purchase.purchase_no,
      party: purchase.supplier_name,
      gstin: purchase.supplier_gstin || '',
      date: new Date(purchase.bill_date).toLocaleDateString(),
      taxable_value: Number(purchase.subtotal).toFixed(2),
      output_gst: '0.00',
      input_gst: Number(purchase.gst_total).toFixed(2),
      invoice_total: Number(purchase.grand_total).toFixed(2),
      payment_type: ''
    }));
  return [...sales, ...purchases].sort((a, b) => new Date(a.date) - new Date(b.date));
};

const renderSummary = async () => {
  const rows = await gstRows();
  const taxable = rows.reduce((sum, row) => sum + Number(row.taxable_value), 0);
  const outputGst = rows.reduce((sum, row) => sum + Number(row.output_gst), 0);
  const inputGst = rows.reduce((sum, row) => sum + Number(row.input_gst), 0);
  const netGst = outputGst - inputGst;
  $('#gst-summary').innerHTML = `
    <div class="row g-3 mb-3">
      <div class="col-md-3"><div class="metric-card"><p>${t('taxableValue')}</p><h3>${money(taxable)}</h3></div></div>
      <div class="col-md-3"><div class="metric-card"><p>${t('outputGst')}</p><h3>${money(outputGst)}</h3></div></div>
      <div class="col-md-3"><div class="metric-card"><p>${t('inputGst')}</p><h3>${money(inputGst)}</h3></div></div>
      <div class="col-md-3"><div class="metric-card"><p>${t('netGst')}</p><h3>${money(netGst)}</h3></div></div>
    </div>
    <div class="table-responsive"><table class="table"><thead><tr><th>${t('type')}</th><th>${t('invoice')}</th><th>${t('party')}</th><th>${t('date')}</th><th>${t('taxable')}</th><th>${t('outputGst')}</th><th>${t('inputGst')}</th><th>${t('total')}</th></tr></thead><tbody>${rows.map(row => `<tr><td>${row.type}</td><td>${row.invoice_no}</td><td>${row.party}<div class="text-muted small">${row.gstin}</div></td><td>${row.date}</td><td>${row.taxable_value}</td><td>${row.output_gst}</td><td>${row.input_gst}</td><td>${row.invoice_total}</td></tr>`).join('')}</tbody></table></div>
  `;
};

const exportGst = async (type) => {
  const rows = await gstRows();
  if (type === 'xlsx') {
    downloadFile('gst-ca-report.xlsx', toXLSX(rows, 'GST CA Report'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  } else {
    downloadFile('gst-ca-report.csv', toCSV(rows), 'text/csv');
  }
  toast(t('gstReportDownloaded'));
};
