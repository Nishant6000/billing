import { $, escapeHtml } from './utils.js';

export const setTitle = (title) => {
  $('#page-title').textContent = title;
  document.title = `${title} | Offline First POS`;
};

export const toast = (message, variant = 'success') => {
  const container = $('#toast-container');
  const id = `toast-${Date.now()}`;
  container.insertAdjacentHTML('beforeend', `
    <div id="${id}" class="toast align-items-center text-bg-${variant} border-0" role="alert" aria-live="assertive" aria-atomic="true">
      <div class="d-flex">
        <div class="toast-body">${escapeHtml(message)}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
    </div>
  `);
  const el = document.getElementById(id);
  const instance = bootstrap.Toast.getOrCreateInstance(el, { delay: 2600 });
  instance.show();
  el.addEventListener('hidden.bs.toast', () => el.remove());
};

export const showModal = (html) => {
  $('#app-modal-content').innerHTML = html;
  const modal = bootstrap.Modal.getOrCreateInstance($('#app-modal'));
  modal.show();
  return modal;
};

export const closeModal = () => bootstrap.Modal.getOrCreateInstance($('#app-modal')).hide();

export const spinner = (label = 'Loading') => `
  <div class="empty-state">
    <div>
      <div class="spinner-border text-primary mb-3" role="status"></div>
      <div>${escapeHtml(label)}</div>
    </div>
  </div>
`;

export const emptyState = (icon, title, text = '') => `
  <div class="empty-state">
    <div>
      <i class="fa-solid ${icon} fa-3x mb-3 text-primary"></i>
      <h5 class="fw-bold">${escapeHtml(title)}</h5>
      <p>${escapeHtml(text)}</p>
    </div>
  </div>
`;
