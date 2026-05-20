import { db } from './db.js';
import { toast } from './ui.js';

let syncTimer = null;
let syncRunning = false;

export const webSyncStatus = () => ({
  lastSyncAt: localStorage.getItem('pos-web-sync-last-at') || '',
  lastStatus: localStorage.getItem('pos-web-sync-last-status') || 'Not synced'
});

export const stopWebSync = () => {
  if (syncTimer) clearInterval(syncTimer);
  syncTimer = null;
};

export const runWebSync = async ({ silent = false } = {}) => {
  if (syncRunning) return;
  syncRunning = true;
  try {
    const settings = await db.getSettings();
    if (settings.web_sync_enabled !== 'true') return;
    const url = String(settings.web_sync_url || '').trim();
    if (!url) throw new Error('Web sync URL is missing');
    const hotelId = String(settings.hotel_id || '').trim();
    if (!hotelId) throw new Error('Hotel ID is missing in Settings');
    const backup = await db.exportBackup();
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hotel_id: hotelId,
        shop_name: settings.shop_name || '',
        synced_at: new Date().toISOString(),
        backup
      })
    });
    if (!response.ok) throw new Error(`Web sync failed: HTTP ${response.status}`);
    localStorage.setItem('pos-web-sync-last-at', new Date().toISOString());
    localStorage.setItem('pos-web-sync-last-status', 'Success');
    if (!silent) toast('Web sync completed');
  } catch (error) {
    localStorage.setItem('pos-web-sync-last-status', error.message || 'Web sync failed');
    if (!silent) toast(error.message || 'Web sync failed', 'danger');
  } finally {
    syncRunning = false;
  }
};

export const startWebSyncFromSettings = async () => {
  stopWebSync();
  const settings = await db.getSettings();
  if (settings.web_sync_enabled !== 'true') return;
  const minutes = Math.max(1, Number(settings.web_sync_interval_minutes || 15));
  syncTimer = setInterval(() => runWebSync({ silent: true }), minutes * 60 * 1000);
};
