import { db } from './db.js';

const orderSyncSettings = async () => {
  const settings = await db.getSettings();
  return {
    enabled: settings.web_sync_enabled === 'true',
    hotelId: String(settings.hotel_id || '').trim(),
    url: String(settings.hotel_order_sync_url || 'https://ginsoft.co/api/hotel-orders.php').trim()
  };
};

const request = async (action, payload = {}) => {
  const settings = await orderSyncSettings();
  if (!settings.enabled || !settings.hotelId || !settings.url) return { skipped: true };
  const response = await fetch(settings.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, hotel_id: settings.hotelId, ...payload })
  });
  const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
  if (!response.ok || data.ok === false) throw new Error(data.error || `Order sync failed: HTTP ${response.status}`);
  return data;
};

const userSyncSettings = async () => {
  const settings = await db.getSettings();
  return {
    hotelId: String(settings.hotel_id || '').trim(),
    url: String(settings.hotel_users_url || 'https://ginsoft.co/api/hotel-users.php').trim()
  };
};

export const fetchCloudHotelUsers = async () => {
  const settings = await userSyncSettings();
  if (!settings.hotelId || !settings.url) return [];
  const response = await fetch(settings.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'list', hotel_id: settings.hotelId })
  });
  const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
  if (!response.ok || data.ok === false) throw new Error(data.error || `Unable to load cloud users: HTTP ${response.status}`);
  return data.users || [];
};

export const pushKotToCloud = async (kotId) => {
  const ticket = (await db.getKotTickets()).find(row => Number(row.id) === Number(kotId));
  if (!ticket) return { skipped: true };
  return request('upsert_kot', { kot: ticket });
};

export const fetchCloudKots = async () => {
  const result = await request('list_kots');
  return result.kots || [];
};

export const updateCloudKotStatus = async (kotNo, status) =>
  request('update_kot_status', { kot_no: kotNo, status });

export const updateCloudKotItemStatus = async (kotNo, productName, status) =>
  request('update_item_status', { kot_no: kotNo, product_name: productName, status });
