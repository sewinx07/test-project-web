(function () {
  'use strict';

  const { api, escapeHtml, euro, formatDate, statusBadge, paidBadge, setFeedback, emptyRow, qs } = window.Club;

  const id = Number(new URLSearchParams(window.location.search).get('id'));
  const fields = qs('#detail-fields');
  const activity = qs('#detail-activity');
  if (!fields) return;

  const title = qs('#detail-title');
  const eyebrow = qs('#detail-eyebrow');
  const summary = qs('#detail-summary');
  const badges = qs('#detail-badges');
  const editLink = qs('#edit-link');
  const deleteBtn = qs('#delete-btn');
  const feedback = qs('#detail-feedback');

  const row = (label, value) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`;

  function renderActivity(m) {
    if (!m.activite_id) {
      activity.innerHTML = emptyRow(5, 'This member is not assigned to an activity yet.');
      return;
    }
    activity.innerHTML = `
      <tr>
        <td><a href="activite-detail.html?id=${m.activite_id}">${escapeHtml(m.nom_activite)}</a></td>
        <td>${escapeHtml(m.jour || '--')}</td>
        <td class="num">${escapeHtml(euro(m.tarif))}</td>
        <td>${paidBadge(m.statut)}</td>
        <td class="actions-cell">
          <a class="btn btn-sm btn-secondary" href="activite-detail.html?id=${m.activite_id}">View</a>
        </td>
      </tr>`;
  }

  function render(m) {
    const fullName = `${m.prenom} ${m.nom}`;

    document.title = `Sports Club - Back Office - ${fullName}`;
    title.textContent = fullName;
    eyebrow.textContent = `Member #${m.id}`;
    summary.textContent = `Registered on ${formatDate(m.created_at)}.`;
    badges.innerHTML = `${statusBadge(m.statut)} ${paidBadge(m.statut)}`;
    editLink.href = `adherent-form.html?id=${m.id}`;

    fields.innerHTML = [
      row('First Name', m.prenom),
      row('Last Name', m.nom),
      row('Email', m.email),
      row('Phone', m.telephone),
      row('Date of Birth', formatDate(m.date_naissance)),
      row('Address', m.adresse),
      row('Status', m.statut),
      row('Activity', m.nom_activite || 'None'),
    ].join('');

    renderActivity(m);
  }

  async function load() {
    if (!Number.isInteger(id) || id <= 0) {
      setFeedback(feedback, 'error', 'No member id provided in the URL.');
      fields.innerHTML = emptyRow(2, 'Invalid request.');
      activity.innerHTML = '';
      if (deleteBtn) deleteBtn.hidden = true;
      return;
    }

    try {
      render(await api(`/api/adherents/${id}`));
    } catch (e) {
      setFeedback(feedback, 'error', e.message);
      title.textContent = 'Member not found';
      summary.textContent = 'This member could not be loaded.';
      fields.innerHTML = emptyRow(2, 'Member not found.');
      activity.innerHTML = '';
      if (editLink) editLink.hidden = true;
      if (deleteBtn) deleteBtn.hidden = true;
    }
  }

  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      if (!confirm(`Delete ${title.textContent} permanently?`)) return;
      deleteBtn.disabled = true;
      try {
        await api(`/api/adherents/${id}`, { method: 'DELETE' });
        window.location.href = 'adherents-liste.html';
      } catch (e) {
        setFeedback(feedback, 'error', e.message);
        deleteBtn.disabled = false;
      }
    });
  }

  load();
})();
