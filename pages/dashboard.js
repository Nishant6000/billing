import { db } from '../js/db.js';
import { $, money } from '../js/utils.js';
import { emptyState } from '../js/ui.js';

let salesChart;

export const renderDashboard = async () => {
  const stats = await db.dashboardStats();
  $('#view').innerHTML = `
    <div class="row g-3 mb-3">
      <div class="col-md-6 col-xl-3"><div class="metric-card"><div class="metric-icon"><i class="fa-solid fa-indian-rupee-sign"></i></div><p>Today Sales</p><h3>${money(stats.todaySales)}</h3></div></div>
      <div class="col-md-6 col-xl-3"><div class="metric-card"><div class="metric-icon" style="background:linear-gradient(135deg,#16a34a,#14b8a6)"><i class="fa-solid fa-calendar-day"></i></div><p>Today's Bills</p><h3>${stats.todayBills}</h3></div></div>
      <div class="col-md-6 col-xl-3"><div class="metric-card"><div class="metric-icon" style="background:linear-gradient(135deg,#7c3aed,#2563eb)"><i class="fa-solid fa-receipt"></i></div><p>Total Bills</p><h3>${stats.totalBills}</h3></div></div>
      <div class="col-md-6 col-xl-3"><div class="metric-card"><div class="metric-icon" style="background:linear-gradient(135deg,#f59e0b,#ef4444)"><i class="fa-solid fa-file-invoice-dollar"></i></div><p>GST Collected</p><h3>${money(stats.gstCollected)}</h3></div></div>
    </div>
    <div class="row g-3">
      <div class="col-xl-8">
        <div class="pos-card h-100">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h2 class="section-title mb-0">Sales Summary</h2>
            <button class="btn btn-sm btn-primary-gradient" data-action="new-bill"><i class="fa-solid fa-plus"></i> New Bill</button>
          </div>
          <canvas id="sales-chart" height="120"></canvas>
        </div>
      </div>
      <div class="col-xl-4">
        <div class="pos-card h-100">
          <h2 class="section-title">Quick Actions</h2>
          <div class="d-grid gap-2">
            <a class="btn btn-outline-primary text-start" href="#/billing"><i class="fa-solid fa-cart-shopping me-2"></i>Create New Bill</a>
            <a class="btn btn-outline-success text-start" href="#/products"><i class="fa-solid fa-box me-2"></i>Add Product</a>
            <a class="btn btn-outline-dark text-start" href="#/reports"><i class="fa-solid fa-chart-pie me-2"></i>Open Reports</a>
            <a class="btn btn-outline-secondary text-start" href="#/gst-export"><i class="fa-solid fa-file-export me-2"></i>GST Export</a>
          </div>
        </div>
      </div>
      <div class="col-12">
        <div class="pos-card">
          <h2 class="section-title">Recent Bills</h2>
          ${stats.recentBills.length ? `
            <div class="table-responsive">
              <table class="table">
                <thead><tr><th>Invoice</th><th>Date</th><th>Payment</th><th class="text-end">Total</th></tr></thead>
                <tbody>${stats.recentBills.map(bill => `<tr><td class="fw-bold">${bill.invoice_no}</td><td>${new Date(bill.created_at).toLocaleString()}</td><td><span class="badge-soft">${bill.payment_type}</span></td><td class="text-end fw-bold">${money(bill.grand_total)}</td></tr>`).join('')}</tbody>
              </table>
            </div>` : emptyState('fa-receipt', 'No bills yet', 'Create your first bill from the billing screen.')}
        </div>
      </div>
    </div>
  `;

  if (window.Chart) {
    salesChart?.destroy();
    const labels = [...Array(7)].map((_, index) => {
      const day = new Date();
      day.setDate(day.getDate() - (6 - index));
      return day.toLocaleDateString(undefined, { weekday: 'short' });
    });
    salesChart = new Chart($('#sales-chart'), {
      type: 'line',
      data: {
        labels,
        datasets: [{ label: 'Sales', data: labels.map((_, i) => i === 6 ? stats.todaySales : 0), borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,.12)', fill: true, tension: .42 }]
      },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
  }
};
