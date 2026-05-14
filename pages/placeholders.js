import { $ } from '../js/utils.js';

export const renderPlaceholder = async (title, icon, items) => {
  $('#view').innerHTML = `
    <div class="pos-card">
      <div class="empty-state">
        <div>
          <i class="fa-solid ${icon} fa-3x mb-3 text-primary"></i>
          <h4 class="fw-bold">${title} Module</h4>
          <p class="text-muted">Placeholder pages are prepared for the next phase.</p>
          <div class="row g-3 mt-2">
            ${items.map(item => `<div class="col-md-4"><div class="metric-card"><h5>${item}</h5><p>Coming later</p></div></div>`).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
};
