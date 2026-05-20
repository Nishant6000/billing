import { db } from '../js/db.js';
import { $, UNIT_GROUPS, debounce, escapeHtml, formatBasePrice, formatPackingChain, money, parsePackageUnits } from '../js/utils.js';
import { closeModal, showModal, toast } from '../js/ui.js';
import { localizedProductName, t } from '../js/i18n.js';

const billingDisplayOptions = [
  { value: 'stock', label: 'Stock' },
  { value: 'gst', label: 'GST' },
  { value: 'shelf_no', label: 'Shelf No' },
  { value: 'box_no', label: 'Box No' },
  { value: 'description', label: 'Description' }
];

const selectedBillingDisplays = (value = 'stock') => {
  const selected = String(value || 'stock').split(',').map(item => item.trim()).filter(Boolean);
  return selected.length ? selected : ['stock'];
};

const unitOptionsMarkup = (selected = 'Piece') => Object.entries(UNIT_GROUPS).map(([group, units]) => `
  <optgroup label="${group.charAt(0).toUpperCase() + group.slice(1)}">
    ${Object.keys(units).map(unit => `<option value="${unit}" ${unit === selected ? 'selected' : ''}>${unit}</option>`).join('')}
  </optgroup>
`).join('');

const productForm = (product = {}, categories = []) => {
  const packageUnits = parsePackageUnits(product.package_units_json);
  return `
  <div class="modal-header"><h5 class="modal-title">${product.id ? 'Edit' : 'Add'} ${t('product')}</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
  <form id="product-form">
    <div class="modal-body">
      <input type="hidden" name="id" value="${product.id || ''}">
      <input type="hidden" name="image" id="product-image-value" value="${escapeHtml(product.image || '')}">
      <div class="row g-3">
        <div class="col-md-6"><label class="form-label">${t('productName')}</label><input class="form-control" name="product_name" value="${escapeHtml(product.product_name || '')}" required></div>
        <div class="col-md-3"><label class="form-label">${t('barcode')}</label><input class="form-control" name="barcode" value="${escapeHtml(product.barcode || '')}"></div>
        <div class="col-md-3"><label class="form-label">${t('category')}</label><select class="form-select" name="category_id">${categories.map(c => `<option value="${c.id}" ${Number(c.id) === Number(product.category_id) ? 'selected' : ''}>${escapeHtml(c.category_name)}</option>`).join('')}</select></div>
        <div class="col-12">
          <div class="packing-panel">
            <div class="d-flex align-items-center gap-2 mb-2">
              <i class="fa-solid fa-language text-primary"></i>
              <strong>Product names in other languages</strong>
            </div>
            <div class="row g-3">
              <div class="col-md-4"><label class="form-label">Hindi</label><input class="form-control" name="product_name_hi" value="${escapeHtml(product.product_name_hi || '')}"></div>
              <div class="col-md-4"><label class="form-label">Tamil</label><input class="form-control" name="product_name_ta" value="${escapeHtml(product.product_name_ta || '')}"></div>
              <div class="col-md-4"><label class="form-label">Telugu</label><input class="form-control" name="product_name_te" value="${escapeHtml(product.product_name_te || '')}"></div>
              <div class="col-md-4"><label class="form-label">Marathi</label><input class="form-control" name="product_name_mr" value="${escapeHtml(product.product_name_mr || '')}"></div>
              <div class="col-md-4"><label class="form-label">Malayalam</label><input class="form-control" name="product_name_ml" value="${escapeHtml(product.product_name_ml || '')}"></div>
              <div class="col-md-4"><label class="form-label">Kannada</label><input class="form-control" name="product_name_kn" value="${escapeHtml(product.product_name_kn || '')}"></div>
            </div>
          </div>
        </div>
        <div class="col-md-3"><label class="form-label">${t('basePrice')}</label><input class="form-control" name="selling_price" type="number" step="0.01" value="${product.selling_price || 0}" required></div>
        <div class="col-md-3"><label class="form-label">${t('baseQuantity')}</label><input class="form-control" name="base_quantity" type="number" min="0.001" step="0.001" value="${product.base_quantity || 1}" required></div>
        <div class="col-md-3"><label class="form-label">${t('baseUnit')}</label><select class="form-select" name="base_unit">${unitOptionsMarkup(product.base_unit || 'Piece')}</select></div>
        <div class="col-12 d-none" id="packing-fields">
          <div class="packing-panel">
            <div class="d-flex align-items-center gap-2 mb-2">
              <i class="fa-solid fa-boxes-stacked text-primary"></i>
              <strong>Packing Conversion</strong>
            </div>
            <div class="row g-3">
              <div class="col-md-4" data-packing-field="packets_per_box">
                <label class="form-label">Packets per Box</label>
                <input class="form-control" name="packets_per_box" type="number" min="0" step="1" value="${packageUnits.packets_per_box || ''}">
              </div>
              <div class="col-md-4" data-packing-field="sheets_per_packet">
                <label class="form-label">Sheets per Packet</label>
                <input class="form-control" name="sheets_per_packet" type="number" min="0" step="1" value="${packageUnits.sheets_per_packet || ''}">
              </div>
              <div class="col-md-4" data-packing-field="tablets_per_sheet">
                <label class="form-label">Tablets per Sheet</label>
                <input class="form-control" name="tablets_per_sheet" type="number" min="0" step="1" value="${packageUnits.tablets_per_sheet || ''}">
              </div>
            </div>
          </div>
        </div>
        <div class="col-md-3"><label class="form-label">${t('discountType')}</label><select class="form-select" name="product_discount_type"><option value="none">No Discount</option><option value="amount" ${product.product_discount_type === 'amount' ? 'selected' : ''}>Amount</option><option value="percent" ${product.product_discount_type === 'percent' ? 'selected' : ''}>Percentage</option></select></div>
        <div class="col-md-3"><label class="form-label">${t('discountValue')}</label><input class="form-control" name="product_discount_value" type="number" min="0" step="0.01" value="${product.product_discount_value || 0}"></div>
        <div class="col-md-3"><label class="form-label">GST %</label><input class="form-control" name="gst_percent" type="number" step="0.01" value="${product.gst_percent || 0}"></div>
        <div class="col-md-3"><label class="form-label">${t('stock')}</label><input class="form-control" name="stock" type="number" value="${product.stock || 0}"></div>
        <div class="col-md-3"><label class="form-label">Order Station</label><select class="form-select" name="fulfillment_station"><option value="kitchen" ${product.fulfillment_station !== 'store' ? 'selected' : ''}>Kitchen</option><option value="store" ${product.fulfillment_station === 'store' ? 'selected' : ''}>Store Room</option></select></div>
        <div class="col-md-3"><label class="form-label">${t('shelfNo')}</label><input class="form-control" name="shelf_no" value="${escapeHtml(product.shelf_no || '')}" pattern="[A-Za-z0-9-]*" title="Use letters, numbers, or hyphen only"></div>
        <div class="col-md-3"><label class="form-label">${t('boxNo')}</label><input class="form-control" name="box_no" value="${escapeHtml(product.box_no || '')}" pattern="[A-Za-z0-9-]*" title="Use letters, numbers, or hyphen only"></div>
        <div class="col-md-6"><label class="form-label">${t('description')}</label><textarea class="form-control" name="description" rows="2">${escapeHtml(product.description || '')}</textarea></div>
        <div class="col-md-6">
          <label class="form-label">Show in Billing Product Card</label>
          <div class="billing-display-options">
            ${billingDisplayOptions.map(option => `
              <label class="billing-display-option">
                <input type="checkbox" name="billing_display" value="${option.value}" ${selectedBillingDisplays(product.billing_display).includes(option.value) ? 'checked' : ''}>
                <span>${option.label}</span>
              </label>
            `).join('')}
          </div>
        </div>
        <div class="col-md-3">
          <label class="form-label">${t('uploadPhoto')}</label>
          <input class="form-control" id="product-image-upload" type="file" accept="image/*">
        </div>
        <div class="col-12">
          <div class="product-upload-preview" id="product-image-preview">
            ${product.image
              ? `<img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.product_name || 'Product photo')}">`
              : `<div><i class="fa-solid fa-image"></i><span>${t('noPhotoUploaded')}</span></div>`}
          </div>
        </div>
      </div>
    </div>
    <div class="modal-footer"><button class="btn btn-light" data-bs-dismiss="modal" type="button">${t('cancel')}</button><button class="btn btn-primary-gradient">${t('saveProduct')}</button></div>
  </form>
`;
};

const renderRows = async (search = '') => {
  const products = await db.getProducts(search);
  $('#products-body').innerHTML = products.map(product => `
    <tr class="touch-row">
      <td><strong>${escapeHtml(localizedProductName(product))}</strong>${localizedProductName(product) !== product.product_name ? `<div class="text-muted small">${escapeHtml(product.product_name)}</div>` : ''}<div class="text-muted small">${escapeHtml(product.barcode || 'No barcode')}</div></td>
      <td>${escapeHtml(product.category_name || '-')}</td>
      <td>${formatBasePrice(product)}<div class="text-muted small">${productDiscountLabel(product)}</div>${formatPackingChain(product) ? `<div class="text-muted small">${escapeHtml(formatPackingChain(product))}</div>` : ''}</td>
      <td>${product.gst_percent}%</td>
      <td>${product.stock}<div class="text-muted small">Shelf ${escapeHtml(product.shelf_no || '-')} | Box ${escapeHtml(product.box_no || '-')}</div><div class="text-muted small">Station: ${product.fulfillment_station === 'store' ? 'Store Room' : 'Kitchen'}</div><div class="text-muted small">Billing: ${billingDisplayLabel(product.billing_display)}</div></td>
      <td class="text-end">
        <button class="btn btn-sm btn-outline-primary" data-edit="${product.id}"><i class="fa-solid fa-pen"></i></button>
        <button class="btn btn-sm btn-outline-danger" data-delete="${product.id}"><i class="fa-solid fa-trash"></i></button>
      </td>
    </tr>
  `).join('');
};

export const renderProducts = async () => {
  $('#view').innerHTML = `
    <div class="pos-card">
      <div class="d-flex flex-wrap gap-2 justify-content-between align-items-center mb-3">
        <div><h2 class="section-title mb-1">${t('route.products')}</h2><p class="text-muted mb-0">${t('productsHelp')}</p></div>
        <button class="btn btn-primary-gradient" id="add-product"><i class="fa-solid fa-plus"></i> ${t('addProduct')}</button>
      </div>
      <div class="row g-2 mb-3">
        <div class="col-md-8"><input class="form-control" id="product-search" placeholder="${t('searchProductBarcode')}"></div>
        <div class="col-md-4"><button class="btn btn-outline-secondary w-100" id="add-category"><i class="fa-solid fa-tags"></i> ${t('addCategory')}</button></div>
      </div>
      <div class="table-responsive">
        <table class="table">
          <thead><tr><th>${t('product')}</th><th>${t('category')}</th><th>${t('price')}</th><th>GST</th><th>${t('stockLocation')}</th><th></th></tr></thead>
          <tbody id="products-body"></tbody>
        </table>
      </div>
    </div>
  `;
  await renderRows();

  $('#product-search').addEventListener('input', debounce(event => renderRows(event.target.value)));
  $('#add-product').addEventListener('click', async () => openProductModal());
  $('#add-category').addEventListener('click', async () => {
    const name = prompt('Category name');
    if (name) {
      await db.saveCategory({ category_name: name.trim() });
      toast('Category saved');
    }
  });
  $('#products-body').addEventListener('click', async (event) => {
    const editId = event.target.closest('[data-edit]')?.dataset.edit;
    const deleteId = event.target.closest('[data-delete]')?.dataset.delete;
    if (editId) {
      const product = (await db.getProducts()).find(item => Number(item.id) === Number(editId));
      await openProductModal(product);
    }
    if (deleteId && confirm('Delete this product?')) {
      await db.deleteProduct(deleteId);
      toast('Product deleted', 'warning');
      await renderRows($('#product-search').value);
    }
  });
};

const openProductModal = async (product = {}) => {
  const categories = await db.getCategories();
  showModal(productForm(product, categories));
  updatePackingFields();
  $('[name="base_unit"]').addEventListener('change', updatePackingFields);
  $('#product-image-upload').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast('Please upload an image file', 'warning');
      event.target.value = '';
      return;
    }
    const image = await fileToDataUrl(file);
    $('#product-image-value').value = image;
    $('#product-image-preview').innerHTML = `<img src="${image}" alt="Product photo preview">`;
  });
  $('#product-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const form = Object.fromEntries(formData.entries());
    const billingDisplay = formData.getAll('billing_display').join(',') || 'stock';
    await db.saveProduct({
      id: form.id ? Number(form.id) : undefined,
      category_id: Number(form.category_id),
      product_name: form.product_name.trim(),
      product_name_hi: form.product_name_hi?.trim() || '',
      product_name_ta: form.product_name_ta?.trim() || '',
      product_name_te: form.product_name_te?.trim() || '',
      product_name_mr: form.product_name_mr?.trim() || '',
      product_name_ml: form.product_name_ml?.trim() || '',
      product_name_kn: form.product_name_kn?.trim() || '',
      barcode: form.barcode.trim(),
      selling_price: Number(form.selling_price),
      base_quantity: Number(form.base_quantity || 1),
      base_unit: form.base_unit || 'Piece',
      package_units_json: JSON.stringify({
        packets_per_box: Number(form.packets_per_box || 0),
        sheets_per_packet: Number(form.sheets_per_packet || 0),
        tablets_per_sheet: Number(form.tablets_per_sheet || 0)
      }),
      product_discount_type: form.product_discount_type || 'none',
      product_discount_value: Number(form.product_discount_value || 0),
      gst_percent: Number(form.gst_percent),
      stock: Number(form.stock),
      shelf_no: form.shelf_no.trim(),
      box_no: form.box_no.trim(),
      description: form.description.trim(),
      billing_display: billingDisplay,
      fulfillment_station: form.fulfillment_station || 'kitchen',
      image: form.image.trim()
    });
    closeModal();
    toast('Product saved');
    await renderRows($('#product-search')?.value || '');
  });
};

const updatePackingFields = () => {
  const baseUnit = $('[name="base_unit"]')?.value || 'Piece';
  const panel = $('#packing-fields');
  if (!panel) return;
  const visibleFields = {
    Box: ['packets_per_box', 'sheets_per_packet', 'tablets_per_sheet'],
    Packet: ['sheets_per_packet', 'tablets_per_sheet'],
    Sheet: ['tablets_per_sheet'],
    Tablet: []
  }[baseUnit] || [];
  panel.classList.toggle('d-none', !['Box', 'Packet', 'Sheet'].includes(baseUnit));
  ['packets_per_box', 'sheets_per_packet', 'tablets_per_sheet'].forEach(name => {
    const field = $(`[data-packing-field="${name}"]`);
    if (field) field.classList.toggle('d-none', !visibleFields.includes(name));
  });
};

const fileToDataUrl = async (file) => {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
};

const billingDisplayLabel = (value = 'stock') => selectedBillingDisplays(value)
  .map(item => billingDisplayOptions.find(option => option.value === item)?.label)
  .filter(Boolean)
  .join(', ') || 'Stock';

const productDiscountLabel = (product) => {
  const type = product.product_discount_type || 'none';
  const value = Number(product.product_discount_value || 0);
  if (type === 'percent' && value > 0) return `${value}% discount`;
  if (type === 'amount' && value > 0) return `${money(value)} discount`;
  return 'No discount';
};
