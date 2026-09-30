(function () {
  'use strict';

  const { api, fieldValues, markInvalid, setFeedback, clearFeedback, qs } = window.Club;

  const form = qs('#registration-form');
  if (!form) return;

  const select = qs('#activite_id');
  const hint = qs('#activite_hint');
  const feedback = qs('#form-feedback');
  const submit = qs('#submit-btn');
  const birth = qs('#date_naissance');

  const maxBirthDate = () => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 16);
    return d.toISOString().slice(0, 10);
  };

  if (birth) birth.max = maxBirthDate();

  async function loadActivities() {
    try {
      const list = await api('/api/activites');
      const open = list.filter((a) => a.places_restantes > 0);

      select.innerHTML = '<option value="">-- Choose an activity --</option>';
      for (const a of list) {
        const opt = document.createElement('option');
        opt.value = String(a.id);
        const full = a.places_restantes <= 0;
        opt.textContent = `${a.nom_activite} - ${Number(a.tarif).toFixed(2)} TND${full ? ' (full)' : ''}`;
        opt.disabled = full;
        select.appendChild(opt);
      }

      hint.textContent = open.length
        ? `${open.length} activit${open.length > 1 ? 'ies' : 'y'} available.`
        : 'No activity currently has places available.';
    } catch (e) {
      select.innerHTML = '<option value="">-- Unavailable --</option>';
      select.disabled = true;
      hint.textContent = e.message;
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearFeedback(feedback);

    if (!form.reportValidity()) {
      setFeedback(feedback, 'error', 'Please correct the highlighted fields.');
      return;
    }

    const payload = fieldValues(form);
    payload.activite_id = select.value;
    payload.conditions = qs('#conditions').checked;

    submit.disabled = true;
    const original = submit.value;
    submit.value = 'Sending...';

    try {
      await api('/api/adherents', { method: 'POST', body: payload });
      setFeedback(feedback, 'success', 'Registration received. Our team will contact you shortly.');
      form.reset();
      select.value = '';
      loadActivities();
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

  loadActivities();
})();
