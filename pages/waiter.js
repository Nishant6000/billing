import { db } from '../js/db.js';
import { getCurrentUser } from '../js/auth.js';
import { $, calculateCart, debounce, dynamicLineTaxable, escapeHtml, money } from '../js/utils.js';
import { toast } from '../js/ui.js';
import { fetchCloudHotelUsers, fetchCloudKots, pushKotToCloud } from '../js/hotel-cloud.js';

let waiterCart = [];
let selectedTableId = null;
let selectedWaiterId = '';

const waiterOptions = (waiters = [], selectedUserId = '') => {
  const options = waiters.map(waiter =>
    `<option value="${escapeHtml(waiter.user_id)}" ${String(waiter.user_id) === String(selectedUserId) ? 'selected' : ''}>${escapeHtml(waiter.full_name)} (${escapeHtml(waiter.user_id)})</option>`
  ).join('');
  return `<option value="">Select waiter</option>${options}`;
};

const selectedWaiterUser = (waiters = []) =>
  waiters.find(waiter => String(waiter.user_id) === String(selectedWaiterId)) || getCurrentUser();

const loadWaiters = async () => {
  const localWaiters = (await db.getUsers())
    .filter(user => user.role === 'Waiter' && user.status !== 'inactive')
    .map(user => ({ ...user, source: 'local' }));
  let cloudWaiters = [];
  try {
    cloudWaiters = (await fetchCloudHotelUsers())
      .filter(user => user.role === 'Waiter' && Number(user.status) !== 0)
      .map(user => ({
        user_id: user.user_id,
        full_name: user.full_name,
        role: 'Waiter',
        status: 'active',
        cloud_user: true,
        source: 'cloud'
      }));
  } catch (error) {
    toast(`Cloud waiters not loaded: ${error.message}`, 'warning');
  }

  const byUserId = new Map();
  [...localWaiters, ...cloudWaiters].forEach(user => {
    const key = String(user.user_id || '').trim().toLowerCase();
    if (key && !byUserId.has(key)) byUserId.set(key, user);
  });
  return [...byUserId.values()].sort((a, b) => String(a.full_name || '').localeCompare(String(b.full_name || '')));
};

const waiterOrderItem = (product) => ({
  ...product,
  quantity: 1,
  sale_unit: 'Item',
  base_quantity: 1,
  base_unit: 'Item'
});

const formatWaiterQty = (quantity) => {
  const numeric = Number(quantity || 0);
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
};

const availableStock = (item) => Number(item.stock ?? Number.POSITIVE_INFINITY);

const stockMessage = (item) => {
  if (availableStock(item) <= 0) return `${item.product_name} is out of stock`;
  return `${item.product_name} has only ${formatWaiterQty(availableStock(item))} in stock`;
};

const hasEnoughStock = (item) =>
  availableStock(item) === Number.POSITIVE_INFINITY || Number(item.quantity || 0) <= availableStock(item);

const validateWaiterCartStock = () => {
  const invalid = waiterCart.find(item => !hasEnoughStock(item));
  if (!invalid) return true;
  toast(stockMessage(invalid), 'warning');
  return false;
};

const normalizeStation = (item) => item.fulfillment_station === 'store' ? 'store' : 'kitchen';

const mergeCart = () => {
  const map = new Map();
  waiterCart.forEach(item => {
    const key = `${item.id}|${item.sale_unit || item.base_unit || 'Piece'}`;
    const existing = map.get(key);
    if (existing) existing.quantity = Number(existing.quantity || 0) + Number(item.quantity || 0);
    else map.set(key, { ...item });
  });
  waiterCart = [...map.values()].filter(item => Number(item.quantity || 0) > 0);
};

const renderWaiterCart = () => {
  mergeCart();
  const total = calculateCart(waiterCart, 0).grandTotal;
  $('#waiter-cart').innerHTML = waiterCart.length ? waiterCart.map(item => `
    <div class="cart-line compact waiter-cart-line">
      <div class="waiter-cart-info">
        <strong>${escapeHtml(item.product_name)}</strong>
        <div class="text-muted small">Qty ${formatWaiterQty(item.quantity)} | ${money(dynamicLineTaxable(item))}</div>
        <span class="badge ${item.fulfillment_station === 'store' ? 'text-bg-info' : 'text-bg-warning'}">${item.fulfillment_station === 'store' ? 'Store Room' : 'Kitchen'}</span>
      </div>
      <div class="waiter-cart-actions">
        <button class="btn btn-sm btn-outline-secondary" data-waiter-qty="${item.id}" data-delta="-1"><i class="fa-solid fa-minus"></i></button>
        <input class="form-control form-control-sm waiter-qty-input" data-waiter-quantity="${item.id}" type="number" min="0" step="1" value="${formatWaiterQty(item.quantity)}" aria-label="Quantity for ${escapeHtml(item.product_name)}">
        <button class="btn btn-sm btn-outline-secondary" data-waiter-qty="${item.id}" data-delta="1"><i class="fa-solid fa-plus"></i></button>
        <button class="btn btn-sm btn-outline-danger" data-waiter-remove="${item.id}"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>
  `).join('') : '<p class="text-muted text-center py-4">No items selected</p>';
  $('#waiter-cart-total').textContent = money(total);
};

const renderWaiterProducts = async (search = '') => {
  const products = await db.getProducts(search);
  $('#waiter-products').innerHTML = products.map(product => `
    <button class="waiter-product" data-product="${product.id}">
      <span>${escapeHtml(product.product_name)}</span>
      <span class="badge ${product.fulfillment_station === 'store' ? 'text-bg-info' : 'text-bg-warning'} align-self-start">${product.fulfillment_station === 'store' ? 'Store Room' : 'Kitchen'}</span>
      <strong>${money(product.selling_price)}</strong>
    </button>
  `).join('');
};

const renderReadyAlerts = async () => {
  let cloudReady = [];
  try {
    cloudReady = (await fetchCloudKots()).filter(kot => (kot.cloud_status || kot.status) === 'ready');
  } catch (_) {}
  const localReady = (await db.getKotTickets()).filter(kot => kot.status === 'ready');
  const readyMap = new Map([...cloudReady, ...localReady].map(kot => [kot.kot_no, kot]));
  const ready = [...readyMap.values()].slice(0, 4);
  $('#waiter-alerts').innerHTML = ready.length ? ready.map(kot => `
    <div class="alert alert-success py-2 mb-2"><i class="fa-solid fa-bell"></i> ${escapeHtml(kot.table_name || 'Order')} ready (${escapeHtml(kot.kot_no)})</div>
  `).join('') : '<div class="text-muted small">No ready alerts</div>';
};

const renderOrderStatus = async () => {
  const selectedTable = selectedTableId
    ? (await db.getDiningTables()).find(table => Number(table.id) === Number(selectedTableId))
    : null;
  let cloudTickets = [];
  try {
    cloudTickets = await fetchCloudKots();
  } catch (_) {}
  const localTickets = await db.getKotTickets();
  const ticketsByNo = new Map([...cloudTickets, ...localTickets].map(kot => [kot.kot_no, kot]));
  const tickets = [...ticketsByNo.values()]
    .filter(kot => !['served', 'cancelled', 'closed'].includes(String(kot.cloud_status || kot.status || '').toLowerCase()))
    .filter(kot => {
      if (!selectedTableId) return true;
      return Number(kot.table_id) === Number(selectedTableId)
        || String(kot.table_name || '').toLowerCase() === String(selectedTable?.table_name || '').toLowerCase();
    })
    .slice(0, 8);

  $('#waiter-order-status').innerHTML = tickets.length ? tickets.map(kot => {
    const status = kot.cloud_status || kot.status || 'pending';
    const badge = status === 'ready' ? 'success' : status === 'preparing' ? 'warning' : 'secondary';
    const items = kot.items || [];
    return `
      <div class="waiter-status-row">
        <div>
          <strong>${escapeHtml(kot.table_name || 'Order')}</strong>
          <div class="text-muted small">${escapeHtml(kot.kot_no)} | ${kot.station === 'store' ? 'Store Room' : 'Kitchen'} | ${escapeHtml(kot.order_user_name || '')}</div>
          <div class="mt-1">
            ${items.map(item => `<div class="text-muted small">${escapeHtml(item.product_name)} - Qty ${formatWaiterQty(item.quantity)} - ${escapeHtml(item.status || status)}</div>`).join('')}
          </div>
        </div>
        <span class="badge text-bg-${badge}">${escapeHtml(status)}</span>
      </div>
    `;
  }).join('') : `<div class="text-muted small">${selectedTable ? 'No running orders for this table' : 'Select a table to view its running orders'}</div>`;
};

const sendOrderToStations = async (stations = ['kitchen', 'store'], waiters = []) => {
  if (!selectedTableId) return toast('Select table first', 'warning');
  if (!selectedWaiterId && waiters.length) return toast('Select waiter first', 'warning');
  if (!waiterCart.length) return toast('Add items first', 'warning');
  if (!validateWaiterCartStock()) return;
  const stationSet = new Set(stations);
  const itemsToSend = waiterCart.filter(item => stationSet.has(normalizeStation(item)));
  if (!itemsToSend.length) {
    const label = stations.includes('store') && !stations.includes('kitchen') ? 'Store Room' : 'Kitchen';
    return toast(`Add ${label} items first`, 'warning');
  }

  const activeOrder = await db.getActiveTableOrder(selectedTableId);
  const existingItems = activeOrder ? await db.getTableOrderItems(activeOrder.id) : [];
  const orderId = await db.saveTableOrder({
    tableId: selectedTableId,
    orderType: 'table',
    items: [...existingItems, ...itemsToSend],
    user: selectedWaiterUser(waiters)
  });
  const byStation = itemsToSend.reduce((map, item) => {
    const station = normalizeStation(item);
    if (!map.has(station)) map.set(station, []);
    map.get(station).push(item);
    return map;
  }, new Map());
  for (const [station, items] of byStation.entries()) {
    const kot = await db.createKot({ orderId, tableId: selectedTableId, items, station });
    try {
      await pushKotToCloud(kot.kotId);
    } catch (error) {
      toast(`${station === 'store' ? 'Store Room' : 'Kitchen'} order saved locally. Cloud sync failed: ${error.message}`, 'warning');
    }
  }
  waiterCart = waiterCart.filter(item => !stationSet.has(normalizeStation(item)));
  const sentLabels = [...byStation.keys()].map(station => station === 'store' ? 'Store Room' : 'Kitchen').join(' and ');
  toast(`Order sent to ${sentLabels}`);
  await renderWaiterOrders();
};

export const renderWaiterOrders = async () => {
  const tables = await db.getDiningTables();
  const waiters = await loadWaiters();
  const currentUser = getCurrentUser();
  if (!selectedWaiterId && currentUser?.role === 'Waiter') selectedWaiterId = currentUser.user_id;
  $('#view').innerHTML = `
    <div class="row g-3">
      <div class="col-xl-3">
        <section class="pos-card h-100">
          <h2 class="section-title">Tables</h2>
          <div class="d-grid gap-2">
            ${tables.map(table => `<button class="btn ${Number(table.id) === Number(selectedTableId) ? 'btn-primary-gradient' : 'btn-outline-primary'} text-start" data-table="${table.id}">${escapeHtml(table.table_name)} <span class="badge text-bg-light float-end">${escapeHtml(table.status || 'available')}</span></button>`).join('')}
          </div>
        </section>
      </div>
      <div class="col-xl-5">
        <section class="pos-card h-100">
          <div class="input-group input-group-lg mb-3"><span class="input-group-text"><i class="fa-solid fa-search"></i></span><input class="form-control" id="waiter-search" placeholder="Search product"></div>
          <div class="waiter-product-grid" id="waiter-products"></div>
        </section>
      </div>
      <div class="col-xl-4">
        <section class="pos-card cart-panel mb-3">
          <div class="d-flex justify-content-between align-items-center mb-2"><h2 class="section-title mb-0">Current Order</h2><strong id="waiter-cart-total">${money(0)}</strong></div>
          <label class="form-label">Waiter</label>
          <select class="form-select mb-3" id="waiter-user-select">
            ${waiterOptions(waiters, selectedWaiterId)}
          </select>
          <div id="waiter-cart"></div>
          <div class="row g-2 mt-3 waiter-send-actions">
            <div class="col-6">
              <button class="btn btn-primary-gradient w-100" id="send-kitchen"><i class="fa-solid fa-utensils"></i> Send to Kitchen</button>
            </div>
            <div class="col-6">
              <button class="btn btn-outline-primary w-100" id="send-store"><i class="fa-solid fa-boxes-stacked"></i> Send to Store</button>
            </div>
          </div>
        </section>
        <section class="pos-card mb-3"><h2 class="section-title">Ready Alerts</h2><div id="waiter-alerts"></div></section>
        <section class="pos-card"><div class="d-flex justify-content-between align-items-center mb-2"><h2 class="section-title mb-0">Table Order Status</h2><button class="btn btn-sm btn-outline-primary" id="refresh-waiter-status"><i class="fa-solid fa-rotate"></i></button></div><div id="waiter-order-status"></div></section>
      </div>
    </div>
  `;
  await renderWaiterProducts();
  renderWaiterCart();
  await renderReadyAlerts();
  await renderOrderStatus();
  $('#waiter-user-select').addEventListener('change', (event) => {
    selectedWaiterId = event.target.value;
  });
  $('#view').onclick = async (event) => {
    const tableId = event.target.closest('[data-table]')?.dataset.table;
    const productId = event.target.closest('[data-product]')?.dataset.product;
    const removeId = event.target.closest('[data-waiter-remove]')?.dataset.waiterRemove;
    const qtyButton = event.target.closest('[data-waiter-qty]');
    if (tableId) {
      selectedTableId = Number(tableId);
      return renderWaiterOrders();
    }
    if (productId) {
      const product = (await db.getProducts()).find(item => Number(item.id) === Number(productId));
      if (!product) return;
      if (availableStock(product) <= 0) return toast(stockMessage(product), 'warning');
      const existing = waiterCart.find(item => Number(item.id) === Number(product.id));
      const candidate = existing
        ? { ...existing, quantity: Number(existing.quantity || 0) + 1 }
        : waiterOrderItem(product);
      if (!hasEnoughStock(candidate)) return toast(stockMessage(candidate), 'warning');
      if (existing) existing.quantity = Number(existing.quantity || 0) + 1;
      else waiterCart.push(candidate);
      return renderWaiterCart();
    }
    if (removeId) {
      waiterCart = waiterCart.filter(item => Number(item.id) !== Number(removeId));
      return renderWaiterCart();
    }
    if (qtyButton) {
      const item = waiterCart.find(row => Number(row.id) === Number(qtyButton.dataset.waiterQty));
      if (item) {
        const previous = Number(item.quantity || 0);
        item.quantity = Math.max(0, previous + Number(qtyButton.dataset.delta));
        if (!hasEnoughStock(item)) {
          item.quantity = previous;
          toast(stockMessage(item), 'warning');
        }
      }
      return renderWaiterCart();
    }
  };
  $('#view').onchange = (event) => {
    const input = event.target.closest('[data-waiter-quantity]');
    if (!input) return;
    const item = waiterCart.find(row => Number(row.id) === Number(input.dataset.waiterQuantity));
    if (!item) return;
    const previous = Number(item.quantity || 0);
    item.quantity = Math.max(0, Number(input.value || 0));
    if (!hasEnoughStock(item)) {
      item.quantity = previous;
      input.value = formatWaiterQty(previous);
      toast(stockMessage(item), 'warning');
    }
    renderWaiterCart();
  };
  $('#waiter-search').addEventListener('input', debounce(event => renderWaiterProducts(event.target.value)));
  $('#send-kitchen').addEventListener('click', () => sendOrderToStations(['kitchen'], waiters));
  $('#send-store').addEventListener('click', () => sendOrderToStations(['store'], waiters));
  $('#refresh-waiter-status').addEventListener('click', async () => {
    await renderReadyAlerts();
    await renderOrderStatus();
  });
};
