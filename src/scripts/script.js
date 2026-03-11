const navToggle = document.querySelector('.nav-toggle');
const mainNav = document.querySelector('.main-nav');

if (navToggle && mainNav) {
  const navWrap = navToggle.closest('.nav-wrap');
  const navBackdrop = document.createElement('div');
  navBackdrop.className = 'nav-backdrop';
  document.body.appendChild(navBackdrop);
  const submenuTriggers = mainNav.querySelectorAll('[data-submenu-trigger]');

  const closeSubmenus = () => {
    submenuTriggers.forEach((trigger) => {
      const item = trigger.closest('.has-submenu');
      item?.classList.remove('submenu-open');
      trigger.setAttribute('aria-expanded', 'false');
    });
  };

  const syncMenuState = (open) => {
    const isMobile = window.matchMedia('(max-width: 1024px)').matches;
    const shouldOpen = open && isMobile;

    mainNav.classList.toggle('open', shouldOpen);
    navToggle.classList.toggle('is-active', shouldOpen);
    navToggle.setAttribute('aria-expanded', String(shouldOpen));
    navToggle.setAttribute('aria-label', shouldOpen ? 'Cerrar menú' : 'Abrir menú');
    document.body.classList.toggle('nav-open', shouldOpen);
    navBackdrop.classList.toggle('is-visible', shouldOpen);

    if (!shouldOpen) closeSubmenus();
  };

  const closeMenu = () => {
    syncMenuState(false);
  };

  navToggle.addEventListener('click', () => {
    syncMenuState(!mainNav.classList.contains('open'));
  });

  mainNav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      if (window.matchMedia('(max-width: 1024px)').matches) closeMenu();
    });
  });

  submenuTriggers.forEach((trigger) => {
    trigger.addEventListener('click', (event) => {
      event.preventDefault();
      const currentItem = trigger.closest('.has-submenu');
      if (!currentItem) return;

      const willOpen = !currentItem.classList.contains('submenu-open');

      submenuTriggers.forEach((otherTrigger) => {
        const otherItem = otherTrigger.closest('.has-submenu');
        if (otherItem === currentItem) return;
        otherItem?.classList.remove('submenu-open');
        otherTrigger.setAttribute('aria-expanded', 'false');
      });

      currentItem.classList.toggle('submenu-open', willOpen);
      trigger.setAttribute('aria-expanded', String(willOpen));
    });
  });

  document.addEventListener('click', (event) => {
    if (!mainNav.classList.contains('open')) return;
    if (navWrap && event.target.closest('.nav-wrap')) return;
    closeMenu();
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.has-submenu')) closeSubmenus();
  });

  navBackdrop.addEventListener('click', closeMenu);

  window.addEventListener('resize', () => {
    if (!window.matchMedia('(max-width: 1024px)').matches) closeMenu();
    closeSubmenus();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && mainNav.classList.contains('open')) closeMenu();
  });
}

document.querySelectorAll('[data-wa]').forEach((el) => {
  el.addEventListener('click', () => {
    const phone = '543412762319';
    const msg = encodeURIComponent(el.getAttribute('data-wa') || 'Hola Lombardo, quiero info.');
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank', 'noopener');
  });
});

const year = document.querySelector('[data-year]');
if (year) year.textContent = new Date().getFullYear();

const footerContainer = document.querySelector('.footer .container');
if (footerContainer && !footerContainer.querySelector('.footer-dev')) {
  const footerDev = document.createElement('p');
  footerDev.className = 'footer-dev';

  const phone = '543416186760';
  const text = encodeURIComponent('Vi una web desarrollada por vos y quiero cotizar algo similar.');

  footerDev.innerHTML = `<a href="https://wa.me/${phone}?text=${text}" target="_blank" rel="noopener">Developed by Alex Santillan</a>`;
  footerContainer.appendChild(footerDev);
}

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const header = document.querySelector('.site-header');
if (header) {
  const updateHeaderState = () => {
    header.classList.toggle('is-scrolled', window.scrollY > 14);
  };

  updateHeaderState();
  window.addEventListener('scroll', updateHeaderState, { passive: true });
}

if (!prefersReducedMotion) {
  document.documentElement.classList.add('motion-enabled');

  const revealTargets = document.querySelectorAll(
    '.section, .card, .section-media, .gallery > div, .map-wrap, .actions .btn, .hero-note'
  );

  revealTargets.forEach((node, index) => {
    if (!node.classList.contains('reveal')) node.classList.add('reveal');
    node.style.setProperty('--reveal-delay', `${Math.min((index % 8) * 70, 350)}ms`);
  });

  const revealNodes = document.querySelectorAll('.reveal');
  if (revealNodes.length) {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.16, rootMargin: '0px 0px -36px 0px' });

    revealNodes.forEach((node) => revealObserver.observe(node));
  }

  const parallaxNodes = document.querySelectorAll('[data-parallax], .hero-video, .image-composition img');
  if (parallaxNodes.length) {
    let ticking = false;

    const updateParallax = () => {
      parallaxNodes.forEach((node) => {
        const configured = Number(node.dataset.parallax || (node.classList.contains('hero-video') ? 10 : 5));
        const speed = Math.max(2, Math.min(configured, 12));
        const rect = node.getBoundingClientRect();
        const offset = (window.innerHeight - rect.top) / (window.innerHeight + rect.height);
        const movement = (offset - 0.5) * speed;
        node.classList.add('parallax-item');
        node.style.setProperty('--parallax-offset', `${movement.toFixed(2)}px`);
      });
      ticking = false;
    };

    const queueParallax = () => {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(updateParallax);
      }
    };

    updateParallax();
    window.addEventListener('scroll', queueParallax, { passive: true });
    window.addEventListener('resize', queueParallax);
  }
} else {
  document.querySelectorAll('.reveal').forEach((node) => node.classList.add('is-visible'));
}

const WINE_PROFILE_STORAGE_KEY = 'lombardo_wine_profile';
const WINE_CATALOG_ENDPOINT = '/vinos_lombardo_base.json';

const resolvePageContextFromPath = (pathname = window.location.pathname) => {
  const cleanPath = String(pathname || '/').replace(/\/+$/, '') || '/';

  const directMap = {
    '/': 'home',
    '/index.html': 'home',
    '/pages/home': 'home',
    '/sommelier.html': 'sommelier',
    '/pages/sommelier-ia': 'sommelier',
    '/wine-tinder.html': 'wine-tinder',
    '/tinder-wine.html': 'wine-tinder',
    '/pages/wine-tinder': 'wine-tinder',
    '/pages/experiencias': 'experiencias',
    '/experiencias.html': 'experiencias',
    '/vinos.html': 'experiencias',
    '/cafe.html': 'experiencias',
    '/eventos.html': 'experiencias',
    '/galeria.html': 'experiencias',
    '/club.html': 'club',
    '/pages/club': 'club',
    '/tienda.html': 'club',
    '/pages/tienda': 'club',
    '/contacto.html': 'contacto',
    '/pages/contacto': 'contacto',
  };

  if (directMap[cleanPath]) return directMap[cleanPath];

  if (cleanPath.startsWith('/pages/sommelier-ia')) return 'sommelier';
  if (cleanPath.startsWith('/pages/wine-tinder')) return 'wine-tinder';
  if (cleanPath.startsWith('/pages/experiencias')) return 'experiencias';
  if (cleanPath.startsWith('/pages/club') || cleanPath.startsWith('/pages/tienda')) return 'club';
  if (cleanPath.startsWith('/pages/contacto')) return 'contacto';

  return 'general';
};

const readStoredWineProfile = () => {
  try {
    const raw = window.localStorage.getItem(WINE_PROFILE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_error) {
    return null;
  }
};

const persistWineProfile = (profileResult) => {
  if (!profileResult) return;
  try {
    window.localStorage.setItem(WINE_PROFILE_STORAGE_KEY, JSON.stringify(profileResult));
  } catch (_error) {
    // noop
  }
};

const sommelierApp = document.querySelector('#sommelier-app');

if (sommelierApp) {
  const localContextBanner = document.querySelector('[data-local-context]');
  const questions = [
    {
      key: 'tipo_vino',
      title: '¿Qué tipo de vino preferís?',
      helper: 'Elegí la opción que mejor represente tu preferencia.',
      options: ['Tinto', 'Blanco', 'Rosado', 'Espumoso', 'Me da igual'],
    },
    {
      key: 'presupuesto',
      title: '¿Cuánto querés gastar aproximadamente?',
      helper: 'Definí un rango para ajustar mejor la recomendación.',
      options: ['Hasta $12.000', '$12.000 a $20.000', '$20.000 a $35.000', 'Más de $35.000'],
    },
    {
      key: 'ocasion',
      title: '¿Para qué ocasión es el vino?',
      helper: 'Esto nos ayuda a encontrar el perfil ideal.',
      options: ['Asado o comida', 'Cena con amigos', 'Regalo', 'Para todos los días', 'Quiero descubrir algo nuevo'],
    },
    {
      key: 'comida',
      title: '¿Con qué lo vas a acompañar?',
      helper: 'Elegí el maridaje principal o si va solo.',
      options: ['Carne', 'Pasta', 'Picada', 'Pescado / sushi', 'Sin comida'],
    },
    {
      key: 'estilo',
      title: '¿Qué estilo de vino te gusta más?',
      helper: 'Si no estás seguro, también podemos orientarte.',
      options: ['Suave', 'Frutado', 'Intenso', 'Elegante', 'No sé'],
    },
  ];

  const sommelierQuotes = [
    'El mejor vino no siempre es el más caro, sino el que mejor acompaña el momento.',
    'Si estás entre dos opciones, elegí la que más te dé curiosidad.',
    'Un buen vino cambia una comida; uno muy bueno cambia la noche.',
    'El vino también es descubrimiento. Animate a probar algo distinto.',
    'A veces el mejor vino es simplemente el que compartís.',
  ];

  const answerMappings = {
    tipo_vino: {
      Tinto: 'tinto',
      Blanco: 'blanco',
      Rosado: 'rosado',
      Espumoso: 'espumoso',
      'Me da igual': '',
    },
    presupuesto: {
      'Hasta $12.000': 'bajo',
      '$12.000 a $20.000': 'medio',
      '$20.000 a $35.000': 'alto',
      'Más de $35.000': 'premium',
    },
    ocasion: {
      'Asado o comida': 'asado',
      'Cena con amigos': 'cena_amigos',
      Regalo: 'regalo',
      'Para todos los días': 'diario',
      'Quiero descubrir algo nuevo': 'descubrir',
    },
    comida: {
      Carne: 'carne',
      Pasta: 'pasta',
      Picada: 'picada',
      'Pescado / sushi': 'pescado_sushi',
      'Sin comida': 'sin_comida',
    },
  };

  let winesCatalog = [];

  const responses = {
    tipo_vino: '',
    presupuesto: '',
    ocasion: '',
    comida: '',
    estilo: '',
    texto_libre: '',
  };

  let inferredSignals = null;
  let currentStep = 0;

  const stepCurrent = sommelierApp.querySelector('[data-step-current]');
  const stepTotal = sommelierApp.querySelector('[data-step-total]');
  const stepTitle = sommelierApp.querySelector('[data-step-title]');
  const progressTrack = sommelierApp.querySelector('.sommelier-progress-track');
  const progressFill = sommelierApp.querySelector('[data-progress-fill]');
  const quizPanel = sommelierApp.querySelector('[data-quiz-panel]');
  const resultPanel = sommelierApp.querySelector('[data-result]');
  const loadingPanel = sommelierApp.querySelector('[data-result-loading]');
  const questionTitle = sommelierApp.querySelector('[data-question-title]');
  const questionHelper = sommelierApp.querySelector('[data-question-helper]');
  const optionsWrap = sommelierApp.querySelector('[data-options]');
  const nextBtn = sommelierApp.querySelector('[data-next]');
  const prevBtn = sommelierApp.querySelector('[data-prev]');
  const submitBtn = sommelierApp.querySelector('[data-submit]');
  const restartBtn = sommelierApp.querySelector('[data-restart]');
  const resultList = sommelierApp.querySelector('[data-result-list]');
  const profileBlock = sommelierApp.querySelector('[data-profile]');
  const profileName = sommelierApp.querySelector('[data-profile-name]');
  const profileDescription = sommelierApp.querySelector('[data-profile-description]');
  const freeTextWrap = sommelierApp.querySelector('[data-free-text-wrap]');
  const freeTextInput = sommelierApp.querySelector('[data-free-text]');
  const boxBlock = sommelierApp.querySelector('[data-box]');
  const boxList = sommelierApp.querySelector('[data-box-list]');
  const boxNote = sommelierApp.querySelector('[data-box-note]');
  const membershipBlock = sommelierApp.querySelector('[data-membership]');
  const membershipList = sommelierApp.querySelector('[data-membership-list]');
  const membershipNote = sommelierApp.querySelector('[data-membership-note]');
  const membershipWaLink = sommelierApp.querySelector('[data-membership-wa]');
  const sommelierQuote = sommelierApp.querySelector('[data-sommelier-quote]');
  const aiChatBlock = sommelierApp.querySelector('[data-ai-chat]');
  const chatMessages = sommelierApp.querySelector('[data-chat-messages]');
  const chatForm = sommelierApp.querySelector('[data-chat-form]');
  const chatInput = sommelierApp.querySelector('[data-chat-input]');
  const chatSubmit = sommelierApp.querySelector('[data-chat-submit]');
  const closingBlock = sommelierApp.querySelector('[data-sommelier-closing]');
  const resultActions = sommelierApp.querySelector('.sommelier-result-actions');
  const waLink = sommelierApp.querySelector('[data-wa-link]');

  const requiredQuestionKeys = questions.map((question) => question.key);

  if (stepTotal) stepTotal.textContent = String(questions.length);

  const isComplete = () => requiredQuestionKeys.every((key) => Boolean(responses[key]));

  const setPanelTransition = (panel) => {
    panel.classList.add('is-transitioning');
    window.setTimeout(() => panel.classList.remove('is-transitioning'), 200);
  };

  const showLocalContextIfNeeded = () => {
    if (!localContextBanner) return;
    const isLocalVisit = new URLSearchParams(window.location.search).get('local') === 'true';
    localContextBanner.hidden = !isLocalVisit;
  };

  const hideLocalContext = () => {
    if (localContextBanner) localContextBanner.hidden = true;
  };

  const chatHistory = [];
  let currentWineProfile = readStoredWineProfile();

  const getSommelierPageContext = () => getPageContext();

  let sommelierLocalCatalogCache = null;

  const getSommelierLocalCatalog = async () => {
    if (Array.isArray(sommelierLocalCatalogCache)) return sommelierLocalCatalogCache;

    const response = await fetch(WINE_CATALOG_ENDPOINT, { cache: 'no-store' });
    const data = await response.json().catch(() => []);
    sommelierLocalCatalogCache = Array.isArray(data) ? data.filter((wine) => wine?.activo !== false) : [];
    return sommelierLocalCatalogCache;
  };

  const buildSommelierLocalFallback = async (message) => {
    const wines = await getSommelierLocalCatalog();
    if (!wines.length) return 'Ahora mismo no pude responder. Probá de nuevo en unos segundos.';

    const normalized = String(message || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '');

    const priorities = wines.map((wine) => {
      let score = 0;
      if (/regal/.test(normalized) && wine.ocasion === 'regalo') score += 4;
      if (/(asado|carne|parrilla)/.test(normalized) && wine.maridaje_principal === 'carne') score += 4;
      if (/(picada|queso|fiambre)/.test(normalized) && wine.maridaje_principal === 'picada') score += 4;
      if (/(blanco|fresco|suave)/.test(normalized) && wine.tipo_vino === 'blanco') score += 2;
      if (/(tinto|intenso|cuerpo)/.test(normalized) && wine.tipo_vino === 'tinto') score += 2;
      if (wine.prioridad_venta === 'alta') score += 1;
      return { wine, score };
    });

    const selected = priorities
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((entry) => entry.wine);

    const lines = selected.map((wine) => `• ${wine.nombre} · ${wine.varietal} · ${formatPrice(wine.precio)}`);

    return [
      'Estoy trabajando con nuestro catálogo local en este momento. Te dejo una selección para avanzar:',
      ...lines,
      'Si querés, te la ajusto por ocasión, comida o presupuesto.',
    ].join('\n');
  };

  const appendChatMessage = (role, content, options = {}) => {
    if (!chatMessages || !content) return null;

    const item = document.createElement('article');
    item.className = `sommelier-chat-message is-${role}`;
    if (options.typing) item.classList.add('is-typing');

    const label = document.createElement('p');
    label.className = 'sommelier-chat-role';
    label.textContent = role === 'assistant' ? 'Sommelier IA' : 'Vos';

    const body = document.createElement('p');
    body.className = 'sommelier-chat-content';
    body.textContent = content;

    item.appendChild(label);
    item.appendChild(body);
    chatMessages.appendChild(item);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    return item;
  };

  const setChatLoading = (isLoading) => {
    if (!chatInput || !chatSubmit) return;
    chatInput.disabled = isLoading;
    chatSubmit.disabled = isLoading;
    chatSubmit.textContent = isLoading ? 'Enviando...' : 'Enviar';
  };

  const resolveAssistantApiCandidates = () => {
    const normalizeEndpoint = (value) => {
      const raw = String(value || '').trim();
      if (!raw) return '';
      if (/\/api\/sommelier-chat\/?$/i.test(raw)) return raw.replace(/\/$/, '');
      return `${raw.replace(/\/$/, '')}/api/sommelier-chat`;
    };

    const safeReadStorage = (key) => {
      try {
        return window.localStorage?.getItem(key)?.trim() || '';
      } catch (error) {
        return '';
      }
    };

    const params = new URLSearchParams(window.location.search);
    const explicit = document.querySelector('meta[name="assistant-api-url"]')?.content?.trim();
    const base = document.querySelector('meta[name="assistant-api-base"]')?.content?.trim();
    const queryUrl = params.get('assistant_api_url')?.trim();
    const queryBase = params.get('assistant_api_base')?.trim();
    const localUrl = safeReadStorage('assistant-api-url');
    const localBase = safeReadStorage('assistant-api-base');

    const fallbackDomain =
      window.location.hostname === 'www.lombardomercato.com' ? 'https://lombardo-web.vercel.app' : '';

    const candidates = [
      normalizeEndpoint(explicit),
      normalizeEndpoint(base),
      normalizeEndpoint(queryUrl),
      normalizeEndpoint(queryBase),
      normalizeEndpoint(localUrl),
      normalizeEndpoint(localBase),
      '/api/sommelier-chat',
      normalizeEndpoint(fallbackDomain),
    ].filter(Boolean);

    return [...new Set(candidates)];
  };


  const requestSommelierChat = async (message) => {
    const endpoints = resolveAssistantApiCandidates();
    let latestError = null;

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message,
            history: chatHistory.slice(-14),
            pagina_actual: getSommelierPageContext(),
            wine_profile: currentWineProfile,
          }),
        });

        const rawBody = await response.text().catch(() => '');
        let data = {};
        try {
          data = rawBody ? JSON.parse(rawBody) : {};
        } catch (error) {
          data = {};
        }

        if (!response.ok) {
          const endpointUnavailable = [404, 405, 500, 501, 502, 503].includes(response.status);
          const nonJsonReply = !rawBody || rawBody.trim().startsWith('<!DOCTYPE') || rawBody.trim().startsWith('<html');

          if (endpointUnavailable && (nonJsonReply || !data.error_code)) {
            latestError = new Error(`Endpoint no disponible en ${endpoint}`);
            continue;
          }

          throw new Error(data.error || 'No se pudo obtener una respuesta del Sommelier IA.');
        }

        return typeof data.reply === 'string'
          ? data.reply.trim()
          : typeof data.answer === 'string'
          ? data.answer.trim()
          : '';
      } catch (error) {
        latestError = error;
      }
    }

    throw latestError || new Error('No se pudo conectar con el Sommelier IA.');
  };

  const initSommelierChat = () => {
    if (!aiChatBlock || !chatForm || !chatInput) return;

    appendChatMessage(
      'assistant',
      '¡Hola! Soy el Sommelier IA de Lombardo. Contame qué estás buscando y te recomiendo opciones reales de nuestra base.'
    );

    chatForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const message = chatInput.value.trim();

      if (!message) return;

      chatHistory.push({ role: 'user', content: message });
      appendChatMessage('user', message);
      chatInput.value = '';
      setChatLoading(true);

      const typingNode = appendChatMessage('assistant', 'Escribiendo…', { typing: true });

      try {
        const answer = await requestSommelierChat(message);
        chatHistory.push({ role: 'assistant', content: answer });

        if (typingNode) typingNode.remove();
        appendChatMessage('assistant', answer || 'No encontré una sugerencia clara. Si querés, probá reformulando con comida, ocasión o estilo.');
      } catch (error) {
        if (typingNode) typingNode.remove();
        const localFallback = await buildSommelierLocalFallback(message).catch(() => '');
        const safeFallback = localFallback || 'Ahora mismo no pude responder. Probá de nuevo en unos segundos.';
        appendChatMessage('assistant', safeFallback);
        chatHistory.push({ role: 'assistant', content: safeFallback });
        console.error(error);
      } finally {
        setChatLoading(false);
        chatInput.focus();
      }
    });
  };

  const renderQuestion = () => {
    const question = questions[currentStep];
    const selected = responses[question.key];

    if (stepCurrent) stepCurrent.textContent = String(currentStep + 1);
    if (stepTitle) stepTitle.textContent = question.title;
    if (questionTitle) questionTitle.textContent = question.title;
    if (questionHelper) questionHelper.textContent = question.helper;
    if (progressTrack) progressTrack.setAttribute('aria-valuenow', String(currentStep + 1));

    if (progressFill) {
      const progressValue = ((currentStep + 1) / questions.length) * 100;
      progressFill.style.width = `${progressValue}%`;
    }

    optionsWrap.innerHTML = '';

    question.options.forEach((option) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'sommelier-option';
      button.textContent = option;

      if (option === selected) {
        button.classList.add('is-selected');
      }

      button.addEventListener('click', () => {
        hideLocalContext();
        responses[question.key] = option;
        renderQuestion();
      });

      optionsWrap.appendChild(button);
    });

    const isFinalStep = currentStep === questions.length - 1;

    if (freeTextWrap) {
      freeTextWrap.hidden = !isFinalStep;
    }

    if (freeTextInput) {
      freeTextInput.value = responses.texto_libre;
    }

    prevBtn.hidden = currentStep === 0;
    const hasSelection = Boolean(selected);
    nextBtn.hidden = isFinalStep;
    nextBtn.disabled = !hasSelection;
    submitBtn.hidden = !isFinalStep;
    submitBtn.disabled = !isComplete();
  };

  const formatPrice = (value) => {
    if (typeof value !== 'number') return value;
    return `$${new Intl.NumberFormat('es-AR').format(value)}`;
  };

  const OPENAI_MODEL = 'gpt-4o-mini';

  const getOpenAIApiKey = () => (
    document.querySelector('meta[name="openai-api-key"]')?.getAttribute('content')?.trim() || ''
  );

  const getGoogleSheetsEndpoint = () => {
    const configEndpoint = window.LOMBARDO_CONFIG?.googleSheetsEndpoint;
    if (typeof configEndpoint === 'string' && configEndpoint.trim()) return configEndpoint.trim();

    const dataEndpoint = sommelierApp.dataset.googleSheetsEndpoint;
    if (typeof dataEndpoint === 'string' && dataEndpoint.trim()) return dataEndpoint.trim();

    return document.querySelector('meta[name="google-sheets-endpoint"]')?.getAttribute('content')?.trim() || '';
  };

  const persistSommelierResponse = async () => {
    const endpoint = getGoogleSheetsEndpoint();

    if (!endpoint) return;

    const payload = {
      fecha: new Date().toISOString(),
      tipo_vino: responses.tipo_vino,
      presupuesto: responses.presupuesto,
      ocasion: responses.ocasion,
      comida: responses.comida,
      estilo: responses.estilo,
      texto_libre: responses.texto_libre,
    };

    try {
      const savePromise = fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        keepalive: true,
      });

      const timeoutPromise = new Promise((resolve) => {
        window.setTimeout(() => resolve(null), 3500);
      });

      await Promise.race([savePromise, timeoutPromise]);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('No se pudo guardar la respuesta en Google Sheets:', error);

      if (navigator.sendBeacon) {
        try {
          const beaconPayload = new Blob([JSON.stringify(payload)], { type: 'application/json' });
          navigator.sendBeacon(endpoint, beaconPayload);
        } catch (beaconError) {
          // eslint-disable-next-line no-console
          console.warn('No se pudo guardar la respuesta con sendBeacon:', beaconError);
        }
      }
    }
  };

  const normalizeFreeTextSignals = (payload) => {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;

    const normalize = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');

    return {
      tipo_vino: normalize(payload.tipo_vino),
      ocasion: normalize(payload.ocasion),
      comida: normalize(payload.comida),
      estilo: normalize(payload.estilo),
      nivel_precio: normalize(payload.nivel_precio),
    };
  };

  const getFreeTextSignals = async (freeText) => {
    const trimmedText = freeText.trim();

    if (!trimmedText) return null;

    const apiKey = getOpenAIApiKey();

    if (!apiKey) {
      // eslint-disable-next-line no-console
      console.warn('OpenAI API key no configurada. Se omite interpretación de texto libre.');
      return null;
    }

    const prompt = [
      'Actuá como sommelier y analista de intención.',
      'Analizá el texto del cliente y detectá posibles señales sobre:',
      'tipo_vino',
      'ocasion',
      'comida',
      'estilo',
      'nivel_precio',
      'No inventes vinos.',
      'Solo interpretá intención.',
      'Respondé solo en JSON con esta estructura:',
      '{',
      '  "tipo_vino": "",',
      '  "ocasion": "",',
      '  "comida": "",',
      '  "estilo": "",',
      '  "nivel_precio": ""',
      '}',
      `Texto del cliente: """${trimmedText}"""`,
    ].join('\n');

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        input: prompt,
        text: {
          format: {
            type: 'json_schema',
            name: 'sommelier_intent_signals',
            schema: {
              type: 'object',
              properties: {
                tipo_vino: { type: 'string' },
                ocasion: { type: 'string' },
                comida: { type: 'string' },
                estilo: { type: 'string' },
                nivel_precio: { type: 'string' },
              },
              required: ['tipo_vino', 'ocasion', 'comida', 'estilo', 'nivel_precio'],
              additionalProperties: false,
            },
          },
        },
      }),
    });

    if (!response.ok) {
      throw new Error('No se pudo interpretar el texto libre con OpenAI.');
    }

    const data = await response.json();
    const rawOutput = data.output_text;

    if (!rawOutput) return null;

    try {
      return normalizeFreeTextSignals(JSON.parse(rawOutput));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('No se pudo parsear la respuesta JSON de OpenAI:', error);
      return null;
    }
  };

  const mapResponseValue = (key, value) => {
    if (!value) return '';

    const normalizedValue = value.toLowerCase();
    const options = answerMappings[key] || {};

    return Object.keys(options).find((option) => options[option] === normalizedValue) || '';
  };

  const applyFreeTextSignals = (signals) => {
    if (!signals) return;

    const inferredTipo = mapResponseValue('tipo_vino', signals.tipo_vino);
    const inferredOcasion = mapResponseValue('ocasion', signals.ocasion);
    const inferredComida = mapResponseValue('comida', signals.comida);
    const inferredPresupuesto = mapResponseValue('presupuesto', signals.nivel_precio);

    if (!responses.tipo_vino && inferredTipo) responses.tipo_vino = inferredTipo;
    if (!responses.ocasion && inferredOcasion) responses.ocasion = inferredOcasion;
    if (!responses.comida && inferredComida) responses.comida = inferredComida;
    if (!responses.presupuesto && inferredPresupuesto) responses.presupuesto = inferredPresupuesto;

    if (!responses.estilo && signals.estilo) {
      const normalizedStyle = signals.estilo.toLowerCase();
      const styleAliases = {
        suave: 'Suave',
        liviano: 'Suave',
        ligero: 'Suave',
        frutado: 'Frutado',
        fresco: 'Frutado',
        intenso: 'Intenso',
        robusto: 'Intenso',
        elegante: 'Elegante',
        medio: 'No sé',
      };

      const styleOption = styleAliases[normalizedStyle];
      if (styleOption && questions.find((question) => question.key === 'estilo')?.options.includes(styleOption)) {
        responses.estilo = styleOption;
      }
    }
  };

  const getNormalizedAnswers = () => ({
    tipo_vino: answerMappings.tipo_vino[responses.tipo_vino] || '',
    presupuesto: answerMappings.presupuesto[responses.presupuesto] || '',
    ocasion: answerMappings.ocasion[responses.ocasion] || '',
    comida: answerMappings.comida[responses.comida] || '',
    estilo: responses.estilo ? responses.estilo.toLowerCase() : '',
  });

  const humanizeField = (fieldKey, fallback = 'tu momento') => {
    const dictionary = {
      ocasion: {
        asado: 'asado o comida con carácter',
        cena_amigos: 'cena con amigos',
        regalo: 'regalo con impacto',
        diario: 'disfrutar todos los días',
        descubrir: 'salir de lo de siempre',
      },
      comida: {
        carne: 'carnes y platos intensos',
        pasta: 'pastas y platos de cocina casera',
        picada: 'picadas y tapeo',
        pescado_sushi: 'pescados, sushi y sabores frescos',
        sin_comida: 'brindar sin necesidad de comida',
      },
      estilo: {
        suave: 'perfil suave',
        frutado: 'perfil frutado',
        intenso: 'perfil intenso',
        elegante: 'perfil elegante',
      },
    };

    const normalizedAnswers = getNormalizedAnswers();
    const value = normalizedAnswers[fieldKey] || '';

    return dictionary[fieldKey]?.[value] || fallback;
  };

  const getRoleLabel = (role) => {
    if (role === 'principal') return 'Recomendación principal';
    if (role === 'premium') return 'Toque premium';
    return 'Para descubrir';
  };

  const getRecommendationMessage = (role, wine, profile) => {
    const normalized = getNormalizedAnswers();
    const occasion = normalized.ocasion || '';
    const style = normalized.estilo || '';
    const food = normalized.comida || '';
    const wineType = (wine?.tipo_vino || '').toLowerCase();
    const typeLabel = wineType ? wineType.charAt(0).toUpperCase() + wineType.slice(1) : 'vino';
    const varietalLabel = wine?.varietal || 'de corte';
    const profileName = profile?.name || 'Paladar Lombardo';

    const occasionFocus = {
      regalo: 'como regalo, transmite criterio y buen gusto desde el primer momento',
      asado: 'en mesa con carnes responde con carácter y buena estructura',
      cena_amigos: 'en una cena con amigos fluye fácil y sostiene la charla',
      descubrir: 'cuando querés probar algo nuevo, suma interés sin perder equilibrio',
      relax: 'para bajar un cambio, acompaña con un ritmo amable y disfrutable',
    }[occasion] || 'se adapta al momento con una propuesta confiable';

    const foodFocus = {
      carne: 'con carnes logra maridajes redondos',
      pasta: 'con pastas se vuelve expresivo sin tapar el plato',
      picada: 'con picada se luce por su versatilidad',
      pescado_sushi: 'con pescados y sushi mantiene frescura y precisión',
      sin_comida: 'funciona muy bien incluso sin comida, solo para disfrutar la copa',
    }[food] || 'acompaña distintos platos con criterio';

    const styleFocus = {
      suave: 'de paso sedoso y final amable',
      frutado: 'frutado y expresivo, con mucha identidad en nariz',
      intenso: 'con buen cuerpo, energía y persistencia',
      elegante: 'fino, prolijo y de perfil elegante',
    }[style] || 'equilibrado y versátil';

    const profileFocus = profileName === 'Explorador de Vinos'
      ? 'Encaja con tu perfil explorador porque aporta novedad con base técnica sólida.'
      : profileName === 'Clásico Malbec'
        ? 'Va perfecto con tu perfil clásico: seguro, gastronómico y consistente.'
        : `Está alineado con tu perfil ${profileName} y la forma en la que disfrutás el vino.`;

    if (role === 'premium') {
      const premiumByOccasion = occasion === 'regalo'
        ? 'Es la botella que eleva la experiencia y deja una impresión más sofisticada.'
        : 'Es un upgrade natural: mantiene tu línea de gusto y suma más profundidad en copa.';

      return `${premiumByOccasion} Este ${typeLabel} ${varietalLabel} se siente ${styleFocus}; ${foodFocus}.`;
    }

    if (role === 'descubrir') {
      const discoveryLead = profileName === 'Explorador de Vinos'
        ? 'Acá está tu recomendación de descubrimiento: distinta, expresiva y con personalidad propia.'
        : `Como tercera opción, esta etiqueta te abre una puerta nueva dentro de tu estilo ${style || 'preferido'}.`;

      return `${discoveryLead} ${occasionFocus}. ${profileFocus}`;
    }

    return `Tu recomendación principal es este ${typeLabel} ${varietalLabel}: la opción más segura para acertar con lo que buscás. ${occasionFocus}; ${foodFocus}. ${profileFocus}`;
  };

  const getPrimaryRecommendationDetail = (wine, profile) => {
    const normalized = getNormalizedAnswers();
    const occasionLabel = humanizeField('ocasion', 'tu ocasión');
    const foodLabel = humanizeField('comida', 'tu comida ideal');
    const styleLabel = humanizeField('estilo', 'perfil versátil');
    const typeLabel = wine?.tipo_vino ? wine.tipo_vino.charAt(0).toUpperCase() + wine.tipo_vino.slice(1) : 'Vino';
    const varietalLabel = wine?.varietal || 'de corte';
    const profileName = profile?.name || 'Paladar Lombardo';

    const refinedNote = normalized.ocasion === 'regalo'
      ? 'Tiene presencia y elegancia para quedar bien sin margen de error.'
      : normalized.ocasion === 'asado'
        ? 'En una mesa con comida responde con estructura, fruta y muy buen ritmo.'
        : 'Mantiene equilibrio entre disfrute inmediato y carácter en copa.';

    return `${typeLabel} ${varietalLabel} seleccionado como eje de tu experiencia en ${occasionLabel}. Está pensado para acompañar ${foodLabel}, respetar tu búsqueda de ${styleLabel} y representar fielmente tu perfil ${profileName}. ${refinedNote}`;
  };

  const getRecommendationBadges = (role, wine) => {
    const normalized = getNormalizedAnswers();
    const foodSource = (wine?.maridaje_principal || normalized.comida || '').toLowerCase();
    const styleSource = (normalized.estilo || '').toLowerCase();

    const foodBadge = {
      carne: 'Ideal para carne',
      pasta: 'Ideal para pasta',
      picada: 'Ideal para picadas',
      pescado_sushi: 'Ideal para sushi',
      sin_comida: 'Ideal para brindar',
    }[foodSource] || 'Maridaje versátil';

    const styleBadge = {
      suave: 'Vino suave',
      frutado: 'Vino frutado',
      intenso: 'Vino intenso',
      elegante: 'Vino elegante',
    }[styleSource] || 'Estilo equilibrado';

    const roleBadge = {
      principal: 'Opción segura',
      premium: 'Opción elegante',
      descubrir: 'Para descubrir',
    }[role] || 'Recomendado para vos';

    return [foodBadge, styleBadge, roleBadge].slice(0, 3);
  };


  const sortByPriorityAndPrice = (a, b) => {
    const priorityOrder = { alta: 3, media: 2, baja: 1 };
    const aPriority = priorityOrder[(a.prioridad_venta || '').toLowerCase()] || 0;
    const bPriority = priorityOrder[(b.prioridad_venta || '').toLowerCase()] || 0;

    if (bPriority !== aPriority) return bPriority - aPriority;
    return (a.precio || 0) - (b.precio || 0);
  };

  const getWineScore = (wine) => {
    let score = 0;

    const selectedTipo = answerMappings.tipo_vino[responses.tipo_vino];
    const selectedPrecio = answerMappings.presupuesto[responses.presupuesto];
    const selectedComida = answerMappings.comida[responses.comida];
    const selectedOcasion = answerMappings.ocasion[responses.ocasion];

    if (selectedTipo && wine.tipo_vino?.toLowerCase() === selectedTipo) score += 25;
    if (selectedPrecio && wine.nivel_precio?.toLowerCase() === selectedPrecio) score += 20;
    if (selectedComida && wine.maridaje_principal?.toLowerCase() === selectedComida) score += 25;
    if (selectedOcasion && wine.ocasion?.toLowerCase() === selectedOcasion) score += 20;

    if (inferredSignals) {
      if (inferredSignals.tipo_vino && inferredSignals.tipo_vino === wine.tipo_vino?.toLowerCase()) score += 6;
      if (inferredSignals.nivel_precio && inferredSignals.nivel_precio === wine.nivel_precio?.toLowerCase()) score += 5;
      if (inferredSignals.comida && inferredSignals.comida === wine.maridaje_principal?.toLowerCase()) score += 6;
      if (inferredSignals.ocasion && inferredSignals.ocasion === wine.ocasion?.toLowerCase()) score += 5;
    }

    if ((wine.prioridad_venta || '').toLowerCase() === 'alta') score += 10;

    return score;
  };

  const getWineProfile = () => {
    const detectWineProfile = (userData, conversationHistory = []) => {
      const emptyScores = {
        clasico_malbec: 0,
        explorador: 0,
        suaves: 0,
        gastronomico: 0,
        regalo: 0,
        premium: 0,
      };

      const normalize = (value) => String(value || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
      const score = { ...emptyScores };
      const normalized = {
        tipo_vino: normalize(userData?.tipo_vino),
        ocasion: normalize(userData?.ocasion),
        comida: normalize(userData?.comida),
        estilo: normalize(userData?.estilo),
        presupuesto: normalize(userData?.presupuesto),
      };
      const conversationText = conversationHistory.map((entry) => normalize(entry?.content)).join(' ');

      if (normalized.tipo_vino === 'tinto') score.clasico_malbec += 2;
      if (normalized.comida === 'carne') score.clasico_malbec += 2;
      if (normalized.estilo === 'intenso') score.clasico_malbec += 2;
      if (normalized.ocasion === 'asado') score.clasico_malbec += 2;

      if (normalized.ocasion === 'descubrir') score.explorador += 2;
      if (/algo distinto|quiero descubrir|probar algo nuevo|rareza|explorar|fuera de lo tradicional/.test(conversationText)) score.explorador += 3;

      if (normalized.estilo === 'suave') score.suaves += 3;
      if (/suave|no muy pesado|liviano|ligero|delicado/.test(conversationText)) score.suaves += 3;

      if (normalized.comida && normalized.comida !== 'sin_comida') score.gastronomico += 2;
      if (/maridaje|maridar|con que lo acompano|con que acompanar|que vino va con|plato|comida/.test(conversationText)) score.gastronomico += 2;
      if (/carne|pasta|sushi|pescado|queso|picada|parrilla/.test(conversationText)) score.gastronomico += 2;

      if (normalized.ocasion === 'regalo') score.regalo += 3;
      if (/regalar|regalo|quedar bien|ocasion especial/.test(conversationText)) score.regalo += 2;

      if (normalized.presupuesto === 'premium' || normalized.presupuesto === 'alto') score.premium += 2;
      if (/premium|alta gama|elegante|especial|de mayor nivel|reserva/.test(conversationText)) score.premium += 2;

      const profileMap = {
        clasico_malbec: {
          name: 'Clásico Malbec',
          description: 'Te inclinás por vinos con cuerpo, perfil clásico y muy buenos para comida.',
          nextSuggestion: 'caja_parrillera',
        },
        explorador: {
          name: 'Explorador de Vinos',
          description: 'Te gusta descubrir etiquetas nuevas, estilos poco obvios y salir de lo tradicional.',
          nextSuggestion: 'descubrimiento_del_mes',
        },
        suaves: {
          name: 'Amante de Vinos Suaves',
          description: 'Preferís vinos livianos, amables y fáciles de disfrutar.',
          nextSuggestion: 'seleccion_liviana',
        },
        gastronomico: {
          name: 'Gastronómico',
          description: 'Elegís pensando en la mesa: te importa el maridaje y cómo acompaña cada plato.',
          nextSuggestion: 'maridaje_de_autor',
        },
        regalo: {
          name: 'Regalo / Ocasión Especial',
          description: 'Buscás opciones elegantes, seguras y con buena presencia para quedar bien.',
          nextSuggestion: 'caja_regalo',
        },
        premium: {
          name: 'Wine Lover Premium',
          description: 'Te interesan etiquetas de mayor nivel, con carácter especial y perfil sofisticado.',
          nextSuggestion: 'mensualidad_reserva',
        },
      };

      const sortedProfiles = Object.entries(score).sort((a, b) => b[1] - a[1]);
      const [topKey, topScore] = sortedProfiles[0] || ['clasico_malbec', 0];
      const fallbackProfile = {
        name: 'Paladar Lombardo',
        description: 'Tenés un perfil versátil y abierto para disfrutar distintas etiquetas según el momento.',
        nextSuggestion: 'seleccion_descubrimiento',
      };

      const topProfile = topScore > 0 ? profileMap[topKey] : fallbackProfile;

      return {
        perfil: topProfile.name,
        score,
        descripcion: topProfile.description,
        sugerencia_siguiente: topProfile.nextSuggestion,
      };
    };

    const normalizedResponses = getNormalizedAnswers();
    const profileResult = detectWineProfile(
      normalizedResponses,
      [
        { role: 'user', content: responses.texto_libre || '' },
        ...chatHistory.slice(-10),
      ],
    );

    currentWineProfile = profileResult;
    persistWineProfile(profileResult);

    return {
      name: profileResult.perfil,
      description: profileResult.descripcion,
      score: profileResult.score,
      nextSuggestion: profileResult.sugerencia_siguiente,
    };
  };

  const getRankedWines = (excludeNames = new Set()) => winesCatalog
    .filter((wine) => wine.activo === true && !excludeNames.has(wine.nombre))
    .map((wine) => ({ ...wine, score: getWineScore(wine) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return sortByPriorityAndPrice(a, b);
    });

  const pickDistinctWine = (pool, selectedNames, predicate) => {
    const candidate = pool.find((wine) => !selectedNames.has(wine.nombre) && predicate(wine));
    if (candidate) {
      selectedNames.add(candidate.nombre);
      return candidate;
    }

    const fallback = pool.find((wine) => !selectedNames.has(wine.nombre));
    if (fallback) {
      selectedNames.add(fallback.nombre);
      return fallback;
    }

    return null;
  };

  const buildRecommendationSet = () => {
    const ranked = getRankedWines();
    const selectedNames = new Set();

    const principal = pickDistinctWine(ranked, selectedNames, (wine) => wine.score >= 30 || wine.prioridad_venta === 'alta');
    const premium = pickDistinctWine(
      ranked,
      selectedNames,
      (wine) => ['alto', 'premium'].includes((wine.nivel_precio || '').toLowerCase()) || (wine.precio || 0) >= 22000,
    );
    const principalType = principal?.tipo_vino;
    const discovery = pickDistinctWine(
      ranked,
      selectedNames,
      (wine) => wine.tipo_vino !== principalType || wine.ocasion === 'descubrir' || wine.varietal !== principal?.varietal,
    );

    return [
      { role: 'principal', wine: principal },
      { role: 'premium', wine: premium },
      { role: 'descubrir', wine: discovery },
    ].filter((entry) => entry.wine);
  };

  const getBoxRoleLabel = (role) => {
    if (role === 'anchor') return 'Vino ancla';
    if (role === 'upgrade') return 'Vino upgrade';
    return 'Vino descubrimiento';
  };

  const getBoxRoleDescription = (role, profile, wine) => {
    const normalized = getNormalizedAnswers();
    const occasionLabel = humanizeField('ocasion', 'tu ocasión');
    const styleLabel = humanizeField('estilo', 'tu estilo');
    const varietalLabel = wine?.varietal || 'esta etiqueta';

    if (role === 'anchor') {
      return `La base segura de tu caja: un ${varietalLabel} alineado a ${profile.name} y pensado para ${occasionLabel}.`;
    }

    if (role === 'upgrade') {
      return `Una versión más especial de tu perfil ${styleLabel}: suma complejidad y un toque más elegante en copa.`;
    }

    return `La botella para abrir el paladar con criterio: distinta, compatible con tu perfil y elegida para descubrir sin riesgos.`;
  };

  const buildCuratedBox = (excludeNames = new Set()) => {
    const ranked = getRankedWines(excludeNames);
    const selectedNames = new Set();

    const anchor = pickDistinctWine(ranked, selectedNames, (wine) => wine.score >= 24 || (wine.prioridad_venta || '').toLowerCase() === 'alta');
    const upgrade = pickDistinctWine(
      ranked,
      selectedNames,
      (wine) => (
        ['alto', 'premium'].includes((wine.nivel_precio || '').toLowerCase())
        || (wine.precio || 0) >= (anchor?.precio || 0)
      ),
    );
    const discovery = pickDistinctWine(
      ranked,
      selectedNames,
      (wine) => wine.tipo_vino !== anchor?.tipo_vino || wine.varietal !== anchor?.varietal || wine.ocasion === 'descubrir',
    );

    return [
      { role: 'anchor', wine: anchor },
      { role: 'upgrade', wine: upgrade },
      { role: 'discovery', wine: discovery },
    ].filter((entry) => entry.wine);
  };

  const getBoxClosingMessage = (profile) => {
    const normalizedOccasion = answerMappings.ocasion[responses.ocasion] || '';
    const suggestionHint = profile?.nextSuggestion ? ` Próximo paso sugerido: ${profile.nextSuggestion}.` : '';

    if (normalizedOccasion === 'regalo') {
      return `Armamos esta caja para que tengas una opción segura, una botella con un poco más de nivel y otra para descubrir algo distinto sin salirte de tu estilo. Ideal para regalar con criterio y buena presencia.${suggestionHint}`;
    }

    if (normalizedOccasion === 'asado' || normalizedOccasion === 'cena_amigos') {
      return `Armamos esta caja para que tengas una opción segura, una botella con un poco más de nivel y otra para descubrir algo distinto sin salirte de tu estilo. Funciona muy bien para compartir en mesa.${suggestionHint}`;
    }

    return `Armamos esta caja para que tengas una opción segura, una botella con un poco más de nivel y otra para descubrir algo distinto sin salirte de tu estilo. Queda alineada con tu perfil ${profile.name} y con la forma en la que disfrutás el vino.${suggestionHint}`;
  };

  const buildMonthlySelection = (excludeNames = new Set()) => {
    const ranked = getRankedWines(excludeNames);
    const selectedNames = new Set();

    const alignedOne = pickDistinctWine(ranked, selectedNames, (wine) => wine.score >= 24);
    const alignedTwo = pickDistinctWine(ranked, selectedNames, (wine) => wine.tipo_vino === alignedOne?.tipo_vino || wine.score >= 20);
    const discoverOne = pickDistinctWine(ranked, selectedNames, (wine) => wine.tipo_vino !== alignedOne?.tipo_vino || wine.ocasion === 'descubrir');

    return [alignedOne, alignedTwo, discoverOne].filter(Boolean);
  };

  const getMembershipMessage = (profile) => {
    const normalized = getNormalizedAnswers();
    const styleTone = {
      intenso: 'disfruta vinos con presencia',
      elegante: 'busca vinos finos y con criterio',
      suave: 'valora vinos amables y fáciles de disfrutar',
      frutado: 'prefiere vinos expresivos y frutados',
    }[normalized.estilo] || 'disfruta vinos con personalidad';

    const isPremiumPath = profile?.nextSuggestion === 'mensualidad_reserva';
    const premiumHint = isPremiumPath ? ' Te recomendamos priorizar una mensualidad de línea reserva.' : '';

    return `Una selección pensada para alguien que ${styleTone}, pero también quiere abrir espacio a nuevas etiquetas. Queda alineada con tu perfil ${profile.name} y con la forma en la que vivís el vino mes a mes.${premiumHint}`;
  };

  const updateSommelierWhatsAppLink = (recommendations, profile, monthlySelection) => {
    if (!waLink) return;

    const messageLines = [
      'Hola, usé el Sommelier de Vinos de Lombardo y me recomendó estas opciones:',
      '',
    ];

    recommendations.forEach((item) => {
      const wine = item.wine;
      if (wine?.nombre) messageLines.push(`- ${wine.nombre} (${getRoleLabel(item.role)})`);
    });

    if (profile?.name) messageLines.push('', `Mi perfil fue: ${profile.name}`);
    if (responses.ocasion) messageLines.push(`Ocasión: ${responses.ocasion}`);
    if (responses.presupuesto) messageLines.push(`Presupuesto: ${responses.presupuesto}`);

    if (monthlySelection?.length) {
      messageLines.push('', 'También quiero consultar esta mensualidad:');
      monthlySelection.forEach((wine) => messageLines.push(`- ${wine.nombre}`));
    }

    messageLines.push('', 'Quiero consultar disponibilidad.');

    waLink.href = `https://wa.me/543412762319?text=${encodeURIComponent(messageLines.join('\n'))}`;
  };

  const renderResults = () => {
    resultList.innerHTML = '';
    if (boxList) boxList.innerHTML = '';
    if (membershipList) membershipList.innerHTML = '';

    const recommendations = buildRecommendationSet();
    const profile = getWineProfile();
    const recommendedNames = new Set(recommendations.map((entry) => entry.wine.nombre));
    const curatedBox = buildCuratedBox(recommendedNames);
    const boxNames = new Set(curatedBox.map((entry) => entry.wine.nombre));
    const monthlySelection = buildMonthlySelection(new Set([...recommendedNames, ...boxNames]));

    recommendations.forEach((entry, index) => {
      const wine = entry.wine;
      const card = document.createElement('article');
      const isPrimary = index === 0;
      card.className = `sommelier-wine-card reveal is-visible ${isPrimary ? 'is-highlighted is-primary' : 'is-secondary'}`.trim();

      if (isPrimary) {
        card.innerHTML = `
          <p class="sommelier-primary-badge">Recomendado para vos</p>
          <p class="sommelier-wine-role">${getRoleLabel(entry.role)}</p>
          <h3>${wine.nombre}</h3>
          <p class="sommelier-price">${formatPrice(wine.precio)}</p>
          <p class="sommelier-wine-description">${getPrimaryRecommendationDetail(wine, profile)}</p>
          <div class="sommelier-wine-badges">${getRecommendationBadges(entry.role, wine).map((badge) => `<span class="sommelier-wine-badge">${badge}</span>`).join('')}</div>
        `;
      } else {
        card.innerHTML = `
          <p class="sommelier-wine-role">${getRoleLabel(entry.role)}</p>
          <h3>${wine.nombre}</h3>
          <p class="sommelier-price">${formatPrice(wine.precio)}</p>
          <p class="sommelier-wine-description">${getRecommendationMessage(entry.role, wine, profile)}</p>
          <div class="sommelier-wine-badges">${getRecommendationBadges(entry.role, wine).map((badge) => `<span class="sommelier-wine-badge">${badge}</span>`).join('')}</div>
        `;
      }

      resultList.appendChild(card);
    });

    if (boxList) {
      curatedBox.forEach((entry) => {
        const item = document.createElement('article');
        item.className = 'sommelier-box-item';
        item.innerHTML = `
          <p class="sommelier-box-role">${getBoxRoleLabel(entry.role)}</p>
          <h4>${entry.wine.nombre}</h4>
          <p>${formatPrice(entry.wine.precio)}</p>
          <p class="sommelier-box-role-description">${getBoxRoleDescription(entry.role, profile, entry.wine)}</p>
        `;
        boxList.appendChild(item);
      });
    }

    if (membershipList) {
      monthlySelection.forEach((wine, index) => {
        const item = document.createElement('article');
        item.className = 'sommelier-box-item';
        const roleLabel = index < 2 ? 'Alineado con tu estilo' : 'Descubrimiento del mes';
        item.innerHTML = `<p class="sommelier-box-role">${roleLabel}</p><h4>${wine.nombre}</h4><p>${formatPrice(wine.precio)}</p>`;
        membershipList.appendChild(item);
      });
    }

    if (profileBlock && profileName && profileDescription) {
      profileName.textContent = profile.name;
      const scoreSummary = Object.entries(profile.score || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([label, value]) => `${label.replace('_', ' ')}: ${value}`)
        .join(' · ');
      profileDescription.textContent = scoreSummary
        ? `${profile.description} Señales detectadas (${scoreSummary}).`
        : profile.description;
      profileBlock.hidden = false;
    }

    if (boxBlock && boxNote) {
      boxNote.textContent = getBoxClosingMessage(profile);
      boxBlock.hidden = false;
    }

    if (membershipBlock && membershipNote) {
      membershipNote.textContent = getMembershipMessage(profile);
      membershipBlock.hidden = false;

      if (membershipWaLink) {
        const lines = [
          'Hola, usé el Sommelier de Lombardo y quiero consultar por la mensualidad recomendada.',
          ...monthlySelection.map((wine) => `- ${wine.nombre}`),
          '',
          `Perfil detectado: ${profile.name}`,
        ];
        membershipWaLink.href = `https://wa.me/543412762319?text=${encodeURIComponent(lines.join('\n'))}`;
      }
    }

    if (sommelierQuote) {
      const randomIndex = Math.floor(Math.random() * sommelierQuotes.length);
      sommelierQuote.textContent = `“${sommelierQuotes[randomIndex]}”`;
    }

    updateSommelierWhatsAppLink(recommendations, profile, monthlySelection);
  };

  const animateResultSequence = () => {
    const primaryCard = resultList.querySelector('.sommelier-wine-card.is-primary');
    const secondaryCards = [...resultList.querySelectorAll('.sommelier-wine-card.is-secondary')];

    const sequence = [
      primaryCard,
      ...secondaryCards,
      profileBlock,
      boxBlock,
      membershipBlock,
      aiChatBlock,
      closingBlock,
      resultActions,
    ].filter((element) => element && !element.hidden);

    sequence.forEach((element) => {
      element.classList.remove('is-visible');
      element.classList.add('is-staged');
    });

    if (prefersReducedMotion) {
      sequence.forEach((element) => {
        element.classList.remove('is-staged');
        element.classList.add('is-visible');
      });
      return;
    }

    sequence.forEach((element, index) => {
      window.setTimeout(() => {
        element.classList.remove('is-staged');
        element.classList.add('is-visible');
      }, 170 * index);
    });
  };

  const loadWineCatalog = async () => {
    const response = await fetch(WINE_CATALOG_ENDPOINT);

    if (!response.ok) {
      throw new Error('No se pudo cargar la base de vinos.');
    }

    const data = await response.json();
    winesCatalog = Array.isArray(data) ? data : [];
  };

  if (freeTextInput) {
    freeTextInput.addEventListener('input', (event) => {
      responses.texto_libre = event.target.value;
    });
  }

  nextBtn.addEventListener('click', () => {
    if (currentStep < questions.length - 1) {
      currentStep += 1;
      setPanelTransition(quizPanel);
      renderQuestion();
    }
  });

  prevBtn.addEventListener('click', () => {
    if (currentStep > 0) {
      currentStep -= 1;
      setPanelTransition(quizPanel);
      renderQuestion();
    }
  });

  submitBtn.addEventListener('click', async () => {
    if (!isComplete()) return;

    hideLocalContext();
    submitBtn.disabled = true;
    submitBtn.textContent = 'Buscando vinos...';

    setPanelTransition(quizPanel);
    quizPanel.hidden = true;
    resultPanel.hidden = true;
    if (loadingPanel) {
      loadingPanel.hidden = false;
      setPanelTransition(loadingPanel);
    }

    try {
      if (!winesCatalog.length) {
        await loadWineCatalog();
      }

      void persistSommelierResponse();

      try {
        const freeTextSignals = await getFreeTextSignals(responses.texto_libre);
        inferredSignals = freeTextSignals;
        applyFreeTextSignals(freeTextSignals);
      } catch (error) {
        inferredSignals = null;
        // eslint-disable-next-line no-console
        console.error(error);
      }

      renderResults();
      if (!prefersReducedMotion) {
        await new Promise((resolve) => window.setTimeout(resolve, 620));
      }

      if (loadingPanel) loadingPanel.hidden = true;
      resultPanel.hidden = false;
      setPanelTransition(resultPanel);
      animateResultSequence();
      sommelierApp.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      if (loadingPanel) loadingPanel.hidden = true;
      quizPanel.hidden = false;
      setPanelTransition(quizPanel);
      alert('No pudimos cargar las recomendaciones en este momento. Intentá nuevamente.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Recibir recomendación';
    }
  });

  restartBtn.addEventListener('click', () => {
    Object.keys(responses).forEach((key) => {
      responses[key] = '';
    });
    inferredSignals = null;
    currentStep = 0;
    resultPanel.hidden = true;
    if (loadingPanel) loadingPanel.hidden = true;
    if (profileBlock) profileBlock.hidden = true;
    if (boxBlock) boxBlock.hidden = true;
    if (membershipBlock) membershipBlock.hidden = true;
    quizPanel.hidden = false;
    setPanelTransition(quizPanel);
    renderQuestion();
    sommelierApp.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
  });


  const initWineTinder = () => {
    const tinderRoot = document.querySelector('[data-wine-tinder]');
    if (!tinderRoot) return;

    const startPanel = tinderRoot.querySelector('[data-tinder-start]');
    const swipePanel = tinderRoot.querySelector('[data-tinder-swipe]');
    const resultPanelTinder = tinderRoot.querySelector('[data-tinder-result]');
    const startBtn = tinderRoot.querySelector('[data-tinder-start-btn]');
    const likeBtn = tinderRoot.querySelector('[data-tinder-like]');
    const dislikeBtn = tinderRoot.querySelector('[data-tinder-dislike]');
    const card = tinderRoot.querySelector('[data-tinder-card]');
    const stampNope = tinderRoot.querySelector('[data-tinder-stamp-nope]');
    const stampLike = tinderRoot.querySelector('[data-tinder-stamp-like]');
    const cardImage = tinderRoot.querySelector('[data-tinder-image]');
    const cardName = tinderRoot.querySelector('[data-tinder-name]');
    const cardVarietal = tinderRoot.querySelector('[data-tinder-varietal]');
    const cardDescription = tinderRoot.querySelector('[data-tinder-description]');
    const chipsNode = tinderRoot.querySelector('[data-tinder-chips]');
    const stepCurrentNode = tinderRoot.querySelector('[data-tinder-step-current]');
    const stepTotalNode = tinderRoot.querySelector('[data-tinder-step-total]');
    const progressFillNode = tinderRoot.querySelector('[data-tinder-progress-fill]');
    const profileNameNode = tinderRoot.querySelector('[data-tinder-profile-name]');
    const profileDescriptionNode = tinderRoot.querySelector('[data-tinder-profile-description]');
    const recommendationsNode = tinderRoot.querySelector('[data-tinder-recommendations]');
    const boxNode = tinderRoot.querySelector('[data-tinder-box]');
    const waNode = tinderRoot.querySelector('[data-tinder-wa]');
    const matchNode = tinderRoot.querySelector('[data-tinder-match]');
    const shareRoot = tinderRoot.querySelector('[data-tinder-share]');
    const shareWhatsAppNode = tinderRoot.querySelector('[data-tinder-share-whatsapp]');
    const shareXNode = tinderRoot.querySelector('[data-tinder-share-x]');
    const shareFacebookNode = tinderRoot.querySelector('[data-tinder-share-facebook]');
    const copyNode = tinderRoot.querySelector('[data-tinder-copy]');
    const copyFeedbackNode = tinderRoot.querySelector('[data-tinder-copy-feedback]');
    const progressBar = tinderRoot.querySelector('.wine-tinder-progress');

    const getTinderDescription = (wine) => {
      const parts = [];
      if (wine?.tipo_vino) parts.push(`Vino ${wine.tipo_vino}`);
      if (wine?.maridaje_principal) parts.push(`ideal para ${wine.maridaje_principal.replace('_', ' ')}`);
      if (wine?.ocasion) parts.push(`pensado para ${wine.ocasion.replace('_', ' ')}`);
      return `${parts.join(', ')}.`;
    };


    const getTinderChips = (wine) => {
      const chips = [];
      if (wine?.tipo_vino) chips.push(wine.tipo_vino);
      if (wine?.varietal) chips.push(wine.varietal);
      if (wine?.maridaje_principal) chips.push(wine.maridaje_principal.replace('_', ' '));
      return chips.slice(0, 3);
    };

    const estimateMatchPercent = () => {
      const total = tinderState.pool.length || 1;
      const likes = tinderState.likes.length;
      const base = 72 + Math.round((likes / total) * 24);
      return Math.max(73, Math.min(98, base));
    };

    const getShareMessage = (profile, recommendations) => {
      const topNames = recommendations.slice(0, 2).map((wine) => wine.nombre).join(' + ');
      return `Hice match con el vino en Wine Tinder de Lombardo: ${profile.name} (${estimateMatchPercent()}% match). Mis elegidos: ${topNames}. ¿Cuál te salió a vos? 🍷 #WineTinderLombardo`;
    };

    const updateShareActions = (profile, recommendations) => {
      if (!shareRoot) return;
      shareRoot.hidden = false;
      const text = getShareMessage(profile, recommendations);
      const encodedText = encodeURIComponent(text);
      const siteUrl = encodeURIComponent('https://lombardo.com.ar/sommelier');

      if (shareWhatsAppNode) shareWhatsAppNode.href = `https://wa.me/?text=${encodedText}`;
      if (shareXNode) shareXNode.href = `https://twitter.com/intent/tweet?text=${encodedText}&url=${siteUrl}`;
      if (shareFacebookNode) shareFacebookNode.href = `https://www.facebook.com/sharer/sharer.php?u=${siteUrl}&quote=${encodedText}`;

      if (copyNode) {
        copyNode.onclick = async () => {
          try {
            await navigator.clipboard.writeText(text);
            if (copyFeedbackNode) copyFeedbackNode.textContent = 'Texto copiado. ¡Ahora compartilo en tus redes!';
          } catch (_error) {
            if (copyFeedbackNode) copyFeedbackNode.textContent = 'No pudimos copiar automáticamente. Copialo manualmente desde WhatsApp/X.';
          }
        };
      }
    };

    const tinderState = {
      pool: [],
      index: 0,
      likes: [],
      dislikes: [],
      threshold: 92,
    };

    if (stepTotalNode) stepTotalNode.textContent = '6';

    const buildPool = () => {
      const catalog = (winesCatalog || []).filter((wine) => wine?.activo === true);
      const sorted = [...catalog].sort(sortByPriorityAndPrice);
      tinderState.pool = sorted.slice(0, 6);
    };

    const updateProgress = () => {
      const total = tinderState.pool.length || 1;
      const current = Math.min(tinderState.index + 1, total);
      const pct = Math.min(100, (tinderState.index / total) * 100);
      if (stepCurrentNode) stepCurrentNode.textContent = String(current);
      if (progressFillNode) progressFillNode.style.width = `${pct}%`;
      if (progressBar) progressBar.setAttribute('aria-valuenow', String(current));
      if (progressBar) progressBar.setAttribute('aria-valuemax', String(total));
    };

    const updateStampState = (delta = 0) => {
      if (stampLike) stampLike.style.opacity = delta > 16 ? String(Math.min(1, Math.abs(delta) / tinderState.threshold)) : '0';
      if (stampNope) stampNope.style.opacity = delta < -16 ? String(Math.min(1, Math.abs(delta) / tinderState.threshold)) : '0';
    };

    const resetStampState = () => updateStampState(0);

    const renderCard = () => {
      const wine = tinderState.pool[tinderState.index];
      if (!wine) {
        finishTinder();
        return;
      }

      updateProgress();
      if (cardName) cardName.textContent = wine.nombre || 'Etiqueta Lombardo';
      if (cardVarietal) cardVarietal.textContent = wine.varietal || 'Selección especial';
      if (cardDescription) cardDescription.textContent = getTinderDescription(wine);
      if (chipsNode) {
        chipsNode.innerHTML = '';
        getTinderChips(wine).forEach((chip) => {
          const span = document.createElement('span');
          span.className = 'wine-tinder-chip';
          span.textContent = chip;
          chipsNode.appendChild(span);
        });
      }
      if (cardImage) cardImage.src = 'assets/fotos/vino.jpg';
      card.style.transform = 'translateX(0) rotate(0deg)';
      card.style.opacity = '1';
      card.dataset.dragging = 'false';
      resetStampState();
    };

    const scoreByLikes = (wine) => {
      let score = 0;
      tinderState.likes.forEach((liked) => {
        if (wine.tipo_vino && wine.tipo_vino === liked.tipo_vino) score += 7;
        if (wine.varietal && wine.varietal === liked.varietal) score += 6;
        if (wine.maridaje_principal && wine.maridaje_principal === liked.maridaje_principal) score += 5;
        if (wine.ocasion && wine.ocasion === liked.ocasion) score += 4;
      });
      tinderState.dislikes.forEach((disliked) => {
        if (wine.tipo_vino && wine.tipo_vino === disliked.tipo_vino) score -= 5;
        if (wine.varietal && wine.varietal === disliked.varietal) score -= 3;
      });
      if ((wine.prioridad_venta || '').toLowerCase() === 'alta') score += 1;
      return score;
    };

    const detectSwipeProfile = () => {
      const likes = tinderState.likes;
      const typeCount = likes.reduce((acc, wine) => {
        const key = (wine.tipo_vino || 'otro').toLowerCase();
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
      const varietalCount = likes.reduce((acc, wine) => {
        const key = (wine.varietal || 'otro').toLowerCase();
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});

      const topType = Object.entries(typeCount).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
      const topVarietal = Object.entries(varietalCount).sort((a, b) => b[1] - a[1])[0]?.[0] || '';

      if (topType === 'tinto' && /malbec|blend|cabernet/.test(topVarietal)) {
        return {
          name: 'Clásico Malbec',
          description: 'Te gustan vinos con cuerpo, gastronómicos y fáciles de compartir.',
        };
      }

      if (topType === 'blanco' || topType === 'rosado' || topType === 'espumoso') {
        return {
          name: 'Fresco Social',
          description: 'Preferís vinos livianos, vibrantes y perfectos para encuentros relajados.',
        };
      }

      return {
        name: 'Explorador Lombardo',
        description: 'Te gusta descubrir etiquetas distintas, equilibrando seguridad con novedad.',
      };
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

    const finishTinder = () => {
      const profile = detectSwipeProfile();
      const catalog = (winesCatalog || []).filter((wine) => wine?.activo === true);
      const ranked = [...catalog]
        .map((wine) => ({ ...wine, tinderScore: scoreByLikes(wine) }))
        .sort((a, b) => b.tinderScore - a.tinderScore || sortByPriorityAndPrice(a, b));

      const recommendations = ranked.slice(0, 3);
      const box = ranked.slice(1, 4).length ? ranked.slice(1, 4) : ranked.slice(0, 3);

      if (profileNameNode) profileNameNode.textContent = `Perfil: ${profile.name}`;
      if (profileDescriptionNode) profileDescriptionNode.textContent = profile.description;
      if (matchNode) matchNode.textContent = `Compatibilidad con tu estilo: ${estimateMatchPercent()}%`;
      renderList(recommendationsNode, recommendations);
      renderList(boxNode, box);

      if (waNode) {
        const text = [
          'Hola, usé Wine Tinder en Lombardo y quiero armar mi selección.',
          `Perfil detectado: ${profile.name}`,
          ...recommendations.map((wine) => `- ${wine.nombre}`),
        ].join('\n');
        waNode.href = `https://wa.me/543412762319?text=${encodeURIComponent(text)}`;
      }

      updateShareActions(profile, recommendations);

      persistWineProfile({
        perfil: profile.name,
        descripcion: profile.description,
        origen: 'wine_tinder',
      });

      swipePanel.hidden = true;
      resultPanelTinder.hidden = false;
    };

    const commitSwipe = (liked) => {
      const wine = tinderState.pool[tinderState.index];
      if (!wine) return;

      if (liked) tinderState.likes.push(wine);
      else tinderState.dislikes.push(wine);

      tinderState.index += 1;
      renderCard();
    };

    const animateAndCommit = (liked) => {
      updateStampState(liked ? tinderState.threshold : -tinderState.threshold);
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

    card.addEventListener('pointerdown', (event) => {
      dragging = true;
      dragStartX = event.clientX;
      dragCurrentX = event.clientX;
      card.setPointerCapture(event.pointerId);
      card.style.transition = 'none';
    });

    card.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      dragCurrentX = event.clientX;
      const delta = dragCurrentX - dragStartX;
      const tilt = Math.max(-12, Math.min(12, delta / 18));
      card.style.transform = `translateX(${delta}px) rotate(${tilt}deg)`;
      updateStampState(delta);
    });

    card.addEventListener('pointerup', () => {
      if (!dragging) return;
      dragging = false;
      const delta = dragCurrentX - dragStartX;
      if (Math.abs(delta) >= tinderState.threshold) {
        animateAndCommit(delta > 0);
      } else {
        card.style.transition = 'transform 200ms ease';
        card.style.transform = 'translateX(0) rotate(0deg)';
        resetStampState();
      }
    });

    likeBtn?.addEventListener('click', () => animateAndCommit(true));
    dislikeBtn?.addEventListener('click', () => animateAndCommit(false));

    startBtn?.addEventListener('click', async () => {
      if (!winesCatalog.length) {
        try {
          await loadWineCatalog();
        } catch (_error) {
          return;
        }
      }

      buildPool();
      tinderState.index = 0;
      tinderState.likes = [];
      tinderState.dislikes = [];
      startPanel.hidden = true;
      resultPanelTinder.hidden = true;
      swipePanel.hidden = false;
      if (shareRoot) shareRoot.hidden = true;
      if (copyFeedbackNode) copyFeedbackNode.textContent = '';
      renderCard();
    });
  };

  showLocalContextIfNeeded();
  renderQuestion();
  initSommelierChat();
  initWineTinder();
}

const ASSISTANT_STORAGE_KEY = 'lombardo_assistant_history';

const ARS_CHAT_CURRENCY_FORMATTER = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
});

const formatAssistantCurrencyDisplay = (content) => {
  if (typeof content !== 'string' || !content.includes('$')) return content;

  return content.replace(/\$\s*(\d{1,3}(?:[.\s]\d{3})+|\d+)/g, (_match, rawAmount) => {
    const normalized = rawAmount.replace(/[.\s]/g, '');
    const amount = Number(normalized);

    if (!Number.isFinite(amount)) return _match;

    return ARS_CHAT_CURRENCY_FORMATTER
      .format(amount)
      .replace(/\u00A0/g, '')
      .replace(/\s+/g, '');
  });
};

const getPageContext = () => {
  const customContext = document.body?.dataset?.pageContext;
  const contextAliases = {
    'wine-tinder': 'wine-tinder',
    wine_tinder: 'wine-tinder',
    vinos: 'experiencias',
    vino: 'experiencias',
    cafe: 'experiencias',
    eventos: 'experiencias',
    catas: 'experiencias',
    galeria: 'experiencias',
    tienda: 'club',
    membresia: 'club',
    cajas: 'club',
    seleccion_mensual: 'club',
  };

  if (customContext) return contextAliases[customContext] || customContext;

  return resolvePageContextFromPath(window.location.pathname);
};

const initGlobalLombardoAssistant = () => {
  const pageContext = getPageContext();
  const hasEmbeddedSommelierChat = Boolean(document.querySelector('[data-ai-chat]'));

  if (pageContext === 'sommelier' || hasEmbeddedSommelierChat) return;

  const container = document.createElement('section');
  container.className = 'assistant-widget';
  container.setAttribute('data-assistant-widget', '');

  container.innerHTML = `
    <button class="assistant-trigger" type="button" aria-expanded="false" aria-controls="assistant-panel">
      <span class="assistant-trigger-dot" aria-hidden="true"></span>
      Asistente IA Lombardo
    </button>
    <div id="assistant-panel" class="assistant-panel" hidden>
      <div class="assistant-head">
        <div>
          <p class="eyebrow">Asistente IA Lombardo</p>
          <h3>Puedo ayudarte con vinos, regalos, cajas, club, café y experiencias.</h3>
        </div>
        <button
          class="assistant-close"
          type="button"
          aria-label="Minimizar chat"
          data-assistant-close
        >
          −
        </button>
      </div>
      <div class="assistant-prompts" data-assistant-prompts>
        <button type="button">Quiero un vino para regalar</button>
        <button type="button">¿Qué incluye el club?</button>
        <button type="button">Busco algo para una picada</button>
        <button type="button">¿Puedo armar una caja?</button>
        <button type="button">¿Qué experiencias tienen?</button>
      </div>
      <div class="assistant-messages" data-assistant-messages aria-live="polite"></div>
      <form class="assistant-form" data-assistant-form>
        <label class="sr-only" for="assistant-input">Escribí tu consulta</label>
        <input id="assistant-input" type="text" placeholder="Ej: Quiero algo para regalar este fin de semana" required />
        <button class="btn btn-primary" type="submit">Enviar</button>
      </form>
    </div>
  `;

  document.body.appendChild(container);

  const trigger = container.querySelector('.assistant-trigger');
  const panel = container.querySelector('.assistant-panel');
  const messages = container.querySelector('[data-assistant-messages]');
  const form = container.querySelector('[data-assistant-form]');
  const input = container.querySelector('#assistant-input');
  const submitBtn = form?.querySelector('button[type="submit"]');
  const promptButtons = container.querySelectorAll('[data-assistant-prompts] button');
  const closeBtn = container.querySelector('[data-assistant-close]');
  const widgetState = {
    isOpen: false,
    isMinimized: true,
    isClosed: true,
  };

  const readHistory = () => {
    try {
      const raw = sessionStorage.getItem(ASSISTANT_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((item) => item && (item.role === 'user' || item.role === 'assistant'))
        .map((item) => ({
          role: item.role,
          content: typeof item.content === 'string' ? item.content.trim().slice(0, 500) : '',
        }))
        .filter((item) => item.content)
        .slice(-14);
    } catch (error) {
      return [];
    }
  };

  const writeHistory = (history) => {
    try {
      sessionStorage.setItem(ASSISTANT_STORAGE_KEY, JSON.stringify(history.slice(-14)));
    } catch (error) {
      // ignore
    }
  };

  let history = readHistory();

  const appendMessage = (role, content, options = {}) => {
    if (!messages || !content) return;
    const item = document.createElement('article');
    item.className = `assistant-message is-${role}`;

    const roleLabel = document.createElement('p');
    roleLabel.className = 'assistant-role';
    roleLabel.textContent = role === 'assistant' ? 'Asistente' : 'Vos';

    const body = document.createElement('p');
    body.textContent = role === 'assistant' ? formatAssistantCurrencyDisplay(content) : content;

    item.appendChild(roleLabel);
    item.appendChild(body);

    if (role === 'assistant' && options.whatsappUrl) {
      const waLink = document.createElement('a');
      waLink.className = 'assistant-whatsapp-link';
      waLink.href = options.whatsappUrl;
      waLink.target = '_blank';
      waLink.rel = 'noopener';
      waLink.textContent = options.whatsappLabel || 'Seguir por WhatsApp';
      item.appendChild(waLink);
    }

    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
  };

  const setLoading = (loading) => {
    if (!input || !submitBtn) return;
    input.disabled = loading;
    submitBtn.disabled = loading;
    submitBtn.textContent = loading ? 'Enviando...' : 'Enviar';
  };

  const setOpenState = (open) => {
    const animationDelay = prefersReducedMotion ? 0 : 180;

    if (open) {
      widgetState.isOpen = true;
      widgetState.isMinimized = false;
      widgetState.isClosed = false;
      panel.hidden = false;
      panel.classList.remove('is-closing');
      trigger.setAttribute('aria-expanded', 'true');
      trigger.setAttribute('aria-label', 'Minimizar chat');
      container.classList.add('is-open');
      window.setTimeout(() => {
        input?.focus();
      }, prefersReducedMotion ? 0 : 160);
      return;
    }

    widgetState.isOpen = false;
    widgetState.isMinimized = true;
    widgetState.isClosed = false;
    panel.classList.add('is-closing');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-label', 'Abrir chat');
    container.classList.remove('is-open');
    window.setTimeout(() => {
      panel.hidden = true;
      panel.classList.remove('is-closing');
    }, animationDelay);
  };

  const getFriendlyClientError = () => 'Hoy estoy con mucha demanda y no pude responder como quería. Si querés, probá de nuevo en un rato o seguimos por WhatsApp.';


  let localCatalogCache = null;

  const normalizeText = (value) =>
    String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '');

  const chooseVariant = (message, variants) => {
    if (!variants.length) return '';
    const source = normalizeText(message);
    const seed = [...source].reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return variants[seed % variants.length];
  };

  const formatWineLine = (wine) => {
    const price = Number(wine.precio);
    const formattedPrice = Number.isFinite(price) ? `$${price.toLocaleString('es-AR')}` : null;
    return [wine.nombre, wine.varietal, wine.tipo_vino, formattedPrice].filter(Boolean).join(' · ');
  };

  const readLocalCatalog = async () => {
    if (Array.isArray(localCatalogCache)) return localCatalogCache;
    const response = await fetch(WINE_CATALOG_ENDPOINT, { cache: 'no-store' });
    const data = await response.json().catch(() => []);
    localCatalogCache = Array.isArray(data) ? data.filter((wine) => wine?.activo !== false) : [];
    return localCatalogCache;
  };

  const detectLocalIntent = (message) => {
    const text = normalizeText(message);
    const checks = {
      educational: /(maridar|maridaje|temperatura|decantar|acidez|taninos|varietal|diferencia entre|como servir)/,
      contact: /(whatsapp|asesor|humano|persona|vendedor|contacto|hablar con)/,
      gift: /(regalo|regalar|obsequio)/,
      picada: /(picada|queso|fiambre|tapeo)/,
      meat: /(carne|asado|parrilla|vac(o|a)|bife)/,
      soft: /(suave|liviano|ligero|facil de tomar|amable)/,
      intense: /(intenso|potente|con cuerpo|robusto|estructurado)/,
      discover: /(distinto|descubrir|nuevo|sorprender|fuera de lo comun|explorar)/,
      box: /(armame una caja|arma(me)? una caja|caja de vinos|seleccion para llevar)/,
      membership: /(mensualidad|membresia|suscripcion|club mensual|todos los meses)/,
      clubInfo: /(que incluye el club|beneficios del club|como funciona el club|club lombardo|membresia|membresía|tienda)/,
      experiences: /(que experiencias|experiencias tienen|catas|after office|balcon|balc[oó]n|eventos|cafe|caf[eé]|galeria|galer[ií]a)/,
    };

    if (checks.contact.test(text)) return 'contact';
    if (checks.membership.test(text)) return 'membership';
    if (checks.box.test(text)) return 'box';
    if (checks.clubInfo.test(text)) return 'club';
    if (checks.experiences.test(text)) return 'experiences';
    if (checks.educational.test(text)) return 'educational';
    if (checks.gift.test(text)) return 'wine_gift';
    if (checks.picada.test(text)) return 'wine_picada';
    if (checks.meat.test(text)) return 'wine_meat';
    if (checks.soft.test(text)) return 'wine_soft';
    if (checks.intense.test(text)) return 'wine_intense';
    if (checks.discover.test(text)) return 'wine_discover';
    if (/(vino|malbec|cabernet|blend|blanco|rosado|espumoso|recomenda|recomendame)/.test(text)) return 'wine_generic';
    return 'general';
  };

  const pickWinesForIntent = (wines, intent) => {
    const scoreWine = (wine) => {
      let score = 0;
      if (wine.prioridad_venta === 'alta') score += 1.5;
      if (wine.nivel_precio === 'medio') score += 0.2;

      switch (intent) {
        case 'wine_gift':
          if (wine.ocasion === 'regalo') score += 4;
          if (wine.nivel_precio === 'alto') score += 1;
          break;
        case 'wine_picada':
          if (wine.maridaje_principal === 'picada') score += 4;
          if (wine.tipo_vino === 'rosado' || wine.tipo_vino === 'blanco') score += 1;
          break;
        case 'wine_meat':
          if (wine.maridaje_principal === 'carne' || wine.ocasion === 'asado') score += 4;
          if (wine.tipo_vino === 'tinto') score += 1;
          break;
        case 'wine_soft':
          if (wine.tipo_vino === 'rosado' || wine.tipo_vino === 'blanco') score += 3;
          if (wine.varietal === 'Pinot Noir') score += 2;
          break;
        case 'wine_intense':
          if (wine.tipo_vino === 'tinto') score += 2;
          if (/cabernet|malbec|blend/i.test(wine.varietal || '')) score += 2;
          if (wine.nivel_precio === 'alto') score += 1;
          break;
        case 'wine_discover':
          if (wine.ocasion === 'descubrir') score += 4;
          if (wine.tipo_vino === 'espumoso' || wine.tipo_vino === 'rosado') score += 1;
          break;
        default:
          if (wine.prioridad_venta === 'alta') score += 1;
      }

      return score;
    };

    return [...wines]
      .sort((a, b) => scoreWine(b) - scoreWine(a))
      .slice(0, 3);
  };

  const buildWineResponse = (message, wines, introKey) => {
    const intro = chooseVariant(message, {
      regalo: [
        '¡Qué lindo plan para regalar! Te dejo tres etiquetas que suelen funcionar muy bien.',
        'Si es para regalar, esta selección queda elegante y con perfiles bien distintos.',
      ],
      picada: [
        'Para una picada, buscaría vinos frescos y gastronómicos como estos:',
        'Con picada van perfecto opciones versátiles y fáciles de compartir. Mirá esta idea:',
      ],
      carne: [
        'Si hay carne o asado de por medio, te recomendaría ir por esta línea:',
        'Para parrilla y cortes con sabor, estas tres etiquetas rinden excelente:',
      ],
      suave: [
        'Si buscás algo más suave y amable al paladar, arrancaría por acá:',
        'Para un estilo liviano y fácil de tomar, estas opciones encajan muy bien:',
      ],
      intenso: [
        'Si preferís vinos intensos y con carácter, probá esta selección:',
        'Para un perfil más potente, te propongo estas etiquetas:',
      ],
      descubrir: [
        '¡Me encanta cuando buscan algo distinto! Te propongo esta mini ruta para descubrir:',
        'Si querés salir de lo de siempre, estas tres opciones te pueden sorprender:',
      ],
      generic: [
        'Vamos directo a una selección Lombardo para tu caso:',
        'Tres opciones equilibradas para arrancar:',
      ],
    }[introKey] || []);

    const bullets = wines.map((wine) => `• ${formatWineLine(wine)}`).join('\n');
    const closing = chooseVariant(message, [
      'Si querés, te la ajusto por presupuesto o por ocasión puntual.',
      'Si me decís presupuesto y ocasión exacta, la afinamos todavía más.',
      'Si querés, en el próximo mensaje la cierro según estilo y rango de precio.',
    ]);

    return [intro, bullets, closing].join('\n\n');
  };

  const buildStructuredSelection = (message, wines, title, labels) => {
    const [safeWine, specialWine, discoverWine] = wines;
    const lines = [title];
    if (safeWine) lines.push(`• ${labels[0]}: ${formatWineLine(safeWine)}`);
    if (specialWine) lines.push(`• ${labels[1]}: ${formatWineLine(specialWine)}`);
    if (discoverWine) lines.push(`• ${labels[2]}: ${formatWineLine(discoverWine)}`);
    lines.push(chooseVariant(message, [
      'Si querés, te dejo esta propuesta lista para reservar por WhatsApp.',
      'Si te gusta, te ayudo a dejarla cerrada para retirar o enviar.',
    ]));
    return lines.join('\n\n');
  };

  const buildLocalAssistantFallback = async (message) => {
    const intent = detectLocalIntent(message);
    const wines = await readLocalCatalog().catch(() => []);

    if (intent === 'contact') {
      return '¡Claro! Si querés te derivo con una persona del equipo por WhatsApp para resolverlo rápido y en detalle.';
    }

    if (intent === 'educational') {
      return 'Te explico rápido y simple: si querés, después lo bajamos a etiquetas concretas de Lombardo.';
    }

    if (intent === 'club') {
      return 'Club Lombardo incluye descuentos especiales en barra y tienda, cupos preferenciales en catas, invitaciones a noches privadas y novedades/preventas por WhatsApp. Si querés, te oriento según si preferís vino, café o ambos mundos.';
    }

    if (intent === 'experiences') {
      return 'En Lombardo tenemos experiencias como catas de vino, after office, encuentros en balcón y momentos compartidos. Si me decís qué plan te interesa (pareja, amigos o regalo), te sugiero la mejor opción para vos.';
    }

    if (!wines.length) {
      return 'Si me decís ocasión, presupuesto y estilo, te propongo opciones concretas en un mensaje.';
    }

    if (intent === 'box') {
      const selected = pickWinesForIntent(wines, 'wine_generic');
      return buildStructuredSelection(
        message,
        selected,
        '¡Vamos con esa caja! Te propongo una combinación equilibrada:',
        ['Opción segura', 'Opción más especial', 'Opción para descubrir']
      );
    }

    if (intent === 'membership') {
      const aligned = pickWinesForIntent(wines, 'wine_generic').slice(0, 2);
      const explore = pickWinesForIntent(wines, 'wine_discover')[0];
      return buildStructuredSelection(
        message,
        [...aligned, explore].filter(Boolean),
        'Para una mensualidad estilo Club, esta combinación funciona muy bien:',
        ['Alineado a tu gusto #1', 'Alineado a tu gusto #2', 'Para explorar este mes']
      );
    }

    const wineIntentMap = {
      wine_gift: { intent: 'wine_gift', intro: 'regalo' },
      wine_picada: { intent: 'wine_picada', intro: 'picada' },
      wine_meat: { intent: 'wine_meat', intro: 'carne' },
      wine_soft: { intent: 'wine_soft', intro: 'suave' },
      wine_intense: { intent: 'wine_intense', intro: 'intenso' },
      wine_discover: { intent: 'wine_discover', intro: 'descubrir' },
      wine_generic: { intent: 'wine_generic', intro: 'generic' },
    };

    if (wineIntentMap[intent]) {
      const selection = pickWinesForIntent(wines, wineIntentMap[intent].intent);
      return buildWineResponse(message, selection, wineIntentMap[intent].intro);
    }

    return chooseVariant(message, [
      'Contame ocasión y presupuesto, y te armo una recomendación concreta de vinos, caja o mensualidad.',
      'Puedo armarte una recomendación de vinos, una caja o una mensualidad según ocasión y presupuesto.',
      'Si querés cerrar compra o reserva, te paso el enlace directo de WhatsApp.',
    ]);
  };

  const sendMessage = async (message) => {
    const payload = {
      message,
      pagina_actual: pageContext,
      history,
      wine_profile: readStoredWineProfile(),
    };
    const endpoints = resolveAssistantApiCandidates();
    console.log('[assistant-widget][debug] payload enviado:', payload);
    console.log('[assistant-widget][debug] endpoints candidatos:', endpoints);

    let response;
    let data = {};
    let rawBody = '';
    let latestError = null;

    for (const endpoint of endpoints) {
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } catch (error) {
        console.error('[assistant-widget][debug] fetch error:', { endpoint, error });
        latestError = error;
        continue;
      }

      rawBody = await response.text().catch(() => '');
      try {
        data = rawBody ? JSON.parse(rawBody) : {};
      } catch (error) {
        console.warn('[assistant-widget][debug] respuesta no JSON:', rawBody.slice(0, 300));
        data = {};
      }

      console.log('[assistant-widget][debug] status HTTP:', { endpoint, status: response.status });
      console.log('[assistant-widget][debug] body recibido:', data);

      if (!response.ok) {
        const endpointUnavailable = [404, 405, 500, 501, 502, 503].includes(response.status);
        const nonJsonReply = !rawBody || rawBody.trim().startsWith('<!DOCTYPE') || rawBody.trim().startsWith('<html');

        if (endpointUnavailable && (nonJsonReply || !data.error_code)) {
          latestError = new Error(`Endpoint no disponible en ${endpoint}`);
          continue;
        }

        const endpointError = new Error(data.error || 'No se pudo obtener respuesta del asistente.');
        endpointError.code = data.error_code || 'ENDPOINT_ERROR';
        endpointError.status = response.status;
        throw endpointError;
      }

      latestError = null;
      break;
    }

    if (!response || latestError) {
      const backendError = new Error('No encontramos un backend disponible para Sommelier IA.');
      backendError.code = 'BACKEND_UNAVAILABLE';
      throw backendError;
    }

    return {
      answer:
        typeof data.reply === 'string'
          ? data.reply.trim()
          : typeof data.answer === 'string'
          ? data.answer.trim()
          : '',
      suggestWhatsApp:
        typeof data.whatsappUrl === 'string' ? Boolean(data.whatsappUrl.trim()) : Boolean(data.suggest_whatsapp),
      whatsappLabel: typeof data.whatsapp_label === 'string' ? data.whatsapp_label.trim() : 'Seguir por WhatsApp',
      whatsappUrl:
        typeof data.whatsappUrl === 'string'
          ? data.whatsappUrl.trim()
          : typeof data.whatsapp_url === 'string'
          ? data.whatsapp_url.trim()
          : '',
      suggestions: Array.isArray(data.suggestions) ? data.suggestions : [],
      fallbackUsed: Boolean(data?.fallback?.used),
    };
  };

  const handleSubmit = async (message) => {
    const trimmed = message.trim();
    if (!trimmed) return;

    appendMessage('user', trimmed);
    history.push({ role: 'user', content: trimmed });
    writeHistory(history);

    setLoading(true);
    try {
      const result = await sendMessage(trimmed);
      const safeAnswer = result.answer || 'Gracias por tu consulta. Contame un poco más y te ayudo a avanzar.';
      appendMessage('assistant', safeAnswer, {
        whatsappUrl: result.suggestWhatsApp ? result.whatsappUrl : '',
        whatsappLabel: result.whatsappLabel,
      });
      history.push({ role: 'assistant', content: safeAnswer });
      writeHistory(history);
    } catch (error) {
      console.error('[assistant-widget] Error al responder chat:', error);

      if (['BACKEND_UNAVAILABLE', 'NETWORK_ERROR', 'ENDPOINT_ERROR'].includes(error?.code)) {
        const localAnswer = await buildLocalAssistantFallback(trimmed).catch(() => '');
        if (localAnswer) {
          appendMessage('assistant', localAnswer);
          history.push({ role: 'assistant', content: localAnswer });
          writeHistory(history);
        } else {
          appendMessage('assistant', getFriendlyClientError(error));
        }
      } else {
        appendMessage('assistant', getFriendlyClientError(error));
      }
    } finally {
      setLoading(false);
      input.value = '';
      input.focus();
    }
  };

  if (history.length) {
    history.forEach((item) => appendMessage(item.role, item.content));
  } else {
    const welcome = '¡Hola! Soy el Asistente IA Lombardo. Decime qué estás buscando y te recomiendo algo concreto.';
    appendMessage('assistant', welcome);
    history.push({ role: 'assistant', content: welcome });
    writeHistory(history);
  }

  trigger?.addEventListener('click', () => {
    setOpenState(panel.hidden);
  });

  closeBtn?.addEventListener('click', () => {
    setOpenState(false);
  });

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    void handleSubmit(input.value);
  });

  promptButtons.forEach((button) => {
    button.addEventListener('click', () => {
      input.value = button.textContent || '';
      void handleSubmit(input.value);
    });
  });
};

initGlobalLombardoAssistant();

const wineShopApp = document.querySelector('#wine-shop-app');

if (wineShopApp) {
  const searchInput = wineShopApp.querySelector('#wine-search');
  const recommendedGrid = wineShopApp.querySelector('[data-recommended-grid]');
  const catalogGrid = wineShopApp.querySelector('[data-catalog-grid]');
  const filterSelects = wineShopApp.querySelectorAll('[data-filter]');
  const boxCount = wineShopApp.querySelector('[data-box-count]');
  const boxTotal = wineShopApp.querySelector('[data-box-total]');
  const boxWa = wineShopApp.querySelector('[data-box-wa]');

  const bodegaByWine = {
    Trumpeter: 'Rutini Wines',
    Saint: 'Catena Zapata',
    Rutini: 'Rutini Wines',
    Luigi: 'Luigi Bosca',
    Salentein: 'Bodegas Salentein',
    Chandon: 'Chandon Argentina',
    Portillo: 'Salentein',
    Zuccardi: 'Familia Zuccardi',
    Catena: 'Catena Zapata',
    Norton: 'Bodega Norton',
  };

  const profileLabels = {
    carne: 'Intenso',
    pasta: 'Elegante',
    picada: 'Frutado',
    pescado_sushi: 'Fresco',
    sin_comida: 'Celebración',
  };

  const occasionLabels = {
    asado: 'Asado',
    cena_amigos: 'Cena con amigos',
    regalo: 'Regalo',
    diario: 'Todos los días',
    descubrir: 'Descubrir',
  };

  const selectedWines = new Map();
  const activeFilters = { tipo_vino: '', varietal: '', perfil: '', ocasion: '' };
  let wines = [];

  const formatPrice = (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value);

  const describeWine = (wine) => {
    const occasion = occasionLabels[wine.ocasion] || 'ocasión especial';
    return `${wine.tipo_vino} ${wine.varietal.toLowerCase()} ideal para ${occasion.toLowerCase()}.`;
  };

  const normalize = (text) => String(text || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

  const scoreWine = (wine, query, profile) => {
    let score = 0;
    if (query) {
      const target = normalize(`${wine.nombre} ${wine.varietal} ${wine.ocasion} ${wine.perfil} ${describeWine(wine)}`);
      if (target.includes(query)) score += 4;
    }
    if (profile?.answers?.tipo_vino && profile.answers.tipo_vino === wine.tipo_vino) score += 3;
    if (profile?.answers?.ocasion && profile.answers.ocasion === wine.ocasion) score += 2;
    if (wine.prioridad_venta === 'alta') score += 1;
    return score;
  };

  const createWineCard = (wine) => {
    const card = document.createElement('article');
    card.className = 'wine-card reveal is-visible';
    card.innerHTML = `
      <h3>${wine.nombre}</h3>
      <p class="wine-bodega">${wine.bodega}</p>
      <p class="wine-price">${formatPrice(wine.precio)}</p>
      <p>${wine.descripcion}</p>
      <div class="actions">
        <a class="btn btn-secondary" href="vinos.html">Ver vino</a>
        <button class="btn btn-primary" type="button" data-add-box="${wine.nombre}">Agregar a caja</button>
      </div>
    `;
    return card;
  };

  const updateBoxSummary = () => {
    const items = [...selectedWines.values()];
    const total = items.reduce((acc, wine) => acc + wine.precio, 0);
    boxCount.textContent = String(items.length);
    boxTotal.textContent = formatPrice(total);
  };

  const renderCatalog = () => {
    const query = normalize(searchInput.value.trim());
    const filtered = wines.filter((wine) => {
      const passFilters = (!activeFilters.tipo_vino || wine.tipo_vino === activeFilters.tipo_vino)
        && (!activeFilters.varietal || wine.varietal === activeFilters.varietal)
        && (!activeFilters.perfil || wine.perfil === activeFilters.perfil)
        && (!activeFilters.ocasion || wine.ocasion === activeFilters.ocasion);
      if (!passFilters) return false;
      if (!query) return true;
      return normalize(`${wine.nombre} ${wine.varietal} ${wine.ocasion} ${wine.perfil} ${wine.descripcion}`).includes(query);
    });

    catalogGrid.innerHTML = '';
    filtered.forEach((wine) => catalogGrid.append(createWineCard(wine)));
  };

  const renderRecommended = () => {
    const query = normalize(searchInput.value.trim());
    const profile = readStoredWineProfile();
    const recommended = [...wines]
      .sort((a, b) => scoreWine(b, query, profile) - scoreWine(a, query, profile))
      .slice(0, 3);

    recommendedGrid.innerHTML = '';
    recommended.forEach((wine) => recommendedGrid.append(createWineCard(wine)));
  };

  const hydrateFilters = () => {
    const unique = (key) => [...new Set(wines.map((wine) => wine[key]))].sort((a, b) => a.localeCompare(b));

    filterSelects.forEach((select) => {
      const key = select.getAttribute('data-filter');
      unique(key).forEach((item) => {
        const option = document.createElement('option');
        option.value = item;
        option.textContent = key === 'ocasion' ? (occasionLabels[item] || item) : item;
        select.append(option);
      });
    });
  };

  const bindEvents = () => {
    filterSelects.forEach((select) => {
      select.addEventListener('change', () => {
        activeFilters[select.getAttribute('data-filter')] = select.value;
        renderCatalog();
      });
    });

    searchInput.addEventListener('input', () => {
      renderCatalog();
      renderRecommended();
    });

    wineShopApp.addEventListener('click', (event) => {
      const addBtn = event.target.closest('[data-add-box]');
      if (!addBtn) return;
      const wineName = addBtn.getAttribute('data-add-box');
      const wine = wines.find((item) => item.nombre === wineName);
      if (!wine) return;
      selectedWines.set(wineName, wine);
      updateBoxSummary();
      addBtn.textContent = 'Agregado';
    });

    boxWa.addEventListener('click', () => {
      const selected = [...selectedWines.values()];
      const list = selected.length
        ? selected.map((wine) => `${wine.nombre} (${formatPrice(wine.precio)})`).join(', ')
        : 'Necesito ayuda para armar una caja personalizada';
      const msg = encodeURIComponent(`Hola Lombardo, quiero cerrar mi caja con estos vinos: ${list}.`);
      window.open(`https://wa.me/543412762319?text=${msg}`, '_blank', 'noopener');
    });
  };

  fetch(WINE_CATALOG_ENDPOINT)
    .then((response) => response.json())
    .then((items) => {
      wines = items
        .filter((wine) => wine.activo)
        .map((wine) => ({
          ...wine,
          bodega: bodegaByWine[wine.nombre.split(' ')[0]] || 'Selección Lombardo',
          perfil: profileLabels[wine.maridaje_principal] || 'Versátil',
          descripcion: describeWine(wine),
        }));

      hydrateFilters();
      renderRecommended();
      renderCatalog();
      bindEvents();
      updateBoxSummary();
    })
    .catch(() => {
      recommendedGrid.innerHTML = '<p>No pudimos cargar recomendaciones en este momento.</p>';
      catalogGrid.innerHTML = '<p>No pudimos cargar el catálogo en este momento.</p>';
    });
}
