(function () {
  'use strict';

  const { api, escapeHtml, euro, CATEGORY_LABELS, iconFor, emptyRow, qs } = window.Club;

  const tbody = qs('table.table-liste tbody');
  if (!tbody) return;

  const feedback = qs('#list-feedback');
  const search = qs('#search');
  const count = qs('#result-count');
  let activities = [];

  const row = (a) => {
    const remaining = a.places_restantes;
    const placesCell =
      remaining <= 0
        ? '<span class="badge badge-danger">Full</span>'
        : `${a.inscrits} / ${a.places}`;
    return `
    <tr data-id="${a.id}">
      <td class="col-icon" aria-hidden="true">${iconFor(a.nom_activite)}</td>
      <td><a href="activite-detail.html?id=${a.id}">${escapeHtml(a.nom_activite)}</a></td>
      <td>${escapeHtml(CATEGORY_LABELS[a.categorie] || a.categorie)}</td>
      <td>${escapeHtml(a.jour)}</td>
      <td class="num">${escapeHtml(euro(a.tarif))}</td>
      <td class="num">${placesCell}</td>
      <td class="actions-cell">
        <a class="btn btn-sm btn-secondary" href="activite-detail.html?id=${a.id}">View</a>
        <a class="btn btn-sm btn-secondary" href="activite-form.html?id=${a.id}">Edit</a>
        <button class="btn btn-sm btn-danger" type="button" data-delete="${a.id}">Delete</button>
      </td>
    </tr>`;
  };

  function render() {
    const term = (search && search.value ? search.value : '').trim().toLowerCase();
    const rows = term
      ? activities.filter((a) =>
          `${a.nom_activite} ${a.categorie} ${a.jour}`.toLowerCase().includes(term)
        )
      : activities;

    tbody.innerHTML = rows.length
      ? rows.map(row).join('')
      : emptyRow(7, activities.length ? 'No activity matches your search.' : 'No activity defined yet.');

    if (count) {
      count.textContent = activities.length
        ? `${rows.length} of ${activities.length} activit${activities.length > 1 ? 'ies' : 'y'}`
        : '0 activities';
    }
  }

  async function load() {
    try {
      activities = await api('/api/activites');
      render();
    } catch (e) {
      tbody.innerHTML = emptyRow(7, e.message);
      if (feedback) {
        feedback.textContent = e.message;
        feedback.className = 'form-feedback form-feedback--error';
        feedback.hidden = false;
      }
    }
  }

  tbody.addEventListener('click', async (event) => {
    const btn = event.target.closest('[data-delete]');
    if (!btn) return;
    const id = btn.dataset.delete;
    const item = activities.find((a) => String(a.id) === String(id));
    const name = item ? item.nom_activite : 'this activity';

    const warning =
      item && item.inscrits > 0
        ? `\n\n${item.inscrits} member(s) are assigned to it and will be unassigned.`
        : '';
    if (!confirm(`Delete ${name}?${warning}`)) return;

    btn.disabled = true;
    try {
      const res = await api(`/api/activites/${id}`, { method: 'DELETE' });
      activities = activities.filter((a) => String(a.id) !== String(id));
      render();
      if (res.orphans > 0 && feedback) {
        feedback.textContent = `${name} deleted. ${res.orphans} member(s) were unassigned.`;
        feedback.className = 'form-feedback form-feedback--warning';
        feedback.hidden = false;
      }
    } catch (e) {
      alert(e.message);
      btn.disabled = false;
    }
  });

  if (search) search.addEventListener('input', render);

  load();
})();
