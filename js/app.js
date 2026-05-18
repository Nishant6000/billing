import { db } from './db.js';
import { $, escapeHtml } from './utils.js';
import { clearCurrentUser, getCurrentUser, setCurrentUser } from './auth.js';
import { initRouter, navigate, renderNav } from './router.js';
import { setTitle, toast } from './ui.js';
import { setLanguage, t } from './i18n.js';

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
  localStorage.setItem('pos-billing-mode', settings.billing_mode || 'direct');
  setLanguage(settings.language || localStorage.getItem('pos-language') || 'en');
  updateStaticLabels();
};

const updateStaticLabels = () => {
  const refreshLabel = $('#page-refresh span');
  const logoutLabel = $('#logout-user span');
  const newBillButton = $('[data-action="new-bill"]');
  if (refreshLabel) refreshLabel.textContent = t('refresh');
  if (logoutLabel) logoutLabel.textContent = t('logout');
  if (newBillButton) newBillButton.innerHTML = `<i class="fa-solid fa-plus"></i> ${t('newBill')}`;
  $('#page-refresh')?.setAttribute('title', t('refresh'));
  $('#logout-user')?.setAttribute('title', t('logout'));
};

const updateUserLabel = () => {
  const user = getCurrentUser();
  const shell = $('#app-shell');
  const label = $('#user-session-label');
  const logoutButton = $('#logout-user');
  const newBillButton = $('[data-action="new-bill"]');
  shell.classList.toggle('auth-locked', !user);
  label.innerHTML = user
    ? `<i class="fa-solid fa-user-shield"></i> ${escapeHtml(user.full_name)} · ${escapeHtml(user.role)}`
    : `<i class="fa-solid fa-lock"></i> ${t('locked')}`;
  logoutButton.classList.toggle('d-none', !user);
  newBillButton.classList.toggle('d-none', !user);
};

const ensureActiveSession = async () => {
  const sessionUser = getCurrentUser();
  if (!sessionUser) return null;
  const users = await db.getUsers();
  const freshUser = users.find(user => Number(user.id) === Number(sessionUser.id) && user.status !== 'inactive');
  if (!freshUser) {
    clearCurrentUser();
    return null;
  }
  setCurrentUser(freshUser);
  return freshUser;
};

const renderLogin = async () => {
  clearCurrentUser();
  renderNav();
  updateUserLabel();
  const users = await db.getUsers();
  const activeUsers = users.filter(user => user.status !== 'inactive');
  const userOptions = activeUsers.map(user => `
    <option value="${escapeHtml(user.user_id)}">${escapeHtml(user.full_name)} (${escapeHtml(user.user_id)})</option>
  `).join('');
  setTitle(t('pinLogin'));
  $('#view').innerHTML = `
    <div class="login-shell">
      <form class="login-card" id="pin-login-form">
        <div class="login-mark"><i class="fa-solid fa-cash-register"></i></div>
        <p class="eyebrow mb-1">Ginsoft POS</p>
        <h2>${t('enterPin')}</h2>
        <p class="text-muted mb-3">${t('defaultLoginHelp')}</p>
        <label class="form-label">${t('userId')}</label>
        <select class="form-select form-select-lg mb-3" name="user_id" required>
          ${userOptions || '<option value="owner">Owner (owner)</option>'}
        </select>
        <label class="form-label">${t('userPin')}</label>
        <input class="form-control form-control-lg text-center pin-input" name="pin" type="password" inputmode="numeric" pattern="[0-9]{4,8}" maxlength="8" autocomplete="current-password" required autofocus>
        <button class="btn btn-primary-gradient w-100 mt-3" type="submit"><i class="fa-solid fa-unlock-keyhole"></i> ${t('login')}</button>
      </form>
    </div>
  `;
  $('#pin-login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button');
    button.disabled = true;
    try {
      const form = new FormData(event.currentTarget);
      const user = await db.authenticateUser(form.get('user_id'), form.get('pin'));
      if (!user) {
        toast('Invalid or inactive PIN', 'danger');
        return;
      }
      setCurrentUser(user);
      updateUserLabel();
      await initRouter();
      toast(`Welcome ${user.full_name}`);
    } finally {
      button.disabled = false;
    }
  });
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
    if (getCurrentUser()) await navigate(location.hash.replace('#/', '') || 'dashboard');
    else await renderLogin();
    setTimeout(() => {
      button.classList.remove('refreshing');
      button.disabled = false;
    }, 250);
  });
  $('#logout-user').addEventListener('click', () => {
    renderLogin();
    toast('Logged out', 'warning');
  });
  document.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'new-bill' && getCurrentUser()) location.hash = '#/billing';
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
  const user = await ensureActiveSession();
  updateUserLabel();
  if (user) await initRouter();
  else await renderLogin();
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
window.POS.updateUserLabel = updateUserLabel;
window.POS.renderNav = renderNav;
