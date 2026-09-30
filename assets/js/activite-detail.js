(function () {
  'use strict';

  const { api, escapeHtml, euro, statusBadge, iconFor, CATEGORY_LABELS, setFeedback, emptyRow, qs } = window.Club;

  const id = Number(new URLSearchParams(window.location.search).get('id'));
  const fields = qs('#detail-fields');
  const members = qs('#detail-members');
  if (!fields) return;

  const title = qs('#detail-title');
  const icon = qs('#detail-icon');
  const summary = qs('#detail-summary');
  const editLink = qs('#edit-link');
  const deleteBtn = qs('#delete-btn');
  const feedback = qs('#detail-feedback');

  const row = (label, value) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`;

  function renderMembers(list) {
    members.innerHTML = list.length
      ? list
          .map(
            (m) => `
      <tr>
        <td><a href="adherent-detail.html?id=${m.id}">${escapeHtml(`${m.prenom} ${m.nom}`)}</a></td>
        <td>${escapeHtml(m.email)}</td>
        <td>${statusBadge(m.statut)}</td>
        <td class="actions-cell">
          <a class="btn btn-sm btn-secondary" href="adherent-detail.html?id=${m.id}">View</a>
        </td>
      </tr>`
          )
          .join('')
      : emptyRow(4, 'No member enrolled in this activity yet.');
  }

  function render(a) {
    document.title = `Sports Club - Back Office - ${a.nom_activite}`;
    title.textContent = a.nom_activite;
    icon.innerHTML = iconFor(a.nom_activite);
    summary.textContent = a.description || 'No description provided.';
    editLink.href = `activite-form.html?id=${a.id}`;

    qs('#stat-places').textContent = a.places;
    qs('#stat-inscrits').textContent = a.inscrits;
    qs('#stat-restantes').textContent = Math.max(0, a.places - a.inscrits);

    fields.innerHTML = [
      row('Category', CATEGORY_LABELS[a.categorie] || a.categorie),
      row('Day', a.jour),
      row('Time', a.horaire),
      row('Fee (per month)', euro(a.tarif)),
      row('Number of Places', a.places),
      row('Slug', a.slug),
    ].join('');

    renderMembers(a.membres || []);
  }

  async function load() {
    if (!Number.isInteger(id) || id <= 0) {
      setFeedback(feedback, 'error', 'No activity id provided in the URL.');
      fields.innerHTML = emptyRow(2, 'Invalid request.');
      members.innerHTML = '';
      if (deleteBtn) deleteBtn.hidden = true;
      return;
    }

    try {
      render(await api(`/api/activites/${id}`));
    } catch (e) {
      setFeedback(feedback, 'error', e.message);
      title.textContent = 'Activity not found';
      summary.textContent = 'This activity could not be loaded.';
      fields.innerHTML = emptyRow(2, 'Activity not found.');
      members.innerHTML = '';
      if (editLink) editLink.hidden = true;
      if (deleteBtn) deleteBtn.hidden = true;
    }
  }

  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      const warning = ` Members assigned to it will be unassigned.`;
      if (!confirm(`Delete ${title.textContent}?${warning}`)) return;
      deleteBtn.disabled = true;
      try {
        await api(`/api/activites/${id}`, { method: 'DELETE' });
        window.location.href = 'activites-liste.html';
      } catch (e) {
        setFeedback(feedback, 'error', e.message);
        deleteBtn.disabled = false;
      }
    });
  }

  load();
})();
