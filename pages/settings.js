import { db } from '../js/db.js';
import { APP_CONFIG } from '../js/config.js';
import { $, escapeHtml } from '../js/utils.js';
import { closeModal, showModal, toast } from '../js/ui.js';

const roleOptions = (selected = 'Cashier') => APP_CONFIG.roles.map(role =>
  `<option value="${role}" ${role === selected ? 'selected' : ''}>${role}</option>`
).join('');

const userRows = (users = []) => users.map(user => `
  <tr>
    <td>
      <div class="fw-bold">${escapeHtml(user.full_name)}</div>
      <small class="text-muted">User ID: ${escapeHtml(user.user_id || '')}</small>
    </td>
    <td><span class="badge text-bg-primary">${escapeHtml(user.role)}</span></td>
    <td><span class="badge ${user.status === 'inactive' ? 'text-bg-secondary' : 'text-bg-success'}">${escapeHtml(user.status || 'active')}</span></td>
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
        <h5 class="modal-title">${user ? 'Edit User' : 'Add User'}</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
      </div>
      <div class="modal-body">
        <input type="hidden" name="id" value="${escapeHtml(user?.id || '')}">
        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label">Full name</label>
            <input class="form-control" name="full_name" value="${escapeHtml(user?.full_name || '')}" required>
          </div>
          <div class="col-md-6">
            <label class="form-label">User ID</label>
            <input class="form-control" name="user_id" value="${escapeHtml(user?.user_id || '')}" pattern="[A-Za-z0-9_-]{3,32}" required>
            <div class="form-text">Use 3-32 letters, numbers, underscore, or hyphen. Example: owner, cashier1.</div>
          </div>
          <div class="col-md-3">
            <label class="form-label">Role</label>
            <select class="form-select" name="role">${roleOptions(user?.role || 'Cashier')}</select>
          </div>
          <div class="col-md-3">
            <label class="form-label">Status</label>
            <select class="form-select" name="status">
              <option value="active" ${user?.status !== 'inactive' ? 'selected' : ''}>Active</option>
              <option value="inactive" ${user?.status === 'inactive' ? 'selected' : ''}>Inactive</option>
            </select>
          </div>
          <div class="col-md-6">
            <label class="form-label">${user ? 'New PIN (optional)' : 'PIN'}</label>
            <input class="form-control" name="pin" type="password" inputmode="numeric" pattern="[0-9]{4,8}" maxlength="8" ${user ? '' : 'required'}>
            <div class="form-text">Use 4 to 8 digits. Leave blank while editing to keep the existing PIN.</div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline-secondary" type="button" data-bs-dismiss="modal">Cancel</button>
        <button class="btn btn-primary-gradient" type="submit"><i class="fa-solid fa-floppy-disk"></i> Save User</button>
      </div>
    </form>
  `);
  $('#user-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      await db.saveUser(form);
      closeModal();
      toast('User saved');
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
      <h2 class="section-title">Shop Details</h2>
      <div class="row g-3">
        <div class="col-md-6"><label class="form-label">Shop name</label><input class="form-control" name="shop_name" value="${escapeHtml(settings.shop_name || '')}"></div>
        <div class="col-md-6"><label class="form-label">Phone</label><input class="form-control" name="phone" value="${escapeHtml(settings.phone || '')}"></div>
        <div class="col-12"><label class="form-label">Address</label><textarea class="form-control" name="shop_address">${escapeHtml(settings.shop_address || '')}</textarea></div>
        <div class="col-md-4"><label class="form-label">GSTIN</label><input class="form-control" name="gstin" value="${escapeHtml(settings.gstin || '')}"></div>
        <div class="col-md-4"><label class="form-label">Bill Prefix</label><input class="form-control" name="bill_prefix" value="${escapeHtml(settings.bill_prefix || 'INV')}"></div>
        <div class="col-md-4"><label class="form-label">Logo Upload</label><input class="form-control" name="logo" type="file" accept="image/*"></div>
        <div class="col-md-4"><label class="form-label">GST Settings</label><select class="form-select" name="gst_enabled"><option value="true">Enabled</option><option value="false" ${settings.gst_enabled === 'false' ? 'selected' : ''}>Disabled</option></select></div>
        <div class="col-md-4"><label class="form-label">Printer Paper</label><select class="form-select" name="paper_size"><option>80mm</option><option ${settings.paper_size === '58mm' ? 'selected' : ''}>58mm</option></select></div>
        <div class="col-md-4"><label class="form-label">App Theme</label><select class="form-select" name="theme"><option>Professional Light</option><option>Dark POS</option></select></div>
        <div class="col-md-4"><label class="form-label">Printer Theme</label><select class="form-select" name="printer_theme"><option value="thermal" ${settings.printer_theme !== 'desktop' ? 'selected' : ''}>Thermal Printer Theme</option><option value="desktop" ${settings.printer_theme === 'desktop' ? 'selected' : ''}>Desktop Printer Theme</option></select></div>
        <div class="col-md-4"><label class="form-label">Billing Mode</label><select class="form-select" name="billing_mode"><option value="direct">Direct Billing</option><option value="table" ${settings.billing_mode === 'table' ? 'selected' : ''}>Table Based Billing</option></select></div>
        <div class="col-md-4"><label class="form-label">Weight Billing</label><select class="form-select" name="weight_enabled"><option value="false">Disabled</option><option value="true" ${settings.weight_enabled === 'true' ? 'selected' : ''}>Enabled</option></select></div>
        <div class="col-12"><label class="form-label">Footer text</label><input class="form-control" name="footer_text" value="${escapeHtml(settings.footer_text || '')}"></div>
      </div>
      <hr>
      <h2 class="section-title">Bill Settings</h2>
      <div class="form-check form-switch"><input class="form-check-input" type="checkbox" checked id="printAfterSale"><label class="form-check-label" for="printAfterSale">Show receipt after payment</label></div>
      <button class="btn btn-primary-gradient mt-4"><i class="fa-solid fa-floppy-disk"></i> Save Settings</button>
    </form>
    <section class="pos-card mt-4" id="users-role-section">
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-3">
        <div>
          <h2 class="section-title mb-1">Users & Roles</h2>
          <p class="text-muted mb-0">Manage local PIN users and restrict sidebar access by role.</p>
        </div>
        <button class="btn btn-primary-gradient" id="add-user" type="button"><i class="fa-solid fa-user-plus"></i> Add User</button>
      </div>
      <div class="table-responsive">
        <table class="table align-middle">
          <thead><tr><th>User</th><th>Role</th><th>Status</th><th>Updated</th><th class="text-end">Actions</th></tr></thead>
          <tbody id="users-table">
            ${users.length ? userRows(users) : '<tr><td colspan="5" class="text-center text-muted py-4">No users found.</td></tr>'}
          </tbody>
        </table>
      </div>
      <div class="role-help-grid">
        <span><strong>Owner</strong> all access</span>
        <span><strong>Manager</strong> daily operations</span>
        <span><strong>Cashier</strong> billing and sales</span>
        <span><strong>Inventory</strong> stock and purchases</span>
        <span><strong>Accountant</strong> sales, GST and reports</span>
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
    }
    await window.POS?.updateShopNameLabel?.();
    window.POS?.renderNav?.();
    toast('Settings saved');
  });

  $('#add-user').addEventListener('click', () => showUserModal());
  $('#users-role-section').addEventListener('click', async (event) => {
    const editId = event.target.closest('[data-edit-user]')?.dataset.editUser;
    const deleteId = event.target.closest('[data-delete-user]')?.dataset.deleteUser;
    if (editId) {
      const user = (await db.getUsers()).find(item => Number(item.id) === Number(editId));
      if (user) showUserModal(user);
    }
    if (deleteId && confirm('Delete this user?')) {
      try {
        await db.deleteUser(deleteId);
        toast('User deleted');
        await renderSettings();
      } catch (error) {
        toast(error.message, 'danger');
      }
    }
  });
};
