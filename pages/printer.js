import { db } from '../js/db.js';
import { $, escapeHtml } from '../js/utils.js';
import { showModal, toast } from '../js/ui.js';

export const renderPrinter = async () => {
  const settings = await db.getSettings();
  $('#view').innerHTML = `
    <div class="row g-3">
      <div class="col-lg-6">
        <div class="pos-card">
          <h2 class="section-title">Bluetooth Printer Settings</h2>
          <label class="form-label">Printer name</label><input class="form-control mb-3" placeholder="Example: POS-5802DD">
          <label class="form-label">Paper Size</label><select class="form-select mb-3" id="printer-paper"><option ${settings.paper_size === '58mm' ? 'selected' : ''}>58mm</option><option ${settings.paper_size !== '58mm' ? 'selected' : ''}>80mm</option></select>
          <label class="form-label">Receipt Format</label><select class="form-select mb-3"><option>Compact GST Receipt</option><option>Detailed Tax Invoice</option></select>
          <button class="btn btn-primary-gradient" id="test-print"><i class="fa-solid fa-print"></i> Test Print</button>
        </div>
      </div>
      <div class="col-lg-6">
        <div class="pos-card">
          <h2 class="section-title">Receipt Preview</h2>
          <div class="receipt-preview print-area">
            <h5 class="text-center">${escapeHtml(settings.shop_name || '')}</h5>
            <p class="text-center small">${escapeHtml(settings.shop_address || '')}<br>GSTIN: ${escapeHtml(settings.gstin || '')}</p>
            <p>58mm/80mm thermal layout prepared for Android Bluetooth plugin integration.</p>
            <div class="border p-3 text-center">QR AREA</div>
            <p class="text-center">${escapeHtml(settings.footer_text || '')}</p>
          </div>
        </div>
      </div>
    </div>
  `;
  $('#printer-paper').addEventListener('change', async (event) => {
    await db.saveSetting('paper_size', event.target.value);
    toast('Paper size saved');
  });
  $('#test-print').addEventListener('click', () => {
    showModal(`
      <div class="modal-header"><h5 class="modal-title">Test Print</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
      <div class="modal-body"><p>Browser print is ready now. Android Bluetooth ESC/POS printing can be attached here without changing billing logic.</p></div>
      <div class="modal-footer"><button class="btn btn-primary-gradient" onclick="window.print()">Print Test</button></div>
    `);
  });
};
