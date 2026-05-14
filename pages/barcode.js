import { db } from '../js/db.js';
import { $, escapeHtml, money } from '../js/utils.js';
import { toast } from '../js/ui.js';

let cameraStream = null;
let scanTimer = null;
let detector = null;

const settingDefaults = {
  barcode_mode: 'both',
  barcode_auto_add: 'true',
  barcode_beep: 'true',
  barcode_vibration: 'true',
  barcode_delay: '600'
};

export const renderBarcode = async () => {
  const settings = { ...settingDefaults, ...(await db.getSettings()) };
  $('#view').innerHTML = `
    <div class="row g-3">
      <div class="col-xl-7">
        <div class="pos-card mb-3">
          <div class="d-flex flex-wrap gap-2 justify-content-between align-items-center mb-3">
            <div>
              <h2 class="section-title mb-1">Scan Barcode</h2>
              <p class="text-muted mb-0">Use mobile camera scanning when supported by the browser or Android WebView.</p>
            </div>
            <div class="d-flex gap-2">
              <button class="btn btn-primary-gradient" id="start-camera"><i class="fa-solid fa-camera"></i> Start Camera</button>
              <button class="btn btn-outline-danger" id="stop-camera"><i class="fa-solid fa-stop"></i> Stop</button>
            </div>
          </div>
          <div class="barcode-camera-frame">
            <video id="barcode-video" muted playsinline></video>
            <div class="barcode-scan-line"></div>
          </div>
          <div class="alert alert-info mt-3 mb-0" id="camera-status">Camera scanner uses native BarcodeDetector when available. Bluetooth scanner works everywhere as keyboard input.</div>
        </div>

        <div class="pos-card">
          <h2 class="section-title">Barcode Search</h2>
          <div class="row g-2">
            <div class="col-md-8"><input class="form-control form-control-lg" id="barcode-search" placeholder="Type barcode or scan with Bluetooth scanner"></div>
            <div class="col-md-4"><button class="btn btn-primary-gradient w-100 h-100" id="barcode-search-btn"><i class="fa-solid fa-magnifying-glass"></i> Search</button></div>
          </div>
          <div id="barcode-result" class="mt-3"></div>
        </div>
      </div>
      <div class="col-xl-5">
        <div class="pos-card mb-3">
          <h2 class="section-title">Bluetooth Scanner Test</h2>
          <p class="text-muted">Bluetooth scanners usually type barcode text and press Enter. Keep this field focused and scan.</p>
          <input class="form-control form-control-lg" id="bluetooth-scan-input" placeholder="Focus here and scan">
          <div class="small text-muted mt-2">Last scan: <strong id="last-scan">None</strong></div>
        </div>

        <form class="pos-card" id="barcode-settings-form">
          <h2 class="section-title">Barcode Settings</h2>
          <label class="form-label">Scanner Mode</label>
          <select class="form-select mb-3" name="barcode_mode">
            <option value="both" ${settings.barcode_mode === 'both' ? 'selected' : ''}>Both</option>
            <option value="bluetooth" ${settings.barcode_mode === 'bluetooth' ? 'selected' : ''}>Bluetooth Only</option>
            <option value="camera" ${settings.barcode_mode === 'camera' ? 'selected' : ''}>Camera Only</option>
          </select>
          <div class="form-check form-switch mb-2"><input class="form-check-input" type="checkbox" name="barcode_auto_add" id="barcode_auto_add" ${settings.barcode_auto_add === 'true' ? 'checked' : ''}><label class="form-check-label" for="barcode_auto_add">Auto-add scanned product to Billing</label></div>
          <div class="form-check form-switch mb-2"><input class="form-check-input" type="checkbox" name="barcode_beep" id="barcode_beep" ${settings.barcode_beep === 'true' ? 'checked' : ''}><label class="form-check-label" for="barcode_beep">Beep after scan</label></div>
          <div class="form-check form-switch mb-3"><input class="form-check-input" type="checkbox" name="barcode_vibration" id="barcode_vibration" ${settings.barcode_vibration === 'true' ? 'checked' : ''}><label class="form-check-label" for="barcode_vibration">Vibrate after scan</label></div>
          <label class="form-label">Scan Delay (ms)</label>
          <input class="form-control" name="barcode_delay" type="number" min="200" step="50" value="${settings.barcode_delay}">
          <button class="btn btn-primary-gradient mt-3"><i class="fa-solid fa-floppy-disk"></i> Save Settings</button>
        </form>
      </div>
    </div>
  `;

  bindBarcodeEvents();
};

const bindBarcodeEvents = () => {
  $('#start-camera').addEventListener('click', startCamera);
  $('#stop-camera').addEventListener('click', stopCamera);
  $('#barcode-search-btn').addEventListener('click', () => handleBarcode($('#barcode-search').value.trim()));
  $('#barcode-search').addEventListener('keydown', event => {
    if (event.key === 'Enter') handleBarcode(event.currentTarget.value.trim());
  });
  $('#bluetooth-scan-input').addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const code = event.currentTarget.value.trim();
    event.currentTarget.value = '';
    $('#last-scan').textContent = code || 'None';
    handleBarcode(code);
  });
  $('#barcode-result').addEventListener('click', event => {
    const code = event.target.closest('[data-add-barcode]')?.dataset.addBarcode;
    if (!code) return;
    sessionStorage.setItem('pos-pending-barcode', code);
    location.hash = '#/billing';
  });
  $('#barcode-settings-form').addEventListener('submit', saveBarcodeSettings);
};

const startCamera = async () => {
  if (!('BarcodeDetector' in window)) {
    $('#camera-status').className = 'alert alert-warning mt-3 mb-0';
    $('#camera-status').textContent = 'Camera barcode scanning is not supported in this browser. Use Bluetooth/manual scanner input.';
    return;
  }
  detector = detector || new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'qr_code'] });
  cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  const video = $('#barcode-video');
  video.srcObject = cameraStream;
  await video.play();
  $('#camera-status').className = 'alert alert-success mt-3 mb-0';
  $('#camera-status').textContent = 'Camera scanner started. Point at a barcode.';
  scanCameraLoop();
};

const scanCameraLoop = async () => {
  if (!cameraStream || !detector) return;
  const settings = { ...settingDefaults, ...(await db.getSettings()) };
  try {
    const codes = await detector.detect($('#barcode-video'));
    if (codes.length) {
      await handleBarcode(codes[0].rawValue);
      scanTimer = setTimeout(scanCameraLoop, Number(settings.barcode_delay || 600));
      return;
    }
  } catch (_) {}
  scanTimer = setTimeout(scanCameraLoop, Number(settings.barcode_delay || 600));
};

const stopCamera = () => {
  clearTimeout(scanTimer);
  scanTimer = null;
  cameraStream?.getTracks().forEach(track => track.stop());
  cameraStream = null;
  const video = $('#barcode-video');
  if (video) video.srcObject = null;
  $('#camera-status').className = 'alert alert-info mt-3 mb-0';
  $('#camera-status').textContent = 'Camera stopped.';
};

const handleBarcode = async (code) => {
  if (!code) return toast('Enter or scan a barcode', 'warning');
  const settings = { ...settingDefaults, ...(await db.getSettings()) };
  if (settings.barcode_beep === 'true') beep();
  if (settings.barcode_vibration === 'true' && navigator.vibrate) navigator.vibrate(80);
  const products = await db.getProducts(code);
  const product = products.find(item => String(item.barcode || '') === String(code)) || products[0];
  renderBarcodeResult(code, product);
  if (product && settings.barcode_auto_add === 'true') {
    sessionStorage.setItem('pos-pending-barcode', code);
    toast('Product found. Opening Billing.');
    location.hash = '#/billing';
  }
};

const renderBarcodeResult = (code, product) => {
  $('#barcode-result').innerHTML = product ? `
    <div class="pos-card shadow-none border">
      <div class="d-flex justify-content-between gap-3">
        <div>
          <div class="text-muted small">Barcode ${escapeHtml(code)}</div>
          <h5 class="fw-bold mb-1">${escapeHtml(product.product_name)}</h5>
          <div class="text-muted">Stock ${product.stock} | GST ${product.gst_percent}%</div>
        </div>
        <div class="text-end">
          <div class="fw-bold fs-5">${money(product.selling_price)}</div>
          <button class="btn btn-sm btn-primary-gradient mt-2" data-add-barcode="${escapeHtml(code)}">Add to Bill</button>
        </div>
      </div>
    </div>
  ` : `<div class="alert alert-warning">No product found for barcode <strong>${escapeHtml(code)}</strong>.</div>`;
};

const saveBarcodeSettings = async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  await db.saveSetting('barcode_mode', form.get('barcode_mode'));
  await db.saveSetting('barcode_auto_add', form.get('barcode_auto_add') ? 'true' : 'false');
  await db.saveSetting('barcode_beep', form.get('barcode_beep') ? 'true' : 'false');
  await db.saveSetting('barcode_vibration', form.get('barcode_vibration') ? 'true' : 'false');
  await db.saveSetting('barcode_delay', form.get('barcode_delay') || '600');
  toast('Barcode settings saved');
};

const beep = () => {
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    oscillator.frequency.value = 880;
    oscillator.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.08);
  } catch (_) {}
};
