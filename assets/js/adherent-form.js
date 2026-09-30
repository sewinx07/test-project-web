(function () {
  'use strict';

  const { api, fieldValues, markInvalid, setFeedback, clearFeedback, qs } = window.Club;

  const form = qs('#adherent-form');
  if (!form) return;

  const idField = qs('#id');
  const select = qs('#activite_id');
  const feedback = qs('#form-feedback');
  const submit = qs('#submit-btn');
  const title = qs('#form-title');
  const birth = qs('#date_naissance');

  const id = Number(new URLSearchParams(window.location.search).get('id'));
  const isEdit = Number.isInteger(id) && id > 0;
  if (isEdit && idField) idField.value = String(id);

  const maxBirthDate = () => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 16);
    return d.toISOString().slice(0, 10);
  };

  if (birth) birth.max = maxBirthDate();

  async function loadActivities() {
    try {
      const list = await api('/api/activites');
      select.innerHTML = '<option value="">-- No activity --</option>';
      for (const a of list) {
        const opt = document.createElement('option');
        opt.value = String(a.id);
        opt.textContent = `${a.nom_activite} (${a.places - a.inscrits} free)`;
        select.appendChild(opt);
      }
    } catch (e) {
      select.innerHTML = '<option value="">-- Unavailable --</option>';
      select.disabled = true;
      setFeedback(feedback, 'error', e.message);
    }
  }

  async function loadMember() {
    try {
      const m = await api(`/api/adherents/${id}`);
      for (const key of ['prenom', 'nom', 'email', 'telephone', 'date_naissance', 'adresse', 'statut']) {
        const el = qs(`#${key}`);
        if (el) el.value = m[key] == null ? '' : m[key];
      }
      if (m.activite_id) select.value = String(m.activite_id);
    } catch (e) {
      setFeedback(feedback, 'error', e.message);
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearFeedback(feedback);

    const payload = fieldValues(form);
    payload.activite_id = select.value;

    if (!form.reportValidity()) {
      setFeedback(feedback, 'error', 'Please correct the highlighted fields.');
      return;
    }

    submit.disabled = true;
    const original = submit.value;
    submit.value = 'Saving...';

    try {
      if (isEdit) {
        await api(`/api/adherents/${id}`, { method: 'PUT', body: payload });
        setFeedback(feedback, 'success', 'Member updated successfully.');
      } else {
        const res = await api('/api/adherents', { method: 'POST', body: payload });
        setFeedback(feedback, 'success', 'Member created successfully.');
        window.location.href = `adherent-detail.html?id=${res.id}`;
        return;
      }
    } catch (e) {
      setFeedback(feedback, 'error', e.errors.length > 1 ? e.errors.join(' ') : e.message);
      markInvalid(form, e.errors);
    } finally {
      submit.disabled = false;
      submit.value = original;
    }
  });

  form.addEventListener('reset', () => {
    clearFeedback(feedback);
    form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
  });

  if (isEdit) {
    title.textContent = 'Edit Member';
    submit.value = 'Update Member';
  }

  loadActivities().then(() => (isEdit ? loadMember() : null));
})();
