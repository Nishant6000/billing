import { db } from '../js/db.js';
import { APP_CONFIG } from '../js/config.js';
import { $, escapeHtml } from '../js/utils.js';
import { closeModal, showModal, toast } from '../js/ui.js';
import { languageOptions, setLanguage, t } from '../js/i18n.js';
import { runWebSync, startWebSyncFromSettings, webSyncStatus } from '../js/sync.js';

const roleLabel = (role = '') => {
  const label = t(`role${role}`);
  return label === `role${role}` ? role : label;
};

const statusLabel = (status = '') => {
  const normalized = String(status || 'active').toLowerCase();
  if (normalized === 'inactive') return t('inactive');
  return t('active');
};

const roleOptions = (selected = 'Cashier') => APP_CONFIG.roles.map(role =>
  `<option value="${role}" ${role === selected ? 'selected' : ''}>${roleLabel(role)}</option>`
).join('');

const languageSelectOptions = (selected = 'en') => languageOptions.map(language =>
  `<option value="${language.code}" ${language.code === selected ? 'selected' : ''}>${language.name}</option>`
).join('');

const hotelUserRoleOptions = (selected = 'Waiter') => ['Waiter', 'Kitchen', 'Manager'].map(role =>
  `<option value="${role}" ${role === selected ? 'selected' : ''}>${role}</option>`
).join('');

const formFromEvent = (event, selector) => {
  const form = event.currentTarget?.tagName === 'FORM'
    ? event.currentTarget
    : event.target?.closest?.('form') || $(selector);
  if (!form || form.tagName !== 'FORM') throw new Error('Unable to read form data');
  return form;
};

const saveCloudHotelUser = async (form = {}) => {
  const settings = await db.getSettings();
  const hotelId = String(settings.hotel_id || '').trim();
  const url = String(settings.hotel_users_url || 'https://ginsoft.co/api/hotel-users.php').trim();
  if (!hotelId) throw new Error('Hotel ID is missing');
  if (!url) throw new Error('Hotel Users API URL is missing');
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'save',
      hotel_id: hotelId,
      user_id: form.user_id,
      full_name: form.full_name,
      role: form.role,
      password: form.password || form.pin || '',
      status: form.status === 'inactive' ? 0 : 1
    })
  });
  const payload = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
  if (!response.ok || payload.ok === false) throw new Error(payload.error || 'Unable to sync cloud user');
  return payload;
};

const userRows = (users = []) => users.map(user => `
  <tr>
    <td>
      <div class="fw-bold">${escapeHtml(user.full_name)}</div>
      <small class="text-muted">${t('userId')}: ${escapeHtml(user.user_id || '')}</small>
    </td>
    <td><span class="badge text-bg-primary">${escapeHtml(roleLabel(user.role))}</span></td>
    <td><span class="badge ${user.status === 'inactive' ? 'text-bg-secondary' : 'text-bg-success'}">${escapeHtml(statusLabel(user.status))}</span></td>
    <td>${escapeHtml((user.updated_at || user.created_at || '').slice(0, 10))}</td>
    <td class="text-end">
      <button class="btn btn-sm btn-outline-primary" data-edit-user="${user.id}" type="button"><i class="fa-solid fa-pen"></i></button>
      <button class="btn btn-sm btn-outline-danger" data-delete-user="${user.id}" type="button"><i class="fa-solid fa-trash"></i></button>
    </td>
  </tr>
`).join('');

const showUserModal = (user = null) => {
  showModal(`
    <form id="user-form">
      <div class="modal-header">
        <h5 class="modal-title">${user ? t('editUser') : t('addUser')}</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${t('close')}"></button>
      </div>
      <div class="modal-body">
        <input type="hidden" name="id" value="${escapeHtml(user?.id || '')}">
        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label">${t('fullName')}</label>
            <input class="form-control" name="full_name" value="${escapeHtml(user?.full_name || '')}" required>
          </div>
          <div class="col-md-6">
            <label class="form-label">${t('userId')}</label>
            <input class="form-control" name="user_id" value="${escapeHtml(user?.user_id || '')}" pattern="[A-Za-z0-9_-]{3,32}" required>
            <div class="form-text">${t('userIdHelp')}</div>
          </div>
          <div class="col-md-3">
            <label class="form-label">${t('role')}</label>
            <select class="form-select" name="role">${roleOptions(user?.role || 'Cashier')}</select>
          </div>
          <div class="col-md-3">
            <label class="form-label">${t('status')}</label>
            <select class="form-select" name="status">
              <option value="active" ${user?.status !== 'inactive' ? 'selected' : ''}>${t('active')}</option>
              <option value="inactive" ${user?.status === 'inactive' ? 'selected' : ''}>${t('inactive')}</option>
            </select>
          </div>
          <div class="col-md-6">
            <label class="form-label">${user ? t('newPinOptional') : t('userPin')}</label>
            <input class="form-control" name="pin" type="password" inputmode="numeric" pattern="[0-9]{4,8}" maxlength="8" ${user ? '' : 'required'}>
            <div class="form-text">${t('pinHelp')}</div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline-secondary" type="button" data-bs-dismiss="modal">${t('cancel')}</button>
        <button class="btn btn-primary-gradient" type="submit"><i class="fa-solid fa-floppy-disk"></i> ${t('saveUser')}</button>
      </div>
    </form>
  `);
  $('#user-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(formFromEvent(event, '#user-form')).entries());
    try {
      await db.saveUser(form);
      if (['Waiter', 'Kitchen'].includes(form.role)) {
        try {
          await saveCloudHotelUser(form);
          toast('User saved and synced to cloud');
        } catch (syncError) {
          toast(`User saved locally. Cloud sync failed: ${syncError.message}`, 'warning');
        }
      } else {
        toast(t('userSaved'));
      }
      closeModal();
      await renderSettings();
    } catch (error) {
      toast(error.message, 'danger');
    }
  });
};

export const renderSettings = async () => {
  const settings = await db.getSettings();
  const users = await db.getUsers();
  const syncStatus = webSyncStatus();
  $('#view').innerHTML = `
    <form class="pos-card" id="settings-form">
      <h2 class="section-title">${t('shopDetails')}</h2>
      <div class="row g-3">
        <div class="col-md-6"><label class="form-label">${t('shopName')}</label><input class="form-control" name="shop_name" value="${escapeHtml(settings.shop_name || '')}"></div>
        <div class="col-md-6"><label class="form-label">${t('phone')}</label><input class="form-control" name="phone" value="${escapeHtml(settings.phone || '')}"></div>
        <div class="col-12"><label class="form-label">${t('address')}</label><textarea class="form-control" name="shop_address">${escapeHtml(settings.shop_address || '')}</textarea></div>
        <div class="col-md-4"><label class="form-label">${t('gstin')}</label><input class="form-control" name="gstin" value="${escapeHtml(settings.gstin || '')}"></div>
        <div class="col-md-4"><label class="form-label">${t('billPrefix')}</label><input class="form-control" name="bill_prefix" value="${escapeHtml(settings.bill_prefix || 'INV')}"></div>
        <div class="col-md-4"><label class="form-label">${t('logoUpload')}</label><input class="form-control" name="logo" type="file" accept="image/*"></div>
        <div class="col-md-4"><label class="form-label">${t('language')}</label><select class="form-select" name="language">${languageSelectOptions(settings.language || localStorage.getItem('pos-language') || 'en')}</select></div>
        <div class="col-md-4"><label class="form-label">${t('gstSettings')}</label><select class="form-select" name="gst_enabled"><option value="true">${t('enabled')}</option><option value="false" ${settings.gst_enabled === 'false' ? 'selected' : ''}>${t('disabled')}</option></select></div>
        <div class="col-md-4"><label class="form-label">${t('printerPaper')}</label><select class="form-select" name="paper_size"><option>80mm</option><option ${settings.paper_size === '58mm' ? 'selected' : ''}>58mm</option></select></div>
        <div class="col-md-4"><label class="form-label">${t('appTheme')}</label><select class="form-select" name="theme"><option value="Professional Light" ${settings.theme !== 'Dark POS' ? 'selected' : ''}>${t('professionalLight')}</option><option value="Dark POS" ${settings.theme === 'Dark POS' ? 'selected' : ''}>${t('darkPos')}</option></select></div>
        <div class="col-md-4"><label class="form-label">${t('printerTheme')}</label><select class="form-select" name="printer_theme"><option value="thermal" ${settings.printer_theme !== 'desktop' ? 'selected' : ''}>${t('thermalPrinterTheme')}</option><option value="desktop" ${settings.printer_theme === 'desktop' ? 'selected' : ''}>${t('desktopPrinterTheme')}</option></select></div>
        <div class="col-md-4"><label class="form-label">${t('billingMode')}</label><select class="form-select" name="billing_mode"><option value="direct">${t('directBilling')}</option><option value="table" ${settings.billing_mode === 'table' ? 'selected' : ''}>${t('tableBilling')}</option></select></div>
        <div class="col-md-4"><label class="form-label">${t('weightBilling')}</label><select class="form-select" name="weight_enabled"><option value="false">${t('disabled')}</option><option value="true" ${settings.weight_enabled === 'true' ? 'selected' : ''}>${t('enabled')}</option></select></div>
        <div class="col-12"><label class="form-label">${t('footerText')}</label><input class="form-control" name="footer_text" value="${escapeHtml(settings.footer_text || '')}"></div>
      </div>
      <hr>
      <h2 class="section-title">${t('billSettings')}</h2>
      <div class="form-check form-switch"><input class="form-check-input" type="checkbox" checked id="printAfterSale"><label class="form-check-label" for="printAfterSale">${t('showReceiptAfterPayment')}</label></div>
      <hr>
      <h2 class="section-title">Web Sync</h2>
      <div class="row g-3">
        <div class="col-md-3">
          <label class="form-label">Web Sync</label>
          <select class="form-select" name="web_sync_enabled">
            <option value="false">${t('disabled')}</option>
            <option value="true" ${settings.web_sync_enabled === 'true' ? 'selected' : ''}>${t('enabled')}</option>
          </select>
        </div>
        <div class="col-md-3">
          <label class="form-label">Hotel ID</label>
          <input class="form-control" name="hotel_id" value="${escapeHtml(settings.hotel_id || 'GIN-HOTEL-0001')}" placeholder="GIN-HOTEL-0001">
        </div>
        <div class="col-md-3">
          <label class="form-label">Sync Interval (minutes)</label>
          <input class="form-control" name="web_sync_interval_minutes" type="number" min="1" step="1" value="${escapeHtml(settings.web_sync_interval_minutes || '15')}">
        </div>
        <div class="col-md-3">
          <label class="form-label">Sync API URL</label>
          <input class="form-control" name="web_sync_url" type="url" value="${escapeHtml(settings.web_sync_url || 'https://ginsoft.co/api/pos-sync.php')}">
        </div>
        <div class="col-md-6">
          <label class="form-label">Hotel Order Sync URL</label>
          <input class="form-control" name="hotel_order_sync_url" type="url" value="${escapeHtml(settings.hotel_order_sync_url || 'https://ginsoft.co/api/hotel-orders.php')}">
        </div>
        <div class="col-md-6">
          <label class="form-label">Hotel Login URL</label>
          <input class="form-control" name="hotel_login_url" type="url" value="${escapeHtml(settings.hotel_login_url || 'https://ginsoft.co/api/hotel-login.php')}">
        </div>
        <div class="col-md-6">
          <label class="form-label">Hotel Users API URL</label>
          <input class="form-control" name="hotel_users_url" type="url" value="${escapeHtml(settings.hotel_users_url || 'https://ginsoft.co/api/hotel-users.php')}">
        </div>
        <div class="col-12 d-flex flex-wrap justify-content-between align-items-center gap-2">
          <div class="text-muted small">
            Last sync: ${escapeHtml(syncStatus.lastSyncAt ? new Date(syncStatus.lastSyncAt).toLocaleString() : 'Never')} | Status: ${escapeHtml(syncStatus.lastStatus)}
          </div>
          <button class="btn btn-outline-primary" id="web-sync-now" type="button"><i class="fa-solid fa-cloud-arrow-up"></i> Sync Now</button>
        </div>
      </div>
      <hr>
      <h2 class="section-title">License Settings</h2>
      <div class="row g-3">
        <div class="col-md-4">
          <label class="form-label">Show License API URL</label>
          <select class="form-select" name="license_api_url_visible">
            <option value="false">${t('disabled')}</option>
            <option value="true" ${settings.license_api_url_visible === 'true' ? 'selected' : ''}>${t('enabled')}</option>
          </select>
        </div>
        <div class="col-md-8">
          <label class="form-label">Default License API URL</label>
          <input class="form-control" name="license_check_url" type="url" value="${escapeHtml(settings.license_check_url || 'https://ginsoft.co/api/license-check.php')}">
          <div class="form-text">Keep this hidden in License tab for normal users. Enable only for service or setup work.</div>
        </div>
      </div>
      <button class="btn btn-primary-gradient mt-4"><i class="fa-solid fa-floppy-disk"></i> ${t('saveSettings')}</button>
    </form>
    <section class="pos-card mt-4" id="users-role-section">
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-3">
        <div>
          <h2 class="section-title mb-1">${t('usersRoles')}</h2>
          <p class="text-muted mb-0">${t('usersRolesHelp')}</p>
        </div>
        <button class="btn btn-primary-gradient" id="add-user" type="button"><i class="fa-solid fa-user-plus"></i> ${t('addUser')}</button>
      </div>
      <div class="table-responsive">
        <table class="table align-middle">
          <thead><tr><th>${t('user')}</th><th>${t('role')}</th><th>${t('status')}</th><th>${t('updated')}</th><th class="text-end">${t('actions')}</th></tr></thead>
          <tbody id="users-table">
            ${users.length ? userRows(users) : `<tr><td colspan="5" class="text-center text-muted py-4">${t('noUsersFound')}</td></tr>`}
          </tbody>
        </table>
      </div>
      <div class="role-help-grid">
        <span><strong>${t('roleOwner')}</strong> ${t('ownerRoleHelp')}</span>
        <span><strong>${t('roleManager')}</strong> ${t('managerRoleHelp')}</span>
        <span><strong>${t('roleCashier')}</strong> ${t('cashierRoleHelp')}</span>
        <span><strong>${t('roleInventory')}</strong> ${t('inventoryRoleHelp')}</span>
        <span><strong>${t('roleAccountant')}</strong> ${t('accountantRoleHelp')}</span>
      </div>
    </section>
    <section class="pos-card mt-4">
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <div>
          <h2 class="section-title mb-1">Cloud Hotel Users</h2>
          <p class="text-muted mb-0">Create waiter and kitchen logins for other devices.</p>
        </div>
        <button class="btn btn-outline-primary" id="refresh-cloud-users" type="button"><i class="fa-solid fa-rotate"></i> Refresh</button>
      </div>
      <form class="row g-3 align-items-end mb-3" id="cloud-user-form">
        <div class="col-md-3"><label class="form-label">User ID</label><input class="form-control" name="user_id" placeholder="waiter1" required></div>
        <div class="col-md-3"><label class="form-label">Full Name</label><input class="form-control" name="full_name" required></div>
        <div class="col-md-2"><label class="form-label">Role</label><select class="form-select" name="role">${hotelUserRoleOptions()}</select></div>
        <div class="col-md-2"><label class="form-label">Password/PIN</label><input class="form-control" name="password" type="password" required></div>
        <div class="col-md-2"><button class="btn btn-primary-gradient w-100" type="submit"><i class="fa-solid fa-cloud-arrow-up"></i> Save</button></div>
      </form>
      <div class="table-responsive"><table class="table align-middle"><thead><tr><th>User</th><th>Role</th><th>Status</th><th>Updated</th></tr></thead><tbody id="cloud-users-body"><tr><td colspan="4" class="text-muted text-center py-3">Click refresh to load users</td></tr></tbody></table></div>
    </section>
  `;
  $('#settings-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(formFromEvent(event, '#settings-form'));
    for (const [key, value] of form.entries()) {
      if (value instanceof File) continue;
      await db.saveSetting(key, value);
      if (key === 'billing_mode') localStorage.setItem('pos-billing-mode', value);
      if (key === 'language') setLanguage(value);
    }
    await window.POS?.updateShopNameLabel?.();
    window.POS?.renderNav?.();
    await startWebSyncFromSettings();
    toast(t('settingsSaved'));
    await renderSettings();
  });

  $('#web-sync-now').addEventListener('click', async () => {
    const button = $('#web-sync-now');
    button.disabled = true;
    await runWebSync();
    button.disabled = false;
    await renderSettings();
  });

  $('#add-user').addEventListener('click', () => showUserModal());
  const loadCloudUsers = async () => {
    const currentSettings = await db.getSettings();
    const response = await fetch(currentSettings.hotel_users_url || 'https://ginsoft.co/api/hotel-users.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list', hotel_id: currentSettings.hotel_id })
    });
    const payload = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    if (!response.ok || payload.ok === false) throw new Error(payload.error || 'Unable to load cloud users');
    $('#cloud-users-body').innerHTML = (payload.users || []).length ? payload.users.map(user => `
      <tr><td><strong>${escapeHtml(user.full_name)}</strong><div class="text-muted small">${escapeHtml(user.user_id)}</div></td><td>${escapeHtml(user.role)}</td><td>${Number(user.status) === 1 ? 'Active' : 'Inactive'}</td><td>${escapeHtml(user.updated_at || user.created_at || '')}</td></tr>
    `).join('') : '<tr><td colspan="4" class="text-muted text-center py-3">No cloud users</td></tr>';
  };
  $('#refresh-cloud-users').addEventListener('click', async () => {
    try { await loadCloudUsers(); } catch (error) { toast(error.message, 'danger'); }
  });
  $('#cloud-user-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const formElement = formFromEvent(event, '#cloud-user-form');
    const button = formElement.querySelector('button');
    button.disabled = true;
    try {
      const form = Object.fromEntries(new FormData(formElement).entries());
      await saveCloudHotelUser({ ...form, status: 'active' });
      formElement.reset();
      toast('Cloud user saved');
      await loadCloudUsers();
    } catch (error) {
      toast(error.message, 'danger');
    } finally {
      button.disabled = false;
    }
  });
  $('#users-role-section').addEventListener('click', async (event) => {
    const editId = event.target.closest('[data-edit-user]')?.dataset.editUser;
    const deleteId = event.target.closest('[data-delete-user]')?.dataset.deleteUser;
    if (editId) {
      const user = (await db.getUsers()).find(item => Number(item.id) === Number(editId));
      if (user) showUserModal(user);
    }
    if (deleteId && confirm(t('confirmDeleteUser'))) {
      try {
        await db.deleteUser(deleteId);
        toast(t('userDeleted'));
        await renderSettings();
      } catch (error) {
        toast(error.message, 'danger');
      }
    }
  });
};
