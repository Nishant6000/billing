import { db } from '../js/db.js';
import { $, escapeHtml } from '../js/utils.js';
import { setLicenseStatus } from '../js/auth.js';
import { toast } from '../js/ui.js';

const licenseBadge = (status = 'valid') => {
  const normalized = String(status || 'valid').toLowerCase();
  const classes = {
    valid: 'text-bg-success',
    unlicensed: 'text-bg-secondary',
    expired: 'text-bg-danger',
    inactive: 'text-bg-warning',
    invalid: 'text-bg-danger'
  };
  return `<span class="badge ${classes[normalized] || 'text-bg-secondary'}">${escapeHtml(normalized.toUpperCase())}</span>`;
};

const saveLicenseSettings = async (values = {}) => {
  for (const [key, value] of Object.entries(values)) {
    await db.saveSetting(key, value ?? '');
  }
};

const licenseUnlockUrl = (settings = {}) => {
  const savedUrl = String(settings.license_unlock_check_url || '').trim();
  if (savedUrl) return savedUrl;
  return String(settings.license_check_url || 'https://ginsoft.co/api/license-check.php')
    .replace(/license-check\.php(\?.*)?$/, 'license-unlock-check.php$1');
};

const normalizeStatus = (payload, responseOk) => {
  if (!responseOk) return 'invalid';
  if (payload.valid === true) return 'valid';
  const reason = String(payload.reason || payload.error || 'invalid').toLowerCase();
  if (reason.includes('expired')) return 'expired';
  if (reason.includes('inactive')) return 'inactive';
  return 'invalid';
};

const isExpiredDate = (value = '') => {
  if (!value) return false;
  const expiry = new Date(`${String(value).slice(0, 10)}T23:59:59`);
  return Number.isFinite(expiry.getTime()) && expiry.getTime() < Date.now();
};

export const validateLocalLicenseState = async () => {
  const settings = await db.getSettings();
  const currentStatus = String(settings.license_status || 'unlicensed').toLowerCase();
  const validTill = String(settings.license_validity_till || '').trim();

  let status = currentStatus;
  let reason = settings.license_reason || '';

  if (!settings.license_code || currentStatus === 'unlicensed') {
    status = 'unlicensed';
    reason = 'License activation required';
  } else if (currentStatus === 'valid' && !validTill) {
    status = 'invalid';
    reason = 'License validity date missing';
  } else if (currentStatus === 'valid' && isExpiredDate(validTill)) {
    status = 'expired';
    reason = `License expired on ${validTill}`;
  } else if (!['valid', 'expired', 'inactive', 'invalid'].includes(currentStatus)) {
    status = 'unlicensed';
    reason = 'License activation required';
  }

  if (status !== currentStatus || reason !== settings.license_reason) {
    await saveLicenseSettings({ license_status: status, license_reason: reason });
  }

  setLicenseStatus(status);
  window.POS?.renderNav?.();
  return { status, reason, validTill };
};

export const checkLicense = async ({ silent = false } = {}) => {
  const settings = await db.getSettings();
  const hotelId = String(settings.hotel_id || '').trim();
  const licenseCode = String(settings.license_code || '').trim();
  const url = String(settings.license_check_url || 'https://ginsoft.co/api/license-check.php').trim();

  if (!hotelId || !licenseCode || !url) {
    if (!silent) toast('Enter Hotel ID, License Code, and License API URL', 'warning');
    return { skipped: true, reason: 'missing_license_details' };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hotel_id: hotelId, license_code: licenseCode })
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch (_) {
    payload = { error: `HTTP ${response.status}` };
  }

  const status = normalizeStatus(payload, response.ok);
  const license = payload.license || {};
  const validTill = license.validity_till || payload.validity_till || '';
  const finalStatus = status === 'valid' && !validTill ? 'invalid' : status === 'valid' && isExpiredDate(validTill) ? 'expired' : status;
  const approvalValue = license.licence_approval ?? payload.licence_approval ?? '';
  const hotelLocked = settings.license_hotel_locked === 'true' || finalStatus === 'valid' || String(approvalValue) === '0';
  const reason = finalStatus === 'invalid' && status === 'valid'
    ? 'License validity date missing from server'
    : payload.reason || payload.error || finalStatus;
  const checkedAt = new Date().toISOString();

  await saveLicenseSettings({
    license_status: finalStatus,
    license_customer_id: license.customer_id || payload.customer_id || '',
    license_validity_till: validTill,
    license_reason: reason,
    license_last_checked_at: checkedAt,
    licence_approval: approvalValue,
    license_hotel_locked: hotelLocked ? 'true' : 'false'
  });
  setLicenseStatus(finalStatus);
  window.POS?.renderNav?.();

  if (finalStatus === 'valid') {
    if (!silent) toast('License verified successfully', 'success');
  } else {
    toast(`License ${finalStatus}: access is restricted`, 'danger');
  }
  return { status: finalStatus, payload };
};

export const renderLicense = async () => {
  await validateLocalLicenseState();
  const settings = await db.getSettings();
  const status = settings.license_status || 'unlicensed';
  const showApiUrl = settings.license_api_url_visible === 'true';
  const hotelLocked = settings.license_hotel_locked === 'true';
  $('#view').innerHTML = `
    <section class="pos-card">
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
        <div>
          <h2 class="section-title mb-1">License Check</h2>
          <p class="text-muted mb-0">Connect this POS installation to a Ginsoft license on your VPS.</p>
        </div>
        <div class="fs-5">${licenseBadge(status)}</div>
      </div>

      <form id="license-form" class="row g-3">
        <div class="${showApiUrl ? 'col-md-4' : 'col-md-6'}">
          <label class="form-label">Hotel ID</label>
          <input class="form-control" name="hotel_id" value="${escapeHtml(settings.hotel_id || '')}" placeholder="GIN-HOTEL-0001" required ${hotelLocked ? 'readonly' : ''}>
          ${hotelLocked ? '<div class="form-text">Hotel ID is locked after license activation.</div>' : ''}
        </div>
        <div class="${showApiUrl ? 'col-md-4' : 'col-md-6'}">
          <label class="form-label">License Code</label>
          <input class="form-control" name="license_code" value="${escapeHtml(settings.license_code || '')}" placeholder="GIN-XXXX-XXXX" required>
        </div>
        <div class="col-md-4 ${showApiUrl ? '' : 'd-none'}">
          <label class="form-label">License API URL</label>
          <input class="form-control" name="license_check_url" type="url" value="${escapeHtml(settings.license_check_url || 'https://ginsoft.co/api/license-check.php')}" ${showApiUrl ? 'required' : ''}>
        </div>
        <div class="col-12 d-flex flex-wrap gap-2">
          <button class="btn btn-primary-gradient" type="submit"><i class="fa-solid fa-floppy-disk"></i> Save & Check License</button>
          <button class="btn btn-outline-primary" id="check-license-now" type="button"><i class="fa-solid fa-shield-halved"></i> Check Now</button>
          ${hotelLocked ? '<button class="btn btn-outline-warning" id="unlock-hotel-id" type="button"><i class="fa-solid fa-unlock-keyhole"></i> Unlock Hotel ID</button>' : ''}
        </div>
      </form>
    </section>

    <section class="pos-card mt-4">
      <h2 class="section-title">License Status</h2>
      <div class="table-responsive">
        <table class="table align-middle mb-0">
          <tbody>
            <tr><th>Status</th><td>${licenseBadge(status)}</td></tr>
            <tr><th>Customer ID</th><td>${escapeHtml(settings.license_customer_id || '-')}</td></tr>
            <tr><th>Valid Till</th><td>${escapeHtml(settings.license_validity_till || '-')}</td></tr>
            <tr><th>Last Checked</th><td>${escapeHtml(settings.license_last_checked_at ? new Date(settings.license_last_checked_at).toLocaleString() : '-')}</td></tr>
            <tr><th>Note</th><td>${escapeHtml(settings.license_reason || 'License is active')}</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  `;

  $('#license-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const form = Object.fromEntries(new FormData(event.currentTarget).entries());
      if (hotelLocked) form.hotel_id = settings.hotel_id || form.hotel_id;
      if (!form.license_check_url) form.license_check_url = settings.license_check_url || 'https://ginsoft.co/api/license-check.php';
      await saveLicenseSettings(form);
      await checkLicense();
      await renderLicense();
    } catch (error) {
      toast(error.message, 'danger');
    } finally {
      button.disabled = false;
    }
  });

  $('#check-license-now').addEventListener('click', async () => {
    const button = $('#check-license-now');
    button.disabled = true;
    try {
      const form = Object.fromEntries(new FormData($('#license-form')).entries());
      if (hotelLocked) form.hotel_id = settings.hotel_id || form.hotel_id;
      if (!form.license_check_url) form.license_check_url = settings.license_check_url || 'https://ginsoft.co/api/license-check.php';
      await saveLicenseSettings(form);
      await checkLicense();
      await renderLicense();
    } catch (error) {
      toast(error.message, 'danger');
    } finally {
      button.disabled = false;
    }
  });

  $('#unlock-hotel-id')?.addEventListener('click', async () => {
    const button = $('#unlock-hotel-id');
    button.disabled = true;
    try {
      const currentSettings = await db.getSettings();
      const hotelId = String(currentSettings.hotel_id || '').trim();
      const licenseCode = String(currentSettings.license_code || '').trim();
      if (!hotelId || !licenseCode) {
        toast('Hotel ID and License Code must be saved before unlock check', 'warning');
        return;
      }

      const response = await fetch(licenseUnlockUrl(currentSettings), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hotel_id: hotelId, license_code: licenseCode })
      });
      const payload = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));

      if (!response.ok || payload.unlock_allowed !== true) {
        toast(payload.error || `Unlock not allowed: ${payload.reason || 'approval not open'}`, 'danger');
        return;
      }

      await db.saveSetting('license_hotel_locked', 'false');
      await db.saveSetting('licence_approval', '1');
      toast('Hotel ID unlocked. You can edit it now.', 'success');
      await renderLicense();
    } catch (error) {
      toast(error.message, 'danger');
    } finally {
      button.disabled = false;
    }
  });
};
