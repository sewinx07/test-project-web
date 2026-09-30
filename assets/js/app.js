(function () {
  'use strict';

  const STATUS_LABELS = {
    actif: 'Active',
    en_attente: 'Pending',
    suspendu: 'Suspended',
  };

  const STATUS_CLASSES = {
    actif: 'badge-paye',
    en_attente: 'badge-attente',
    suspendu: 'badge-danger',
  };

  const CATEGORY_LABELS = {
    ballon: 'Ball Sports',
    eau: 'Water Sports',
    individuel: 'Individual Sports',
    'bien-etre': 'Well-being',
  };

  const ACTIVITY_ICONS = {
    football: '&#9917;',
    basketball: '&#127918;',
    tennis: '&#127934;',
    swimming: '&#127956;',
    yoga: '&#128105;',
    fitness: '&#128170;',
    boxing: '&#129306;',
  };

  const iconFor = (name) => {
    const key = String(name || '').toLowerCase().replace(/[^a-z]/g, '');
    for (const slug of Object.keys(ACTIVITY_ICONS)) {
      if (key.includes(slug.replace(/[^a-z]/g, ''))) return ACTIVITY_ICONS[slug];
    }
    return '&#127947;';
  };

  const escapeHtml = (value) =>
    String(value == null ? '' : value).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );

  const euro = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? `${n.toFixed(2)} TND` : '--';
  };

  const formatDate = (value) => {
    if (!value) return '--';
    const d = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const statusBadge = (statut) =>
    `<span class="badge ${STATUS_CLASSES[statut] || 'badge-attente'}">${escapeHtml(
      STATUS_LABELS[statut] || statut || 'Unknown'
    )}</span>`;

  const paidBadge = (statut) =>
    statut === 'actif'
      ? '<span class="badge badge-paye">Paid</span>'
      : '<span class="badge badge-attente">Unpaid</span>';

  async function api(path, options) {
    const opts = Object.assign({ headers: {} }, options);
    if (opts.body && typeof opts.body !== 'string') {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    let res;
    try {
      res = await fetch(path, opts);
    } catch (e) {
      const err = new Error('Cannot reach the server. Is it running (npm start)?');
      err.offline = true;
      throw err;
    }
    let payload = null;
    try {
      payload = await res.json();
    } catch (e) {
      payload = null;
    }
    if (!res.ok) {
      const err = new Error((payload && payload.errors && payload.errors[0]) || `Request failed (${res.status}).`);
      err.errors = (payload && payload.errors) || [];
      err.status = res.status;
      throw err;
    }
    return payload;
  }

  function setFeedback(el, kind, message) {
    if (!el) return;
    el.textContent = message;
    el.className = `form-feedback form-feedback--${kind}`;
    el.hidden = !message;
  }

  function clearFeedback(el) {
    if (!el) return;
    el.textContent = '';
    el.hidden = true;
    el.className = 'form-feedback';
  }

  function fieldValues(form) {
    const out = {};
    for (const el of form.elements) {
      if (!el.name || el.name === 'id') continue;
      if (el.type === 'checkbox') out[el.name] = el.checked;
      else out[el.name] = el.value;
    }
    return out;
  }

  function markInvalid(form, messages) {
    form.querySelectorAll('[aria-invalid="true"]').forEach((el) => el.removeAttribute('aria-invalid'));
    const list = Array.isArray(messages) ? messages : [messages];
    list.forEach((msg) => {
      const label = String(msg)
        .replace(/^Invalid\s+/i, '')
        .replace(/\.$/, '')
        .toLowerCase();
      const field = Array.from(form.elements).find((el) => {
        if (!el.name || !el.tagName) return false;
        const n = String(el.name).toLowerCase();
        const id = String(el.id).toLowerCase();
        return (
          n.includes(label.split(' ')[0]) ||
          id.includes(label.split(' ')[0]) ||
          label.includes(n) ||
          label.includes(id)
        );
      });
      if (field) field.setAttribute('aria-invalid', 'true');
    });
  }

  function renderOptions(select, items, { value, label, selected, placeholder }) {
    if (!select) return;
    const current = selected ?? select.value;
    select.innerHTML = '';
    if (placeholder) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = placeholder;
      select.appendChild(opt);
    }
    for (const item of items) {
      const opt = document.createElement('option');
      opt.value = String(typeof value === 'function' ? value(item) : item[value]);
      opt.textContent = String(typeof label === 'function' ? label(item) : item[label]);
      if (opt.value === String(current)) opt.selected = true;
      select.appendChild(opt);
    }
    if (current) select.value = String(current);
  }

  function emptyRow(colspan, message) {
    return `<tr class="table-empty"><td colspan="${colspan}">${escapeHtml(message)}</td></tr>`;
  }

  const qs = (sel, root) => (root || document).querySelector(sel);
  const qsa = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  window.Club = {
    api,
    escapeHtml,
    euro,
    formatDate,
    statusBadge,
    paidBadge,
    iconFor,
    setFeedback,
    clearFeedback,
    fieldValues,
    markInvalid,
    renderOptions,
    emptyRow,
    STATUS_LABELS,
    CATEGORY_LABELS,
    qs,
    qsa,
  };
})();
