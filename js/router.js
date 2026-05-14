import { APP_CONFIG } from './config.js';
import { $, $$ } from './utils.js';
import { setTitle } from './ui.js';
import { renderDashboard } from '../pages/dashboard.js';
import { renderBilling } from '../pages/billing.js';
import { renderProducts } from '../pages/products.js';
import { renderPurchaseEntry, renderPurchaseHistory } from '../pages/purchase.js';
import { renderSales } from '../pages/sales.js';
import { renderReports } from '../pages/reports.js';
import { renderGstExport } from '../pages/gst-export.js';
import { renderSettings } from '../pages/settings.js';
import { renderPrinter } from '../pages/printer.js';
import { renderBackup } from '../pages/backup.js';
import { renderPlaceholder } from '../pages/placeholders.js';

const routes = {
  dashboard: renderDashboard,
  billing: renderBilling,
  products: renderProducts,
  purchase: renderPurchaseEntry,
  'purchase-history': renderPurchaseHistory,
  sales: renderSales,
  reports: renderReports,
  'gst-export': renderGstExport,
  settings: renderSettings,
  printer: renderPrinter,
  barcode: () => renderPlaceholder('Barcode', 'fa-barcode', ['Scan Barcode', 'Barcode Search', 'Barcode Settings']),
  backup: renderBackup
};

export const renderNav = () => {
  $('#nav-menu').innerHTML = APP_CONFIG.routes.map(route => `
    <a class="nav-link-pos" href="#/${route.id}" data-route="${route.id}" title="${route.title}">
      <i class="fa-solid ${route.icon}"></i><span>${route.title}</span>
    </a>
  `).join('');
};

export const navigate = async (routeId = 'dashboard') => {
  const route = APP_CONFIG.routes.find(item => item.id === routeId) || APP_CONFIG.routes[0];
  setTitle(route.title);
  $$('.nav-link-pos').forEach(link => link.classList.toggle('active', link.dataset.route === route.id));
  await (routes[route.id] || routes.dashboard)();
  $('#sidebar').classList.remove('open');
};

export const initRouter = async () => {
  renderNav();
  window.addEventListener('hashchange', () => navigate(location.hash.replace('#/', '') || 'dashboard'));
  await navigate(location.hash.replace('#/', '') || 'dashboard');
};
