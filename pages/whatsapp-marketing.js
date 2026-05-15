import { db } from '../js/db.js';
import { $, debounce, downloadFile, escapeHtml, toCSV } from '../js/utils.js';
import { toast } from '../js/ui.js';

let contacts = [];
let selectedPhones = new Set();
let currentIndex = 0;

const cleanPhone = (value = '') => String(value).replace(/\D/g, '');

const messageFor = (template, contact, settings) => template
  .replaceAll('{name}', contact.name || 'Customer')
  .replaceAll('{phone}', contact.phone || '')
  .replaceAll('{shop}', settings.shop_name || 'Ginsoft POS Store');

const whatsappUrl = (phone, message) => `https://wa.me/${cleanPhone(phone)}?text=${encodeURIComponent(message)}`;

const uniqueContacts = (rows) => {
  const map = new Map();
  rows.forEach(row => {
    const phone = cleanPhone(row.phone);
    if (!phone) return;
    const existing = map.get(phone);
    map.set(phone, {
      name: row.name || existing?.name || 'Customer',
      phone,
      source: existing?.source ? `${existing.source}, ${row.source}` : row.source
    });
  });
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
};

const loadCustomers = async () => {
  const sales = await db.getSales();
  contacts = uniqueContacts(sales
    .filter(sale => sale.customer_phone)
    .map(sale => ({
      name: sale.customer_name || 'Customer',
      phone: sale.customer_phone,
      source: `Bill ${sale.invoice_no}`
    })));
  selectedPhones = new Set(contacts.map(contact => contact.phone));
};

const renderContactRows = (search = '') => {
  const filtered = contacts.filter(contact => `${contact.name} ${contact.phone} ${contact.source}`.toLowerCase().includes(search.toLowerCase()));
  $('#marketing-count').textContent = `${selectedPhones.size} selected / ${contacts.length} customers`;
  $('#marketing-body').innerHTML = filtered.length ? filtered.map(contact => `
    <tr class="touch-row">
      <td><input class="form-check-input" type="checkbox" data-select-contact="${contact.phone}" ${selectedPhones.has(contact.phone) ? 'checked' : ''}></td>
      <td><strong>${escapeHtml(contact.name)}</strong><div class="text-muted small">${escapeHtml(contact.source || 'Imported')}</div></td>
      <td>${escapeHtml(contact.phone)}</td>
      <td class="text-end"><button class="btn btn-sm btn-outline-success" data-send-one="${contact.phone}"><i class="fa-brands fa-whatsapp"></i></button></td>
    </tr>
  `).join('') : '<tr><td colspan="4" class="text-center text-muted py-4">No customers found. Add customer mobile numbers in Billing or import CSV.</td></tr>';
};

export const renderWhatsappMarketing = async () => {
  await loadCustomers();
  const savedTemplate = localStorage.getItem('pos-whatsapp-marketing-template') || 'Hello {name}, greetings from {shop}. We have new offers for you today.';
  $('#view').innerHTML = `
    <div class="row g-3">
      <div class="col-xl-5">
        <div class="pos-card">
          <h2 class="section-title">Marketing Message</h2>
          <label class="form-label">Message</label>
          <textarea class="form-control" id="marketing-message" rows="8" placeholder="Write your WhatsApp marketing message">${escapeHtml(savedTemplate)}</textarea>
          <div class="text-muted small mt-2">Use placeholders: <code>{name}</code>, <code>{phone}</code>, <code>{shop}</code></div>
          <div class="row g-2 mt-3">
            <div class="col-md-6">
              <label class="form-label">Upload Message (.txt)</label>
              <input class="form-control" id="message-upload" type="file" accept=".txt,text/plain">
            </div>
            <div class="col-md-6">
              <label class="form-label">Import Contacts CSV</label>
              <input class="form-control" id="contacts-upload" type="file" accept=".csv,text/csv">
            </div>
          </div>
          <div class="form-check mt-3">
            <input class="form-check-input" type="checkbox" id="marketing-consent">
            <label class="form-check-label" for="marketing-consent">I confirm these customers agreed to receive WhatsApp updates.</label>
          </div>
          <div class="d-grid gap-2 mt-3">
            <button class="btn btn-primary-gradient" id="open-next-whatsapp"><i class="fa-brands fa-whatsapp"></i> Open Next Selected Chat</button>
            <button class="btn btn-outline-success" id="open-all-whatsapp"><i class="fa-solid fa-list-check"></i> Prepare All Links</button>
            <button class="btn btn-outline-secondary" id="save-marketing-template"><i class="fa-solid fa-floppy-disk"></i> Save Template</button>
          </div>
        </div>
      </div>
      <div class="col-xl-7">
        <div class="pos-card">
          <div class="d-flex flex-wrap gap-2 justify-content-between align-items-center mb-3">
            <div><h2 class="section-title mb-1">Customers</h2><p class="text-muted mb-0" id="marketing-count"></p></div>
            <div class="d-flex gap-2 flex-wrap">
              <button class="btn btn-outline-primary" id="select-all-customers"><i class="fa-solid fa-check-double"></i> Select All</button>
              <button class="btn btn-outline-secondary" id="clear-customer-selection"><i class="fa-solid fa-xmark"></i> Clear</button>
              <button class="btn btn-outline-success" id="export-customers"><i class="fa-solid fa-download"></i> Export</button>
            </div>
          </div>
          <input class="form-control mb-3" id="marketing-search" placeholder="Search customer or mobile">
          <div class="table-responsive">
            <table class="table">
              <thead><tr><th></th><th>Customer</th><th>Mobile</th><th></th></tr></thead>
              <tbody id="marketing-body"></tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;
  bindMarketingEvents();
  renderContactRows();
};

const bindMarketingEvents = () => {
  $('#marketing-search').addEventListener('input', debounce(event => renderContactRows(event.target.value)));
  $('#marketing-body').addEventListener('change', (event) => {
    const phone = event.target.closest('[data-select-contact]')?.dataset.selectContact;
    if (!phone) return;
    event.target.checked ? selectedPhones.add(phone) : selectedPhones.delete(phone);
    renderContactRows($('#marketing-search').value);
  });
  $('#marketing-body').addEventListener('click', async (event) => {
    const phone = event.target.closest('[data-send-one]')?.dataset.sendOne;
    if (phone) await openContact(phone);
  });
  $('#select-all-customers').addEventListener('click', () => {
    selectedPhones = new Set(contacts.map(contact => contact.phone));
    renderContactRows($('#marketing-search').value);
  });
  $('#clear-customer-selection').addEventListener('click', () => {
    selectedPhones.clear();
    renderContactRows($('#marketing-search').value);
  });
  $('#save-marketing-template').addEventListener('click', () => {
    localStorage.setItem('pos-whatsapp-marketing-template', $('#marketing-message').value);
    toast('Marketing message saved');
  });
  $('#export-customers').addEventListener('click', () => {
    downloadFile('whatsapp-customers.csv', toCSV(contacts));
  });
  $('#open-next-whatsapp').addEventListener('click', openNextSelected);
  $('#open-all-whatsapp').addEventListener('click', prepareAllLinks);
  $('#message-upload').addEventListener('change', loadMessageFile);
  $('#contacts-upload').addEventListener('change', loadContactsFile);
};

const canSend = () => {
  if (!$('#marketing-consent').checked) {
    toast('Confirm customer WhatsApp consent before sending', 'warning');
    return false;
  }
  if (!$('#marketing-message').value.trim()) {
    toast('Enter a marketing message first', 'warning');
    return false;
  }
  return true;
};

const openContact = async (phone) => {
  if (!canSend()) return;
  const settings = await db.getSettings();
  const contact = contacts.find(row => row.phone === phone);
  if (!contact) return;
  window.open(whatsappUrl(phone, messageFor($('#marketing-message').value, contact, settings)), '_blank', 'noopener');
};

const openNextSelected = async () => {
  if (!canSend()) return;
  const selected = contacts.filter(contact => selectedPhones.has(contact.phone));
  if (!selected.length) return toast('Select at least one customer', 'warning');
  const contact = selected[currentIndex % selected.length];
  currentIndex += 1;
  await openContact(contact.phone);
  toast(`Opened ${contact.name}`);
};

const prepareAllLinks = async () => {
  if (!canSend()) return;
  const settings = await db.getSettings();
  const selected = contacts.filter(contact => selectedPhones.has(contact.phone));
  if (!selected.length) return toast('Select at least one customer', 'warning');
  const html = selected.map(contact => {
    const url = whatsappUrl(contact.phone, messageFor($('#marketing-message').value, contact, settings));
    return `<a class="btn btn-outline-success w-100 text-start mb-2" target="_blank" rel="noopener" href="${url}"><i class="fa-brands fa-whatsapp me-2"></i>${escapeHtml(contact.name)} - ${escapeHtml(contact.phone)}</a>`;
  }).join('');
  $('#marketing-body').innerHTML = `<tr><td colspan="4">${html}</td></tr>`;
  toast('WhatsApp links prepared');
};

const loadMessageFile = async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  $('#marketing-message').value = await file.text();
  toast('Message loaded');
};

const loadContactsFile = async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  const imported = text.split(/\r?\n/)
    .map(line => line.split(',').map(value => value.trim().replace(/^"|"$/g, '')))
    .filter(parts => parts.length >= 2)
    .map(([name, phone]) => ({ name, phone, source: 'CSV Import' }));
  contacts = uniqueContacts([...contacts, ...imported]);
  selectedPhones = new Set(contacts.map(contact => contact.phone));
  renderContactRows($('#marketing-search').value);
  toast('Contacts imported');
};
