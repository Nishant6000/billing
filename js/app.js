import { db } from './db.js';
import { $ } from './utils.js';
import { initRouter, navigate } from './router.js';
import { toast } from './ui.js';

const hideSplash = () => {
  const splash = $('#splash-screen');
  if (!splash) return;
  splash.classList.add('hide');
  setTimeout(() => splash.remove(), 600);
};

const updateDbStatus = (mode) => {
  const status = $('#db-status');
  const isFallback = mode === 'indexeddb';
  status.classList.toggle('warning', isFallback);
  status.innerHTML = isFallback
    ? '<i class="fa-solid fa-triangle-exclamation"></i> Browser fallback'
    : '<i class="fa-solid fa-database"></i> SQLite ready';
};

const updateShopNameLabel = async () => {
  const settings = await db.getSettings();
  $('#shop-name-label').textContent = settings.shop_name || 'Ginsoft POS Store';
};

const bindGlobalActions = () => {
  const shell = $('#app-shell');
  const collapseButton = $('#sidebar-collapse');
  const savedSidebarState = localStorage.getItem('pos-sidebar-collapsed') === 'true';
  shell.classList.toggle('sidebar-collapsed', savedSidebarState);
  collapseButton.setAttribute('aria-label', savedSidebarState ? 'Expand sidebar' : 'Collapse sidebar');
  collapseButton.setAttribute('title', savedSidebarState ? 'Expand sidebar' : 'Collapse sidebar');

  $('#sidebar-toggle').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  collapseButton.addEventListener('click', () => {
    const collapsed = shell.classList.toggle('sidebar-collapsed');
    localStorage.setItem('pos-sidebar-collapsed', String(collapsed));
    collapseButton.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
    collapseButton.setAttribute('title', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
  });
  $('#page-refresh').addEventListener('click', async () => {
    const button = $('#page-refresh');
    button.classList.add('refreshing');
    button.disabled = true;
    await updateShopNameLabel();
    await navigate(location.hash.replace('#/', '') || 'dashboard');
    setTimeout(() => {
      button.classList.remove('refreshing');
      button.disabled = false;
    }, 250);
  });
  document.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'new-bill') location.hash = '#/billing';
  });
  document.addEventListener('keydown', (event) => {
    if (event.altKey && event.key.toLowerCase() === 'n') {
      event.preventDefault();
      location.hash = '#/billing';
    }
    if (event.altKey && event.key.toLowerCase() === 'd') {
      event.preventDefault();
      location.hash = '#/dashboard';
    }
  });
};

window.POS = { db, navigate };

try {
  setTimeout(hideSplash, 3000);
  bindGlobalActions();
  const mode = await db.init();
  updateDbStatus(mode);
  await updateShopNameLabel();
  await initRouter();
  toast(mode === 'sqlite' ? 'SQLite database initialized' : 'Running with browser IndexedDB fallback', mode === 'sqlite' ? 'success' : 'warning');
} catch (error) {
  setTimeout(hideSplash, 3000);
  console.error(error);
  $('#view').innerHTML = `
    <div class="alert alert-danger m-4">
      <h4 class="alert-heading">Startup failed</h4>
      <p>${error.message}</p>
      <p class="mb-0">Run <code>npm install</code>, then serve the project over HTTP instead of opening the file directly.</p>
    </div>
  `;
}

window.POS.updateShopNameLabel = updateShopNameLabel;
