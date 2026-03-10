(() => {
  const authSection = document.getElementById('authSection');
  const authForm = document.getElementById('authForm');
  const adminKeyInput = document.getElementById('adminKey');
  const dashboard = document.getElementById('dashboard');
  const stateMessage = document.getElementById('stateMessage');
  const summaryCards = document.getElementById('summaryCards');
  const consultasFrecuentes = document.getElementById('consultasFrecuentes');
  const perfilesCliente = document.getElementById('perfilesCliente');
  const whatsappRanking = document.getElementById('whatsappRanking');
  const vinosRanking = document.getElementById('vinosRanking');
  const temasEmergentes = document.getElementById('temasEmergentes');

  const STORAGE_KEY = 'lombardo.admin.insights.key';

  const escapeHtml = (value) =>
    String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const renderBars = (container, rows) => {
    const max = rows.reduce((acc, row) => Math.max(acc, row.value), 0) || 1;
    container.innerHTML = rows
      .map((row) => {
        const pct = Math.round((row.value / max) * 100);
        return `
          <div class="bar-row">
            <span>${escapeHtml(row.label)}</span>
            <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
            <strong>${row.value}</strong>
          </div>
        `;
      })
      .join('');
  };

  const renderList = (container, rows, formatter) => {
    if (!rows.length) {
      container.innerHTML = '<li>Sin datos todavía.</li>';
      return;
    }

    container.innerHTML = rows.map((row) => `<li>${formatter(row)}</li>`).join('');
  };

  const renderSummary = (summary) => {
    summaryCards.innerHTML = `
      <article class="metric-card">
        <div class="label">Total interacciones</div>
        <div class="value">${summary.total_interacciones || 0}</div>
      </article>
      <article class="metric-card">
        <div class="label">Derivación a WhatsApp</div>
        <div class="value">${summary.porcentaje_derivacion_whatsapp || 0}%</div>
      </article>
      <article class="metric-card">
        <div class="label">Top categorías</div>
        <div class="value">${(summary.categorias_principales || []).map((item) => item.label).join(', ') || 'N/A'}</div>
      </article>
    `;
  };

  const fetchInsights = async (token) => {
    stateMessage.textContent = 'Cargando insights...';
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    const response = await fetch('/api/admin-insights', { headers });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || 'No se pudo cargar el panel.');
    }

    return response.json();
  };

  const showDashboard = (data) => {
    renderSummary(data.summary || {});
    renderBars(consultasFrecuentes, data.consultas_frecuentes || []);
    renderBars(perfilesCliente, data.perfiles || []);

    renderList(whatsappRanking, data.whatsapp_por_categoria || [], (row) =>
      `${escapeHtml(row.category)}: <strong>${row.rate}%</strong> (${row.whatsapp}/${row.total})`
    );

    renderList(vinosRanking, data.vinos_mas_sugeridos || [], (row) =>
      `${escapeHtml(row.label)} <strong>(${row.value})</strong>`
    );

    renderList(temasEmergentes, data.temas_emergentes || [], (row) =>
      `${escapeHtml(row.topic)} <strong>(${row.mentions})</strong>`
    );

    dashboard.hidden = false;
    authSection.hidden = true;
    stateMessage.textContent = '';
  };

  authForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const token = adminKeyInput.value.trim();
    try {
      const data = await fetchInsights(token);
      localStorage.setItem(STORAGE_KEY, token);
      showDashboard(data);
    } catch (error) {
      stateMessage.textContent = error.message;
    }
  });

  const autoToken = localStorage.getItem(STORAGE_KEY) || '';
  if (autoToken) adminKeyInput.value = autoToken;
})();
