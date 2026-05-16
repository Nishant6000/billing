import { db } from '../js/db.js';
import { $, escapeHtml } from '../js/utils.js';
import { showModal, toast } from '../js/ui.js';

const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  if (!file?.size) return resolve('');
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

const receiptLogo = (settings) => settings.receipt_logo
  ? `<img class="receipt-logo" src="${escapeHtml(settings.receipt_logo)}" alt="Receipt logo">`
  : '<div class="receipt-logo-placeholder"><i class="fa-solid fa-store"></i></div>';

const receiptPreview = (settings) => `
  <div class="receipt-preview print-area receipt-theme-${escapeHtml(settings.printer_theme || 'thermal')}">
    <div class="receipt-header-block">
      ${receiptLogo(settings)}
      <h5 class="text-center">${escapeHtml(settings.receipt_header || settings.shop_name || '')}</h5>
      <p class="text-center small">${escapeHtml(settings.shop_name || '')}<br>${escapeHtml(settings.shop_address || '')}<br>GSTIN: ${escapeHtml(settings.gstin || '')}</p>
    </div>
    <p>Invoice: TEST-001<br>Date: ${new Date().toLocaleString()}</p>
    <table class="table table-sm"><tbody><tr><td>Sample Item</td><td>1 Piece</td><td class="text-end">100.00</td></tr></tbody></table>
    <p>GST: 5.00<br>Discount: 0.00</p>
    <h5>Total: 105.00</h5>
    <div class="border p-3 text-center my-2">QR AREA</div>
    <p class="text-center">${escapeHtml(settings.receipt_footer || settings.footer_text || '')}</p>
  </div>
`;

export const renderPrinter = async () => {
  const settings = await db.getSettings();
  $('#view').innerHTML = `
    <div class="row g-3">
      <div class="col-lg-6">
        <form class="pos-card" id="printer-form">
          <h2 class="section-title">Bluetooth Printer Settings</h2>
          <label class="form-label">Printer name</label><input class="form-control mb-3" name="printer_name" value="${escapeHtml(settings.printer_name || '')}" placeholder="Example: POS-5802DD">
          <label class="form-label">Paper Size</label><select class="form-select mb-3" name="paper_size" id="printer-paper"><option ${settings.paper_size === '58mm' ? 'selected' : ''}>58mm</option><option ${settings.paper_size !== '58mm' ? 'selected' : ''}>80mm</option></select>
          <label class="form-label">Printer Theme</label><select class="form-select mb-3" name="printer_theme"><option value="thermal" ${settings.printer_theme !== 'desktop' ? 'selected' : ''}>Thermal Printer Theme</option><option value="desktop" ${settings.printer_theme === 'desktop' ? 'selected' : ''}>Desktop Printer Theme</option></select>
          <label class="form-label">Receipt Format</label><select class="form-select mb-3" name="receipt_format"><option value="compact" ${settings.receipt_format !== 'detailed' ? 'selected' : ''}>Compact GST Receipt</option><option value="detailed" ${settings.receipt_format === 'detailed' ? 'selected' : ''}>Detailed Tax Invoice</option></select>
          <hr>
          <h2 class="section-title">Receipt Header & Footer</h2>
          <label class="form-label">Header Text</label><input class="form-control mb-3" name="receipt_header" value="${escapeHtml(settings.receipt_header || settings.shop_name || '')}" placeholder="Example: Tax Invoice">
          <label class="form-label">Header Logo</label><input class="form-control mb-3" name="receipt_logo" type="file" accept="image/*">
          ${settings.receipt_logo ? '<div class="form-text mb-3">Current logo is shown in the preview. Upload a new logo to replace it.</div>' : ''}
          <label class="form-label">Footer Text</label><textarea class="form-control mb-3" name="receipt_footer" rows="3">${escapeHtml(settings.receipt_footer || settings.footer_text || '')}</textarea>
          <div class="d-flex flex-wrap gap-2">
            <button class="btn btn-primary-gradient" type="submit"><i class="fa-solid fa-floppy-disk"></i> Save Printer Settings</button>
            <button class="btn btn-outline-primary" id="test-print" type="button"><i class="fa-solid fa-print"></i> Test Print</button>
          </div>
        </form>
      </div>
      <div class="col-lg-6">
        <div class="pos-card">
          <h2 class="section-title">Receipt Preview</h2>
          ${receiptPreview(settings)}
        </div>
      </div>
    </div>
  `;
  $('#printer-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    for (const [key, value] of form.entries()) {
      if (value instanceof File) {
        if (value.size) await db.saveSetting(key, await fileToDataUrl(value));
        continue;
      }
      await db.saveSetting(key, value);
      if (key === 'receipt_footer') await db.saveSetting('footer_text', value);
    }
    toast('Printer settings saved');
    await renderPrinter();
  });
  $('#test-print').addEventListener('click', () => {
    showModal(`
      <div class="modal-header"><h5 class="modal-title">Test Print</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
      <div class="modal-body">${receiptPreview(settings)}</div>
      <div class="modal-footer"><button class="btn btn-primary-gradient" onclick="window.print()">Print Test</button></div>
    `);
  });
};
