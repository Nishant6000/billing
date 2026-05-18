import { db } from '../js/db.js';
import { $ } from '../js/utils.js';
import { toast } from '../js/ui.js';
import { t } from '../js/i18n.js';

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
      <div class="col-xl-6">
        <div class="pos-card h-100">
          <div class="d-flex justify-content-between align-items-center gap-2 mb-3">
            <h2 class="section-title mb-0">${t('barcodeCamera')}</h2>
            <span class="badge-soft"><i class="fa-solid fa-camera me-1"></i> ${t('mobile')}</span>
          </div>
          <div class="barcode-camera-frame">
            <video id="barcode-video" muted playsinline></video>
            <div class="barcode-scan-line"></div>
          </div>
          <div class="d-grid d-sm-flex gap-2 mt-3">
            <button class="btn btn-primary-gradient flex-fill" id="start-camera"><i class="fa-solid fa-camera"></i> ${t('enableCamera')}</button>
            <button class="btn btn-outline-danger flex-fill" id="stop-camera"><i class="fa-solid fa-stop"></i> ${t('stopCamera')}</button>
          </div>
          <div class="alert alert-info mt-3 mb-0" id="camera-status">${t('enableCameraPointBarcode')}</div>
        </div>
      </div>
      <div class="col-xl-6">
        <div class="pos-card mb-3">
          <div class="d-flex justify-content-between align-items-center gap-2 mb-3">
            <h2 class="section-title mb-0">${t('bluetoothScanner')}</h2>
            <span class="badge-soft"><i class="fa-solid fa-keyboard me-1"></i> ${t('test')}</span>
          </div>
          <div class="demo-barcode-card" id="bluetooth-scan-zone" tabindex="0" role="button" aria-label="${t('bluetoothBarcodeScanner')}">
            <input class="scanner-capture-input" id="bluetooth-scan-input" autocomplete="off">
            <div class="demo-barcode">
              <span style="--w:3"></span><span style="--w:1"></span><span style="--w:2"></span><span style="--w:4"></span>
              <span style="--w:1"></span><span style="--w:3"></span><span style="--w:2"></span><span style="--w:1"></span>
              <span style="--w:4"></span><span style="--w:2"></span><span style="--w:1"></span><span style="--w:3"></span>
              <span style="--w:1"></span><span style="--w:2"></span><span style="--w:4"></span><span style="--w:1"></span>
            </div>
            <div class="demo-barcode-number">8901 0000 0001</div>
          </div>
          <div class="small text-muted mt-2">${t('lastScan')}: <strong id="last-scan">${t('none')}</strong></div>
        </div>

        <form class="pos-card" id="barcode-settings-form">
          <h2 class="section-title">${t('barcodeSettings')}</h2>
          <label class="form-label">${t('scannerMode')}</label>
          <select class="form-select mb-3" name="barcode_mode">
            <option value="both" ${settings.barcode_mode === 'both' ? 'selected' : ''}>${t('both')}</option>
            <option value="bluetooth" ${settings.barcode_mode === 'bluetooth' ? 'selected' : ''}>${t('bluetoothOnly')}</option>
            <option value="camera" ${settings.barcode_mode === 'camera' ? 'selected' : ''}>${t('cameraOnly')}</option>
          </select>
          <div class="form-check form-switch mb-2"><input class="form-check-input" type="checkbox" name="barcode_auto_add" id="barcode_auto_add" ${settings.barcode_auto_add === 'true' ? 'checked' : ''}><label class="form-check-label" for="barcode_auto_add">${t('autoAddScannedProduct')}</label></div>
          <div class="form-check form-switch mb-2"><input class="form-check-input" type="checkbox" name="barcode_beep" id="barcode_beep" ${settings.barcode_beep === 'true' ? 'checked' : ''}><label class="form-check-label" for="barcode_beep">${t('beepAfterScan')}</label></div>
          <div class="form-check form-switch mb-3"><input class="form-check-input" type="checkbox" name="barcode_vibration" id="barcode_vibration" ${settings.barcode_vibration === 'true' ? 'checked' : ''}><label class="form-check-label" for="barcode_vibration">${t('vibrateAfterScan')}</label></div>
          <label class="form-label">${t('scanDelayMs')}</label>
          <input class="form-control" name="barcode_delay" type="number" min="200" step="50" value="${settings.barcode_delay}">
          <button class="btn btn-primary-gradient mt-3"><i class="fa-solid fa-floppy-disk"></i> ${t('saveSettings')}</button>
        </form>
      </div>
    </div>
  `;

  bindBarcodeEvents();
};

const bindBarcodeEvents = () => {
  $('#start-camera').addEventListener('click', startCamera);
  $('#stop-camera').addEventListener('click', stopCamera);
  $('#bluetooth-scan-zone').addEventListener('click', () => $('#bluetooth-scan-input').focus());
  $('#bluetooth-scan-input').focus();
  $('#bluetooth-scan-input').addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const code = event.currentTarget.value.trim();
    event.currentTarget.value = '';
    $('#last-scan').textContent = code || t('none');
    handleBarcode(code);
  });
  $('#barcode-settings-form').addEventListener('submit', saveBarcodeSettings);
};

const startCamera = async () => {
  if (!('BarcodeDetector' in window)) {
    $('#camera-status').className = 'alert alert-warning mt-3 mb-0';
    $('#camera-status').textContent = t('cameraScannerNotSupported');
    return;
  }
  detector = detector || new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'qr_code'] });
  cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  const video = $('#barcode-video');
  video.srcObject = cameraStream;
  await video.play();
  $('#camera-status').className = 'alert alert-success mt-3 mb-0';
  $('#camera-status').textContent = t('cameraScannerStarted');
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
  $('#camera-status').textContent = t('cameraStopped');
};

const handleBarcode = async (code) => {
  if (!code) return toast(t('enterOrScanBarcode'), 'warning');
  const settings = { ...settingDefaults, ...(await db.getSettings()) };
  if (settings.barcode_beep === 'true') beep();
  if (settings.barcode_vibration === 'true' && navigator.vibrate) navigator.vibrate(80);
  const products = await db.getProducts(code);
  const product = products.find(item => String(item.barcode || '') === String(code)) || products[0];
  if (product && settings.barcode_auto_add === 'true') {
    sessionStorage.setItem('pos-pending-barcode', code);
    toast(t('productFoundOpeningBilling'));
    location.hash = '#/billing';
  } else if (product) {
    toast(`${t('productFound')}: ${product.product_name}`);
  } else {
    toast(`${t('noProductFoundForBarcode')} ${code}`, 'warning');
  }
};

const saveBarcodeSettings = async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  await db.saveSetting('barcode_mode', form.get('barcode_mode'));
  await db.saveSetting('barcode_auto_add', form.get('barcode_auto_add') ? 'true' : 'false');
  await db.saveSetting('barcode_beep', form.get('barcode_beep') ? 'true' : 'false');
  await db.saveSetting('barcode_vibration', form.get('barcode_vibration') ? 'true' : 'false');
  await db.saveSetting('barcode_delay', form.get('barcode_delay') || '600');
  toast(t('barcodeSettingsSaved'));
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
