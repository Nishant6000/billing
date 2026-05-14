import { db } from '../js/db.js';
import { $, debounce, escapeHtml, money } from '../js/utils.js';
import { closeModal, showModal, toast } from '../js/ui.js';

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

const productForm = (product = {}, categories = []) => `
  <div class="modal-header"><h5 class="modal-title">${product.id ? 'Edit' : 'Add'} Product</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
  <form id="product-form">
    <div class="modal-body">
      <input type="hidden" name="id" value="${product.id || ''}">
      <input type="hidden" name="image" id="product-image-value" value="${escapeHtml(product.image || '')}">
      <div class="row g-3">
        <div class="col-md-6"><label class="form-label">Product name</label><input class="form-control" name="product_name" value="${escapeHtml(product.product_name || '')}" required></div>
        <div class="col-md-3"><label class="form-label">Barcode</label><input class="form-control" name="barcode" value="${escapeHtml(product.barcode || '')}"></div>
        <div class="col-md-3"><label class="form-label">Category</label><select class="form-select" name="category_id">${categories.map(c => `<option value="${c.id}" ${Number(c.id) === Number(product.category_id) ? 'selected' : ''}>${escapeHtml(c.category_name)}</option>`).join('')}</select></div>
        <div class="col-md-3"><label class="form-label">Selling price</label><input class="form-control" name="selling_price" type="number" step="0.01" value="${product.selling_price || 0}" required></div>
        <div class="col-md-3"><label class="form-label">Discount Type</label><select class="form-select" name="product_discount_type"><option value="none">No Discount</option><option value="amount" ${product.product_discount_type === 'amount' ? 'selected' : ''}>Amount</option><option value="percent" ${product.product_discount_type === 'percent' ? 'selected' : ''}>Percentage</option></select></div>
        <div class="col-md-3"><label class="form-label">Discount Value</label><input class="form-control" name="product_discount_value" type="number" min="0" step="0.01" value="${product.product_discount_value || 0}"></div>
        <div class="col-md-3"><label class="form-label">GST %</label><input class="form-control" name="gst_percent" type="number" step="0.01" value="${product.gst_percent || 0}"></div>
        <div class="col-md-3"><label class="form-label">Stock</label><input class="form-control" name="stock" type="number" value="${product.stock || 0}"></div>
        <div class="col-md-3"><label class="form-label">Shelf No</label><input class="form-control" name="shelf_no" value="${escapeHtml(product.shelf_no || '')}" pattern="[A-Za-z0-9-]*" title="Use letters, numbers, or hyphen only"></div>
        <div class="col-md-3"><label class="form-label">Box No</label><input class="form-control" name="box_no" value="${escapeHtml(product.box_no || '')}" pattern="[A-Za-z0-9-]*" title="Use letters, numbers, or hyphen only"></div>
        <div class="col-md-6"><label class="form-label">Description</label><textarea class="form-control" name="description" rows="2">${escapeHtml(product.description || '')}</textarea></div>
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
          <label class="form-label">Upload photo</label>
          <input class="form-control" id="product-image-upload" type="file" accept="image/*">
        </div>
        <div class="col-12">
          <div class="product-upload-preview" id="product-image-preview">
            ${product.image
              ? `<img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.product_name || 'Product photo')}">`
              : '<div><i class="fa-solid fa-image"></i><span>No photo uploaded</span></div>'}
          </div>
        </div>
      </div>
    </div>
    <div class="modal-footer"><button class="btn btn-light" data-bs-dismiss="modal" type="button">Cancel</button><button class="btn btn-primary-gradient">Save Product</button></div>
  </form>
`;

const renderRows = async (search = '') => {
  const products = await db.getProducts(search);
  $('#products-body').innerHTML = products.map(product => `
    <tr class="touch-row">
      <td><strong>${escapeHtml(product.product_name)}</strong><div class="text-muted small">${escapeHtml(product.barcode || 'No barcode')}</div></td>
      <td>${escapeHtml(product.category_name || '-')}</td>
      <td>${money(product.selling_price)}<div class="text-muted small">${productDiscountLabel(product)}</div></td>
      <td>${product.gst_percent}%</td>
      <td>${product.stock}<div class="text-muted small">Shelf ${escapeHtml(product.shelf_no || '-')} | Box ${escapeHtml(product.box_no || '-')}</div><div class="text-muted small">Billing: ${billingDisplayLabel(product.billing_display)}</div></td>
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
        <div><h2 class="section-title mb-1">Products</h2><p class="text-muted mb-0">Manage categories, barcode, GST, price, and stock.</p></div>
        <button class="btn btn-primary-gradient" id="add-product"><i class="fa-solid fa-plus"></i> Add Product</button>
      </div>
      <div class="row g-2 mb-3">
        <div class="col-md-8"><input class="form-control" id="product-search" placeholder="Search by product name or barcode"></div>
        <div class="col-md-4"><button class="btn btn-outline-secondary w-100" id="add-category"><i class="fa-solid fa-tags"></i> Add Category</button></div>
      </div>
      <div class="table-responsive">
        <table class="table">
          <thead><tr><th>Product</th><th>Category</th><th>Price</th><th>GST</th><th>Stock / Location</th><th></th></tr></thead>
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
      barcode: form.barcode.trim(),
      selling_price: Number(form.selling_price),
      product_discount_type: form.product_discount_type || 'none',
      product_discount_value: Number(form.product_discount_value || 0),
      gst_percent: Number(form.gst_percent),
      stock: Number(form.stock),
      shelf_no: form.shelf_no.trim(),
      box_no: form.box_no.trim(),
      description: form.description.trim(),
      billing_display: billingDisplay,
      image: form.image.trim()
    });
    closeModal();
    toast('Product saved');
    await renderRows($('#product-search')?.value || '');
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
