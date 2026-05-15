import { APP_CONFIG } from './config.js';
import { $, $$ } from './utils.js';
import { setTitle, toast } from './ui.js';
import { canAccessRoute, getCurrentUser, visibleRoutesForUser } from './auth.js';
import { renderDashboard } from '../pages/dashboard.js';
import { renderBilling } from '../pages/billing.js';
import { renderTables } from '../pages/tables.js';
import { renderProducts } from '../pages/products.js';
import { renderPurchaseEntry, renderPurchaseHistory } from '../pages/purchase.js';
import { renderSales } from '../pages/sales.js';
import { renderWhatsappMarketing } from '../pages/whatsapp-marketing.js';
import { renderReports } from '../pages/reports.js';
import { renderGstExport } from '../pages/gst-export.js';
import { renderSettings } from '../pages/settings.js';
import { renderPrinter } from '../pages/printer.js';
import { renderBackup } from '../pages/backup.js';
import { renderBarcode } from '../pages/barcode.js';
import { renderPlaceholder } from '../pages/placeholders.js';

const routes = {
  dashboard: renderDashboard,
  billing: renderBilling,
  tables: renderTables,
  products: renderProducts,
  purchase: renderPurchaseEntry,
  'purchase-history': renderPurchaseHistory,
  sales: renderSales,
  'whatsapp-marketing': renderWhatsappMarketing,
  reports: renderReports,
  'gst-export': renderGstExport,
  settings: renderSettings,
  printer: renderPrinter,
  barcode: renderBarcode,
  backup: renderBackup
};

export const renderNav = () => {
  const routes = visibleRoutesForUser(getCurrentUser());
  $('#nav-menu').innerHTML = routes.map(route => `
    <a class="nav-link-pos" href="#/${route.id}" data-route="${route.id}" title="${route.title}">
      <i class="fa-solid ${route.icon}"></i><span>${route.title}</span>
    </a>
  `).join('');
};

export const navigate = async (routeId = 'dashboard') => {
  const user = getCurrentUser();
  if (!user) {
    renderNav();
    setTitle('PIN Login');
    return;
  }
  const route = APP_CONFIG.routes.find(item => item.id === routeId) || APP_CONFIG.routes[0];
  if (!canAccessRoute(user, route.id)) {
    toast('This role does not have access to that page', 'warning');
    const firstAllowed = visibleRoutesForUser(user)[0] || APP_CONFIG.routes[0];
    if (location.hash !== `#/${firstAllowed.id}`) location.hash = `#/${firstAllowed.id}`;
    if (firstAllowed.id !== route.id) return await navigate(firstAllowed.id);
  }
  setTitle(route.title);
  $$('.nav-link-pos').forEach(link => link.classList.toggle('active', link.dataset.route === route.id));
  await (routes[route.id] || routes.dashboard)();
  $('#sidebar').classList.remove('open');
};

let routerBound = false;

export const initRouter = async () => {
  renderNav();
  if (!routerBound) {
    window.addEventListener('hashchange', () => navigate(location.hash.replace('#/', '') || 'dashboard'));
    routerBound = true;
  }
  await navigate(location.hash.replace('#/', '') || 'dashboard');
};
