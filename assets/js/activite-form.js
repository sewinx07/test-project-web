(function () {
  'use strict';

  const { api, fieldValues, markInvalid, setFeedback, clearFeedback, renderOptions, CATEGORY_LABELS, qs } = window.Club;

  const form = qs('#activite-form');
  if (!form) return;

  const idField = qs('#id');
  const feedback = qs('#form-feedback');
  const submit = qs('#submit-btn');
  const title = qs('#form-title');

  const id = Number(new URLSearchParams(window.location.search).get('id'));
  const isEdit = Number.isInteger(id) && id > 0;
  if (isEdit && idField) idField.value = String(id);

  async function loadMeta() {
    try {
      const meta = await api('/api/activites-meta');
      const cat = qs('#categorie');
      const day = qs('#jour');
      const currentCat = cat.value;
      const currentDay = day.value;

      renderOptions(cat, meta.categories, {
        value: (v) => v,
        label: (v) => CATEGORY_LABELS[v] || v,
        selected: currentCat,
        placeholder: '-- Choose a category --',
      });
      renderOptions(day, meta.days, {
        value: (v) => v,
        label: (v) => v,
        selected: currentDay,
        placeholder: '-- Choose a day --',
      });
    } catch (e) {
      setFeedback(feedback, 'error', e.message);
    }
  }

  async function loadActivity() {
    try {
      const a = await api(`/api/activites/${id}`);
      for (const key of ['nom_activite', 'categorie', 'description', 'jour', 'horaire', 'tarif', 'places']) {
        const el = qs(`#${key}`);
        if (el) el.value = a[key] == null ? '' : a[key];
      }
    } catch (e) {
      setFeedback(feedback, 'error', e.message);
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearFeedback(feedback);

    const payload = fieldValues(form);

    if (!form.reportValidity()) {
      setFeedback(feedback, 'error', 'Please correct the highlighted fields.');
      return;
    }

    submit.disabled = true;
    const original = submit.value;
    submit.value = 'Saving...';

    try {
      if (isEdit) {
        await api(`/api/activites/${id}`, { method: 'PUT', body: payload });
        setFeedback(feedback, 'success', 'Activity updated successfully.');
      } else {
        const res = await api('/api/activites', { method: 'POST', body: payload });
        window.location.href = `activite-detail.html?id=${res.id}`;
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
    title.textContent = 'Edit Activity';
    submit.value = 'Update Activity';
  }

  loadMeta().then(() => (isEdit ? loadActivity() : null));
})();
