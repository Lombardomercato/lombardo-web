(function initStandaloneTinderWine() {
  const root = document.querySelector('[data-wine-tinder]');
  if (!root) return;

  const startPanel = root.querySelector('[data-tinder-start]');
  const swipePanel = root.querySelector('[data-tinder-swipe]');
  const resultPanel = root.querySelector('[data-tinder-result]');
  const startBtn = root.querySelector('[data-tinder-start-btn]');
  const likeBtn = root.querySelector('[data-tinder-like]');
  const dislikeBtn = root.querySelector('[data-tinder-dislike]');
  const card = root.querySelector('[data-tinder-card]');
  const stampNope = root.querySelector('[data-tinder-stamp-nope]');
  const stampLike = root.querySelector('[data-tinder-stamp-like]');
  const cardName = root.querySelector('[data-tinder-name]');
  const cardVarietal = root.querySelector('[data-tinder-varietal]');
  const cardDescription = root.querySelector('[data-tinder-description]');
  const chipsNode = root.querySelector('[data-tinder-chips]');
  const stepCurrentNode = root.querySelector('[data-tinder-step-current]');
  const stepTotalNode = root.querySelector('[data-tinder-step-total]');
  const progressFillNode = root.querySelector('[data-tinder-progress-fill]');
  const profileNameNode = root.querySelector('[data-tinder-profile-name]');
  const profileDescriptionNode = root.querySelector('[data-tinder-profile-description]');
  const recommendationsNode = root.querySelector('[data-tinder-recommendations]');
  const boxNode = root.querySelector('[data-tinder-box]');
  const matchNode = root.querySelector('[data-tinder-match]');
  const shareRoot = root.querySelector('[data-tinder-share]');
  const shareWhatsAppNode = root.querySelector('[data-tinder-share-whatsapp]');
  const shareXNode = root.querySelector('[data-tinder-share-x]');
  const shareFacebookNode = root.querySelector('[data-tinder-share-facebook]');
  const copyNode = root.querySelector('[data-tinder-copy]');
  const copyFeedbackNode = root.querySelector('[data-tinder-copy-feedback]');

  const state = { pool: [], index: 0, likes: [], dislikes: [], threshold: 92 };
  let catalog = [];

  const formatPrice = (amount) => Number(amount || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
  const sortByPriorityAndPrice = (a, b) => {
    const pA = (a?.prioridad_venta || '').toLowerCase() === 'alta' ? 1 : 0;
    const pB = (b?.prioridad_venta || '').toLowerCase() === 'alta' ? 1 : 0;
    if (pA !== pB) return pB - pA;
    return Number(b?.precio || 0) - Number(a?.precio || 0);
  };

  const loadCatalog = async () => {
    const response = await fetch('/vinos_lombardo_base.json', { cache: 'no-store' });
    const data = await response.json();
    catalog = Array.isArray(data) ? data.filter((wine) => wine?.activo !== false) : [];
  };

  const getDescription = (wine) => {
    const parts = [];
    if (wine?.tipo_vino) parts.push(`Vino ${wine.tipo_vino}`);
    if (wine?.maridaje_principal) parts.push(`ideal para ${wine.maridaje_principal.replace('_', ' ')}`);
    if (wine?.ocasion) parts.push(`pensado para ${wine.ocasion.replace('_', ' ')}`);
    return `${parts.join(', ')}.`;
  };

  const getChips = (wine) => [wine?.tipo_vino, wine?.varietal, wine?.maridaje_principal?.replace('_', ' ')].filter(Boolean).slice(0, 3);
  const estimateMatchPercent = () => Math.max(73, Math.min(98, 72 + Math.round((state.likes.length / (state.pool.length || 1)) * 24)));

  const updateStampState = (delta = 0) => {
    if (stampLike) stampLike.style.opacity = delta > 16 ? String(Math.min(1, Math.abs(delta) / state.threshold)) : '0';
    if (stampNope) stampNope.style.opacity = delta < -16 ? String(Math.min(1, Math.abs(delta) / state.threshold)) : '0';
  };

  const updateProgress = () => {
    const total = state.pool.length || 1;
    const current = Math.min(state.index + 1, total);
    if (stepCurrentNode) stepCurrentNode.textContent = String(current);
    if (progressFillNode) progressFillNode.style.width = `${Math.min(100, (state.index / total) * 100)}%`;
  };

  const scoreByLikes = (wine) => {
    let score = 0;
    state.likes.forEach((liked) => {
      if (wine.tipo_vino === liked.tipo_vino) score += 7;
      if (wine.varietal === liked.varietal) score += 6;
      if (wine.maridaje_principal === liked.maridaje_principal) score += 5;
      if (wine.ocasion === liked.ocasion) score += 4;
    });
    state.dislikes.forEach((disliked) => {
      if (wine.tipo_vino === disliked.tipo_vino) score -= 5;
      if (wine.varietal === disliked.varietal) score -= 3;
    });
    return score;
  };

  const detectProfile = () => {
    const top = state.likes[0];
    if (!top) return { name: 'Explorador Lombardo', description: 'Te gusta descubrir etiquetas distintas con criterio.' };
    if ((top.tipo_vino || '').toLowerCase() === 'tinto') return { name: 'Clásico Malbec', description: 'Preferís vinos con cuerpo y presencia en mesa.' };
    if (['blanco', 'rosado', 'espumoso'].includes((top.tipo_vino || '').toLowerCase())) return { name: 'Fresco Social', description: 'Te van los vinos vibrantes y fáciles de compartir.' };
    return { name: 'Explorador Lombardo', description: 'Te gusta descubrir etiquetas distintas con criterio.' };
  };

  const renderList = (container, wines) => {
    if (!container) return;
    container.innerHTML = '';
    wines.forEach((wine) => {
      const item = document.createElement('article');
      item.className = 'wine-tinder-mini-card';
      item.innerHTML = `<h5>${wine.nombre}</h5><p>${wine.varietal || 'Varietal'} · ${formatPrice(wine.precio)}</p>`;
      container.appendChild(item);
    });
  };

  const updateShareActions = (profile, recommendations) => {
    if (!shareRoot) return;
    shareRoot.hidden = false;
    const text = `Hice match con el vino en Wine Tinder de Lombardo: ${profile.name} (${estimateMatchPercent()}% match). Mis elegidos: ${recommendations.slice(0,2).map((w) => w.nombre).join(' + ')}. ¿Cuál te salió a vos? 🍷 #WineTinderLombardo`;
    const encodedText = encodeURIComponent(text);
    const siteUrl = encodeURIComponent('https://lombardo.com.ar/pages/wine-tinder/');
    if (shareWhatsAppNode) shareWhatsAppNode.href = `https://wa.me/?text=${encodedText}`;
    if (shareXNode) shareXNode.href = `https://twitter.com/intent/tweet?text=${encodedText}&url=${siteUrl}`;
    if (shareFacebookNode) shareFacebookNode.href = `https://www.facebook.com/sharer/sharer.php?u=${siteUrl}&quote=${encodedText}`;
    if (copyNode) {
      copyNode.onclick = async () => {
        try {
          await navigator.clipboard.writeText(text);
          if (copyFeedbackNode) copyFeedbackNode.textContent = 'Texto copiado. ¡Ahora compartilo en tus redes!';
        } catch (_error) {
          if (copyFeedbackNode) copyFeedbackNode.textContent = 'No se pudo copiar automáticamente.';
        }
      };
    }
  };


  const deriveRecommendationContext = (profile) => {
    const dominant = state.likes[0] || {};
    const avgPrice = state.likes.length
      ? Math.round(state.likes.reduce((acc, wine) => acc + Number(wine.precio || 0), 0) / state.likes.length)
      : null;

    return {
      perfil: profile.name,
      ocasion: dominant.ocasion || 'descubrir',
      presupuesto: avgPrice,
      estilo: dominant.varietal || dominant.tipo_vino || 'clasico',
    };
  };

  const scoreByRecommendationContext = (wine, context) => {
    let score = scoreByLikes(wine);
    const wineText = `${wine.varietal || ''} ${wine.tipo_vino || ''} ${wine.descripcion_corta || ''}`.toLowerCase();
    if (context.ocasion && String(wine.ocasion || '').toLowerCase().includes(String(context.ocasion).toLowerCase())) score += 5;
    if (context.estilo && wineText.includes(String(context.estilo).toLowerCase())) score += 3;
    if (Number.isFinite(context.presupuesto)) {
      const delta = Math.abs(Number(wine.precio || 0) - context.presupuesto);
      if (delta <= 3000) score += 5;
      else if (delta <= 7000) score += 2;
    }
    return score;
  };


  const logTinderInteraction = (profile, context, recommendations) => {
    const payload = {
      fecha: new Date().toISOString().slice(0, 10),
      mensaje_usuario: 'Resultado Wine Tinder',
      pagina_actual: 'wine-tinder',
      intencion_detectada: 'consulta_producto',
      perfil_detectado: context?.perfil || profile?.name || 'Perfil Wine Tinder',
      categoria_consulta: 'recomendacion_producto',
      productos_sugeridos: recommendations.map((wine) => wine?.nombre).filter(Boolean).slice(0, 3),
      tipo_cierre: 'etiquetas',
      derivo_whatsapp: false,
    };

    try {
      const key = 'lombardo_tinder_interactions';
      const current = JSON.parse(localStorage.getItem(key) || '[]');
      const next = Array.isArray(current) ? [...current, payload].slice(-80) : [payload];
      localStorage.setItem(key, JSON.stringify(next));
    } catch (_error) {
      // noop
    }
  };

  const finish = () => {
    const profile = detectProfile();
    const context = deriveRecommendationContext(profile);
    const ranked = [...catalog].map((wine) => ({ ...wine, tinderScore: scoreByRecommendationContext(wine, context) })).sort((a, b) => b.tinderScore - a.tinderScore || sortByPriorityAndPrice(a, b));
    const recommendations = ranked.slice(0, 3);
    const box = ranked.slice(1, 4).length ? ranked.slice(1, 4) : ranked.slice(0, 3);
    if (profileNameNode) profileNameNode.textContent = `Perfil: ${profile.name}`;
    if (profileDescriptionNode) profileDescriptionNode.textContent = profile.description;
    if (matchNode) matchNode.textContent = `Compatibilidad con tu estilo: ${estimateMatchPercent()}%`;
    renderList(recommendationsNode, recommendations);
    renderList(boxNode, box);
    updateShareActions(profile, recommendations);
    try {
      localStorage.setItem('lombardo_wine_profile', JSON.stringify(context));
    } catch (_error) {}
    logTinderInteraction(profile, context, recommendations);
    swipePanel.hidden = true;
    resultPanel.hidden = false;
  };

  const renderCard = () => {
    const wine = state.pool[state.index];
    if (!wine) return finish();
    updateProgress();
    if (cardName) cardName.textContent = wine.nombre || 'Etiqueta Lombardo';
    if (cardVarietal) cardVarietal.textContent = wine.varietal || 'Selección especial';
    if (cardDescription) cardDescription.textContent = getDescription(wine);
    if (chipsNode) {
      chipsNode.innerHTML = '';
      getChips(wine).forEach((chip) => {
        const span = document.createElement('span');
        span.className = 'wine-tinder-chip';
        span.textContent = chip;
        chipsNode.appendChild(span);
      });
    }
    card.style.transform = 'translateX(0) rotate(0deg)';
    card.style.opacity = '1';
    updateStampState(0);
  };

  const commitSwipe = (liked) => {
    const wine = state.pool[state.index];
    if (!wine) return;
    if (liked) state.likes.push(wine); else state.dislikes.push(wine);
    state.index += 1;
    renderCard();
  };

  const animateAndCommit = (liked) => {
    updateStampState(liked ? state.threshold : -state.threshold);
    card.style.transition = 'transform 220ms ease, opacity 220ms ease';
    card.style.transform = `translateX(${liked ? 180 : -180}px) rotate(${liked ? 14 : -14}deg)`;
    card.style.opacity = '0';
    window.setTimeout(() => {
      card.style.transition = 'transform 240ms ease, opacity 240ms ease';
      commitSwipe(liked);
    }, 210);
  };

  let dragStartX = 0;
  let dragCurrentX = 0;
  let dragging = false;

  card?.addEventListener('pointerdown', (event) => {
    dragging = true;
    dragStartX = event.clientX;
    dragCurrentX = event.clientX;
    card.setPointerCapture(event.pointerId);
    card.style.transition = 'none';
  });

  card?.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    dragCurrentX = event.clientX;
    const delta = dragCurrentX - dragStartX;
    const tilt = Math.max(-12, Math.min(12, delta / 18));
    card.style.transform = `translateX(${delta}px) rotate(${tilt}deg)`;
    updateStampState(delta);
  });

  card?.addEventListener('pointerup', () => {
    if (!dragging) return;
    dragging = false;
    const delta = dragCurrentX - dragStartX;
    if (Math.abs(delta) >= state.threshold) animateAndCommit(delta > 0);
    else {
      card.style.transition = 'transform 200ms ease';
      card.style.transform = 'translateX(0) rotate(0deg)';
      updateStampState(0);
    }
  });

  likeBtn?.addEventListener('click', () => animateAndCommit(true));
  dislikeBtn?.addEventListener('click', () => animateAndCommit(false));

  if (stepTotalNode) stepTotalNode.textContent = '6';

  startBtn?.addEventListener('click', async () => {
    if (!catalog.length) await loadCatalog();
    state.pool = [...catalog].sort(sortByPriorityAndPrice).slice(0, 6);
    state.index = 0;
    state.likes = [];
    state.dislikes = [];
    startPanel.hidden = true;
    resultPanel.hidden = true;
    swipePanel.hidden = false;
    if (shareRoot) shareRoot.hidden = true;
    if (copyFeedbackNode) copyFeedbackNode.textContent = '';
    renderCard();
  });
})();
