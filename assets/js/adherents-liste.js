(function () {
  'use strict';

  const { api, escapeHtml, euro, statusBadge, paidBadge, emptyRow, qs } = window.Club;

  const tbody = qs('table.table-liste tbody');
  if (!tbody) return;

  const filter = qs('#filter-statut');
  const search = qs('#search');
  const feedback = qs('#list-feedback');
  const count = qs('#result-count');

  let members = [];

  const row = (m) => `
    <tr data-id="${m.id}">
      <td><a href="adherent-detail.html?id=${m.id}">${escapeHtml(`${m.prenom} ${m.nom}`)}</a></td>
      <td>${escapeHtml(m.email)}</td>
      <td>${escapeHtml(m.telephone)}</td>
      <td>${escapeHtml(m.nom_activite || 'No activity')}</td>
      <td>${paidBadge(m.statut)}</td>
      <td class="actions-cell">
        <a class="btn btn-sm btn-secondary" href="adherent-detail.html?id=${m.id}">View</a>
        <a class="btn btn-sm btn-secondary" href="adherent-form.html?id=${m.id}">Edit</a>
        <button class="btn btn-sm btn-danger" type="button" data-delete="${m.id}">Delete</button>
      </td>
    </tr>`;

  function render() {
    const term = (search && search.value ? search.value : '').trim().toLowerCase();
    const statut = filter && filter.value ? filter.value : '';

    const rows = members.filter((m) => {
      if (statut && m.statut !== statut) return false;
      if (!term) return true;
      return `${m.prenom} ${m.nom} ${m.email} ${m.nom_activite || ''}`.toLowerCase().includes(term);
    });

    tbody.innerHTML = rows.length
      ? rows.map(row).join('')
      : emptyRow(6, members.length ? 'No member matches your search.' : 'No member registered yet.');

    if (count) {
      count.textContent = members.length
        ? `${rows.length} of ${members.length} member${members.length > 1 ? 's' : ''}`
        : '0 members';
    }
  }

  async function load() {
    try {
      members = await api('/api/adherents');
      render();
    } catch (e) {
      tbody.innerHTML = emptyRow(6, e.message);
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
    const member = members.find((m) => String(m.id) === String(id));
    if (!confirm(`Delete ${member ? `${member.prenom} ${member.nom}` : 'this member'} permanently?`)) return;

    btn.disabled = true;
    try {
      await api(`/api/adherents/${id}`, { method: 'DELETE' });
      members = members.filter((m) => String(m.id) !== String(id));
      render();
    } catch (e) {
      alert(e.message);
      btn.disabled = false;
    }
  });

  if (filter) filter.addEventListener('change', render);
  if (search) search.addEventListener('input', render);

  load();
})();
