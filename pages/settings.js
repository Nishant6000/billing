import { db } from '../js/db.js';
import { $, escapeHtml } from '../js/utils.js';
import { toast } from '../js/ui.js';

export const renderSettings = async () => {
  const settings = await db.getSettings();
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
        <div class="col-md-4"><label class="form-label">Theme</label><select class="form-select" name="theme"><option>Professional Light</option><option>Dark POS</option></select></div>
        <div class="col-12"><label class="form-label">Footer text</label><input class="form-control" name="footer_text" value="${escapeHtml(settings.footer_text || '')}"></div>
      </div>
      <hr>
      <h2 class="section-title">Bill Settings</h2>
      <div class="form-check form-switch"><input class="form-check-input" type="checkbox" checked id="printAfterSale"><label class="form-check-label" for="printAfterSale">Show receipt after payment</label></div>
      <button class="btn btn-primary-gradient mt-4"><i class="fa-solid fa-floppy-disk"></i> Save Settings</button>
    </form>
  `;
  $('#settings-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    for (const [key, value] of form.entries()) {
      if (value instanceof File) continue;
      await db.saveSetting(key, value);
    }
    await window.POS?.updateShopNameLabel?.();
    toast('Settings saved');
  });
};
