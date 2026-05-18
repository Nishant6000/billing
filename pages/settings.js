import { db } from '../js/db.js';
import { APP_CONFIG } from '../js/config.js';
import { $, escapeHtml } from '../js/utils.js';
import { closeModal, showModal, toast } from '../js/ui.js';
import { languageOptions, setLanguage, t } from '../js/i18n.js';

const roleLabel = (role = '') => t(`role${role}`) || role;

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
    const form = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      await db.saveUser(form);
      closeModal();
      toast(t('userSaved'));
      await renderSettings();
    } catch (error) {
      toast(error.message, 'danger');
    }
  });
};

export const renderSettings = async () => {
  const settings = await db.getSettings();
  const users = await db.getUsers();
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
  `;
  $('#settings-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    for (const [key, value] of form.entries()) {
      if (value instanceof File) continue;
      await db.saveSetting(key, value);
      if (key === 'billing_mode') localStorage.setItem('pos-billing-mode', value);
      if (key === 'language') setLanguage(value);
    }
    await window.POS?.updateShopNameLabel?.();
    window.POS?.renderNav?.();
    toast(t('settingsSaved'));
    await renderSettings();
  });

  $('#add-user').addEventListener('click', () => showUserModal());
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
