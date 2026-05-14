import { db } from '../js/db.js';
import { $, downloadFile, escapeHtml } from '../js/utils.js';
import { toast } from '../js/ui.js';

let selectedBackup = null;

export const renderBackup = async () => {
  $('#view').innerHTML = `
    <div class="row g-3">
      <div class="col-lg-6">
        <div class="pos-card h-100">
          <div class="metric-icon mb-3"><i class="fa-solid fa-download"></i></div>
          <h2 class="section-title">Backup Database</h2>
          <p class="text-muted">Download a complete local backup of products, sales, purchases, settings, held bills, and audit reports.</p>
          <button class="btn btn-primary-gradient" id="download-backup"><i class="fa-solid fa-cloud-arrow-down"></i> Download Backup</button>
          <div class="mt-3 small text-muted" id="backup-status"></div>
        </div>
      </div>
      <div class="col-lg-6">
        <div class="pos-card h-100">
          <div class="metric-icon mb-3" style="background:linear-gradient(135deg,#f59e0b,#ef4444)"><i class="fa-solid fa-upload"></i></div>
          <h2 class="section-title">Restore Database</h2>
          <p class="text-muted">Upload a Zento POS backup file. Restore replaces current local data with the backup data.</p>
          <input class="form-control" id="backup-file" type="file" accept="application/json,.json">
          <div class="mt-3" id="restore-preview"></div>
          <button class="btn btn-outline-danger mt-3" id="restore-backup" disabled><i class="fa-solid fa-database"></i> Restore Backup</button>
        </div>
      </div>
      <div class="col-12">
        <div class="pos-card">
          <h2 class="section-title">Backup Contents</h2>
          <div class="table-responsive">
            <table class="table">
              <thead><tr><th>Data</th><th>Description</th></tr></thead>
              <tbody>
                <tr><td>Products & Categories</td><td>All product details, photos, pricing, GST, shelf/box, and discounts.</td></tr>
                <tr><td>Sales & Payments</td><td>Bills, bill items, payment records, returns, modifications, deleted bill audit.</td></tr>
                <tr><td>Purchases</td><td>Purchase bill entries and purchase GST input records.</td></tr>
                <tr><td>Settings</td><td>Shop details, GST settings, printer settings, and bill settings.</td></tr>
                <tr><td>Held Bills</td><td>Saved hold bills waiting to be resumed.</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;

  $('#download-backup').addEventListener('click', downloadBackup);
  $('#backup-file').addEventListener('change', readBackupFile);
  $('#restore-backup').addEventListener('click', restoreBackup);
};

const downloadBackup = async () => {
  const backup = await db.exportBackup();
  const stamp = new Date().toISOString().replaceAll(':', '-').slice(0, 19);
  const filename = `zento-pos-backup-${stamp}.json`;
  downloadFile(filename, JSON.stringify(backup, null, 2), 'application/json');
  $('#backup-status').textContent = `Backup created: ${filename}`;
  toast('Backup downloaded');
};

const readBackupFile = async (event) => {
  selectedBackup = null;
  $('#restore-backup').disabled = true;
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    selectedBackup = JSON.parse(await file.text());
    if (!selectedBackup.tables) throw new Error('Missing tables');
    const counts = Object.entries(selectedBackup.tables)
      .map(([name, rows]) => `<tr><td>${escapeHtml(name)}</td><td>${Array.isArray(rows) ? rows.length : 0}</td></tr>`)
      .join('');
    $('#restore-preview').innerHTML = `
      <div class="alert alert-warning">
        <strong>${escapeHtml(selectedBackup.app || 'Backup file')}</strong><br>
        Exported: ${escapeHtml(selectedBackup.exportedAt || 'Unknown')}
      </div>
      <div class="table-responsive">
        <table class="table table-sm"><thead><tr><th>Table</th><th>Rows</th></tr></thead><tbody>${counts}</tbody></table>
      </div>
    `;
    $('#restore-backup').disabled = false;
  } catch (error) {
    $('#restore-preview').innerHTML = `<div class="alert alert-danger">Invalid backup file: ${escapeHtml(error.message)}</div>`;
    toast('Invalid backup file', 'danger');
  }
};

const restoreBackup = async () => {
  if (!selectedBackup) return;
  if (!confirm('Restore this backup? Current local POS data will be replaced.')) return;
  await db.restoreBackup(selectedBackup);
  toast('Backup restored');
  await renderBackup();
};
