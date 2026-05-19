import { db } from '../js/db.js';
import { $, money } from '../js/utils.js';
import { emptyState } from '../js/ui.js';
import { t } from '../js/i18n.js';

let salesChart;

export const renderDashboard = async () => {
  const stats = await db.dashboardStats();
  $('#view').innerHTML = `
    <div class="row g-3 mb-3">
      <div class="col-md-6 col-xl-3"><div class="metric-card"><div class="metric-icon"><i class="fa-solid fa-indian-rupee-sign"></i></div><p>${t('todaySales')}</p><h3>${money(stats.todaySales)}</h3></div></div>
      <div class="col-md-6 col-xl-3"><div class="metric-card"><div class="metric-icon" style="background:linear-gradient(135deg,#16a34a,#14b8a6)"><i class="fa-solid fa-calendar-day"></i></div><p>${t('todaysBills')}</p><h3>${stats.todayBills}</h3></div></div>
      <div class="col-md-6 col-xl-3"><div class="metric-card"><div class="metric-icon" style="background:linear-gradient(135deg,#7c3aed,#2563eb)"><i class="fa-solid fa-receipt"></i></div><p>${t('totalBills')}</p><h3>${stats.totalBills}</h3></div></div>
      <div class="col-md-6 col-xl-3"><div class="metric-card"><div class="metric-icon" style="background:linear-gradient(135deg,#f59e0b,#ef4444)"><i class="fa-solid fa-file-invoice-dollar"></i></div><p>${t('gstCollected')}</p><h3>${money(stats.gstCollected)}</h3></div></div>
    </div>
    <div class="row g-3">
      <div class="col-xl-8">
        <div class="pos-card h-100">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h2 class="section-title mb-0">${t('salesSummary')}</h2>
            <button class="btn btn-sm btn-primary-gradient" data-action="new-bill"><i class="fa-solid fa-plus"></i> ${t('newBill')}</button>
          </div>
          <canvas id="sales-chart" height="120"></canvas>
        </div>
      </div>
      <div class="col-xl-4">
        <div class="pos-card h-100">
          <h2 class="section-title">${t('quickActions')}</h2>
          <div class="d-grid gap-2">
            <a class="btn btn-outline-primary text-start" href="#/billing"><i class="fa-solid fa-cart-shopping me-2"></i>${t('createNewBill')}</a>
            <a class="btn btn-outline-success text-start" href="#/products"><i class="fa-solid fa-box me-2"></i>${t('addProduct')}</a>
            <a class="btn btn-outline-dark text-start" href="#/reports"><i class="fa-solid fa-chart-pie me-2"></i>${t('openReports')}</a>
            <a class="btn btn-outline-secondary text-start" href="#/gst-export"><i class="fa-solid fa-file-export me-2"></i>${t('route.gst-export')}</a>
          </div>
        </div>
      </div>
      <div class="col-12">
        <div class="pos-card">
          <h2 class="section-title">${t('recentBills')}</h2>
          ${stats.recentBills.length ? `
            <div class="table-responsive">
              <table class="table">
                <thead><tr><th>${t('invoice')}</th><th>${t('date')}</th><th>${t('payment')}</th><th class="text-end">${t('total')}</th></tr></thead>
                <tbody>${stats.recentBills.map(bill => `<tr><td class="fw-bold">${bill.invoice_no}</td><td>${new Date(bill.created_at).toLocaleString()}</td><td><span class="badge-soft">${bill.payment_type}</span></td><td class="text-end fw-bold">${money(bill.grand_total)}</td></tr>`).join('')}</tbody>
              </table>
            </div>` : emptyState('fa-receipt', t('noBillsYet'), t('noBillsText'))}
        </div>
      </div>
    </div>
  `;

  if (window.Chart) {
    salesChart?.destroy();
    const labels = (stats.weeklySales || []).map(day => day.label);
    salesChart = new Chart($('#sales-chart'), {
      type: 'line',
      data: {
        labels,
        datasets: [{ label: 'Sales', data: (stats.weeklySales || []).map(day => day.total), borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,.12)', fill: true, tension: .42 }]
      },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
  }
};
