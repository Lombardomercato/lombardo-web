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
  const cardImage = root.querySelector('[data-tinder-image]');
  const cardName = root.querySelector('[data-tinder-name]');
  const cardVarietal = root.querySelector('[data-tinder-varietal]');
  const cardDescription = root.querySelector('[data-tinder-description]');
  const chipsNode = root.querySelector('[data-tinder-chips]');
  const stepCurrentNode = root.querySelector('[data-tinder-step-current]');
  const stepTotalNode = root.querySelector('[data-tinder-step-total]');
  const progressFillNode = root.querySelector('[data-tinder-progress-fill]');
  const profileNameNode = root.querySelector('[data-tinder-profile-name]');
  const profileDescriptionNode = root.querySelector('[data-tinder-profile-description]');
  const profileQuoteNode = root.querySelector('[data-tinder-profile-quote]');
  const recommendationsNode = root.querySelector('[data-tinder-recommendations]');
  const boxNode = root.querySelector('[data-tinder-box]');
  const matchNode = root.querySelector('[data-tinder-match]');
  const shareRoot = root.querySelector('[data-tinder-share]');
  const shareWhatsAppNode = root.querySelector('[data-tinder-share-whatsapp]');
  const shareXNode = root.querySelector('[data-tinder-share-x]');
  const shareFacebookNode = root.querySelector('[data-tinder-share-facebook]');
  const shareInstagramNode = root.querySelector('[data-tinder-share-instagram]');
  const downloadStoryNode = root.querySelector('[data-tinder-download-story]');
  const storyWrapNode = root.querySelector('[data-tinder-story-wrap]');
  const storyPreviewNode = root.querySelector('[data-tinder-story-preview]');
  const copyNode = root.querySelector('[data-tinder-copy]');
  const copyFeedbackNode = root.querySelector('[data-tinder-copy-feedback]');

  const state = { pool: [], index: 0, likes: [], dislikes: [], threshold: 92 };
  let catalog = [];
  let storyDataUrl = '';

  const formatPrice = (amount) => Number(amount || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
  const normalize = (v) => String(v || '').trim().toLowerCase();

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

  const sortByPriorityAndPrice = (a, b) => {
    const pA = (a?.prioridad_venta || '').toLowerCase() === 'alta' ? 1 : 0;
    const pB = (b?.prioridad_venta || '').toLowerCase() === 'alta' ? 1 : 0;
    if (pA !== pB) return pB - pA;
    return Number(b?.precio || 0) - Number(a?.precio || 0);
  };

  const estimateMatchPercent = () => Math.max(70, Math.min(99, 68 + Math.round((state.likes.length / (state.pool.length || 1)) * 28)));

  const updateStampState = (delta = 0) => {
    if (stampLike) stampLike.style.opacity = delta > 16 ? String(Math.min(1, Math.abs(delta) / state.threshold)) : '0';
    if (stampNope) stampNope.style.opacity = delta < -16 ? String(Math.min(1, Math.abs(delta) / state.threshold)) : '0';
  };

  const updateProgress = () => {
    const total = state.pool.length || 1;
    const current = Math.min(state.index + 1, total);
    if (stepCurrentNode) stepCurrentNode.textContent = String(current);
    if (stepTotalNode) stepTotalNode.textContent = String(total);
    if (progressFillNode) progressFillNode.style.width = `${Math.min(100, (state.index / total) * 100)}%`;
  };

  const buildPool = () => {
    const active = [...catalog].filter(Boolean);
    const grouped = active.reduce((acc, wine) => {
      const key = `${normalize(wine.tipo_vino)}-${normalize(wine.varietal)}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(wine);
      return acc;
    }, {});

    const diverse = Object.values(grouped)
      .map((items) => items.sort(sortByPriorityAndPrice)[0])
      .filter(Boolean)
      .sort(sortByPriorityAndPrice);

    state.pool = (diverse.length >= 7 ? diverse : active.sort(sortByPriorityAndPrice)).slice(0, 8);
  };

  const scoreWine = (wine) => {
    let score = 0;
    state.likes.forEach((liked) => {
      if (normalize(wine.tipo_vino) === normalize(liked.tipo_vino)) score += 6;
      if (normalize(wine.varietal) === normalize(liked.varietal)) score += 8;
      if (normalize(wine.maridaje_principal) === normalize(liked.maridaje_principal)) score += 5;
      if (normalize(wine.ocasion) === normalize(liked.ocasion)) score += 4;
      if (Math.abs(Number(wine.precio || 0) - Number(liked.precio || 0)) <= 5000) score += 3;
    });

    state.dislikes.forEach((disliked) => {
      if (normalize(wine.tipo_vino) === normalize(disliked.tipo_vino)) score -= 5;
      if (normalize(wine.varietal) === normalize(disliked.varietal)) score -= 8;
      if (normalize(wine.maridaje_principal) === normalize(disliked.maridaje_principal)) score -= 4;
      if (normalize(wine.ocasion) === normalize(disliked.ocasion)) score -= 3;
    });

    if ((wine.prioridad_venta || '').toLowerCase() === 'alta') score += 1;
    return score;
  };

  const detectProfile = () => {
    const likes = state.likes;
    const count = (pick) => likes.reduce((acc, w) => {
      const k = normalize(pick(w)) || 'otro';
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});

    const typeTop = Object.entries(count((w) => w.tipo_vino)).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    const varietalTop = Object.entries(count((w) => w.varietal)).sort((a, b) => b[1] - a[1])[0]?.[0] || '';

    if (typeTop === 'tinto' && /(malbec|cabernet|blend|syrah)/.test(varietalTop)) {
      return {
        name: 'Clásico Malbec',
        description: 'Te van vinos con estructura, carácter gastronómico y final persistente.',
        quote: 'Mi perfil de vino es: Clásico Malbec 🍷',
      };
    }

    if (/(blanco|rosado|espumoso)/.test(typeTop)) {
      return {
        name: 'Fresco Social',
        description: 'Buscás vinos vibrantes, frescos y versátiles para compartir sin vueltas.',
        quote: 'Mi perfil de vino es: Fresco Social ✨',
      };
    }

    return {
      name: 'Explorador Lombardo',
      description: 'Disfrutás alternar estilos y descubrir etiquetas nuevas sin perder equilibrio.',
      quote: 'Mi perfil de vino es: Explorador Lombardo 🧭',
    };
  };

  const pickDiverseTop = (ranked) => {
    const usedVarietal = new Set();
    const selected = [];

    ranked.forEach((wine) => {
      if (selected.length >= 3) return;
      const key = normalize(wine.varietal) || normalize(wine.tipo_vino);
      if (!usedVarietal.has(key)) {
        selected.push(wine);
        usedVarietal.add(key);
      }
    });

    if (selected.length < 3) {
      ranked.forEach((wine) => {
        if (selected.length >= 3) return;
        if (!selected.some((item) => item.nombre === wine.nombre)) selected.push(wine);
      });
    }

    return selected.slice(0, 3);
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

  const buildShareMessage = (profile, recommendations) => {
    const picks = recommendations.slice(0, 2).map((wine) => wine.nombre).join(' + ');
    return `${profile.quote}\nMatch: ${estimateMatchPercent()}%\nMis elegidos: ${picks}\nDescubrilo en Lombardo 🍷 #WineTinderLombardo`;
  };

  const buildStory = (profile, recommendations) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    const gradient = ctx.createLinearGradient(0, 0, 1080, 1920);
    gradient.addColorStop(0, '#003A70');
    gradient.addColorStop(1, '#0B2340');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1080, 1920);

    ctx.fillStyle = 'rgba(255,179,171,0.16)';
    ctx.beginPath();
    ctx.arc(920, 260, 280, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#E4D5D3';
    ctx.font = '700 64px sans-serif';
    ctx.fillText('LOMBARDO', 80, 140);

    ctx.fillStyle = '#FFB3AB';
    ctx.font = '700 50px sans-serif';
    ctx.fillText('WINE TINDER', 80, 230);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 78px sans-serif';
    ctx.fillText(profile.name, 80, 430);

    ctx.fillStyle = 'rgba(228,213,211,0.94)';
    ctx.font = '500 40px sans-serif';
    ctx.fillText('Mi perfil de vino es:', 80, 360);

    ctx.fillStyle = '#E4D5D3';
    ctx.font = '500 36px sans-serif';
    ctx.fillText(profile.description.slice(0, 90), 80, 520);

    ctx.fillStyle = '#FFB3AB';
    ctx.font = '700 42px sans-serif';
    ctx.fillText('Recomendaciones', 80, 700);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '500 36px sans-serif';
    recommendations.slice(0, 3).forEach((wine, index) => {
      ctx.fillText(`• ${wine.nombre}`, 90, 780 + index * 70);
    });

    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(80, 1520, 920, 220);
    ctx.fillStyle = '#E4D5D3';
    ctx.font = '600 44px sans-serif';
    ctx.fillText('Descubrilo en Lombardo', 120, 1640);
    ctx.font = '500 34px sans-serif';
    ctx.fillText(`Compatibilidad: ${estimateMatchPercent()}%`, 120, 1710);

    return canvas.toDataURL('image/png');
  };

  const updateShareActions = (profile, recommendations) => {
    if (!shareRoot) return;
    shareRoot.hidden = false;

    const text = buildShareMessage(profile, recommendations);
    const encodedText = encodeURIComponent(text);
    const pageUrl = encodeURIComponent('https://lombardo.com.ar/pages/wine-tinder/');

    if (shareWhatsAppNode) shareWhatsAppNode.href = `https://wa.me/?text=${encodedText}`;
    if (shareXNode) shareXNode.href = `https://twitter.com/intent/tweet?text=${encodedText}&url=${pageUrl}`;
    if (shareFacebookNode) shareFacebookNode.href = `https://www.facebook.com/sharer/sharer.php?u=${pageUrl}&quote=${encodedText}`;
    if (shareInstagramNode) shareInstagramNode.href = 'https://www.instagram.com/';

    storyDataUrl = buildStory(profile, recommendations);
    if (storyDataUrl && storyPreviewNode && storyWrapNode) {
      storyPreviewNode.src = storyDataUrl;
      storyWrapNode.hidden = false;
    }

    if (downloadStoryNode) {
      downloadStoryNode.onclick = () => {
        if (!storyDataUrl) return;
        const link = document.createElement('a');
        link.href = storyDataUrl;
        link.download = `lombardo-wine-tinder-${Date.now()}.png`;
        link.click();
      };
    }

    if (copyNode) {
      copyNode.onclick = async () => {
        try {
          await navigator.clipboard.writeText(text);
          if (copyFeedbackNode) copyFeedbackNode.textContent = 'Texto copiado. Podés pegarlo en Instagram Stories o WhatsApp.';
        } catch (_error) {
          if (copyFeedbackNode) copyFeedbackNode.textContent = 'No se pudo copiar automáticamente.';
        }
      };
    }
  };

  const finish = () => {
    const profile = detectProfile();
    const ranked = [...catalog]
      .map((wine) => ({ ...wine, tinderScore: scoreWine(wine) }))
      .sort((a, b) => b.tinderScore - a.tinderScore || sortByPriorityAndPrice(a, b));

    const recommendations = pickDiverseTop(ranked);
    const box = pickDiverseTop(ranked.slice(1).concat(ranked.slice(0, 1)));

    if (profileNameNode) profileNameNode.textContent = profile.name;
    if (profileDescriptionNode) profileDescriptionNode.textContent = profile.description;
    if (profileQuoteNode) profileQuoteNode.textContent = `${profile.quote} · Descubrilo en Lombardo.`;
    if (matchNode) matchNode.textContent = `Compatibilidad con tu estilo: ${estimateMatchPercent()}%`;

    renderList(recommendationsNode, recommendations);
    renderList(boxNode, box);
    updateShareActions(profile, recommendations);

    try {
      localStorage.setItem('lombardo_wine_profile', JSON.stringify({ perfil: profile.name, descripcion: profile.description, origen: 'wine_tinder' }));
    } catch (_error) {
      // noop
    }

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

    if (cardImage) {
      cardImage.src = wine.imagen_url || '/assets/fotos/vino.jpg';
      cardImage.alt = wine.nombre || 'Vino recomendado';
    }

    card.style.transform = 'translateX(0) rotate(0deg)';
    card.style.opacity = '1';
    updateStampState(0);
  };

  const commitSwipe = (liked) => {
    const wine = state.pool[state.index];
    if (!wine) return;
    if (liked) state.likes.push(wine);
    else state.dislikes.push(wine);
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
    if (Math.abs(delta) >= state.threshold) {
      animateAndCommit(delta > 0);
    } else {
      card.style.transition = 'transform 200ms ease';
      card.style.transform = 'translateX(0) rotate(0deg)';
      updateStampState(0);
    }
  });

  likeBtn?.addEventListener('click', () => animateAndCommit(true));
  dislikeBtn?.addEventListener('click', () => animateAndCommit(false));

  startBtn?.addEventListener('click', async () => {
    if (!catalog.length) {
      try {
        await loadCatalog();
      } catch (_error) {
        return;
      }
    }

    buildPool();
    state.index = 0;
    state.likes = [];
    state.dislikes = [];
    storyDataUrl = '';

    startPanel.hidden = true;
    resultPanel.hidden = true;
    swipePanel.hidden = false;
    if (shareRoot) shareRoot.hidden = true;
    if (storyWrapNode) storyWrapNode.hidden = true;
    if (copyFeedbackNode) copyFeedbackNode.textContent = '';

    renderCard();
  });
})();
