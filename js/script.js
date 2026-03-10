const navToggle = document.querySelector('.nav-toggle');
const mainNav = document.querySelector('.main-nav');

if (navToggle && mainNav) {
  const navWrap = navToggle.closest('.nav-wrap');
  const navBackdrop = document.createElement('div');
  navBackdrop.className = 'nav-backdrop';
  document.body.appendChild(navBackdrop);

  const syncMenuState = (open) => {
    const isMobile = window.matchMedia('(max-width: 1024px)').matches;
    const shouldOpen = open && isMobile;

    mainNav.classList.toggle('open', shouldOpen);
    navToggle.classList.toggle('is-active', shouldOpen);
    navToggle.setAttribute('aria-expanded', String(shouldOpen));
    navToggle.setAttribute('aria-label', shouldOpen ? 'Cerrar menú' : 'Abrir menú');
    document.body.classList.toggle('nav-open', shouldOpen);
    navBackdrop.classList.toggle('is-visible', shouldOpen);
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

  document.addEventListener('click', (event) => {
    if (!mainNav.classList.contains('open')) return;
    if (navWrap && event.target.closest('.nav-wrap')) return;
    closeMenu();
  });

  navBackdrop.addEventListener('click', closeMenu);

  window.addEventListener('resize', () => {
    if (!window.matchMedia('(max-width: 1024px)').matches) closeMenu();
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

  const requestSommelierChat = async (message) => {
    const response = await fetch('/api/sommelier-chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || 'No se pudo obtener una respuesta del Sommelier IA.');
    }

    return typeof data.answer === 'string' ? data.answer.trim() : '';
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
        appendChatMessage('assistant', 'Ahora mismo no pude responder. Probá de nuevo en unos segundos.');
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
    const normalizedResponses = getNormalizedAnswers();

    if (
      normalizedResponses.tipo_vino === 'tinto'
      && normalizedResponses.comida === 'carne'
      && normalizedResponses.estilo === 'intenso'
    ) {
      return {
        name: 'Clásico Malbec',
        description: 'Te gustan vinos intensos y gastronómicos, ideales para carnes y comidas importantes.',
      };
    }

    if (normalizedResponses.ocasion === 'descubrir') {
      return {
        name: 'Explorador de Vinos',
        description: 'Te gusta probar cosas nuevas y salir de lo tradicional.',
      };
    }

    if (normalizedResponses.estilo === 'suave') {
      return {
        name: 'Amante de Vinos Suaves',
        description: 'Preferís vinos más ligeros, fáciles de tomar y elegantes.',
      };
    }

    if (normalizedResponses.ocasion === 'cena_amigos') {
      return {
        name: 'Wine Lover Social',
        description: 'Disfrutás el vino como parte del encuentro y de compartir.',
      };
    }

    if (normalizedResponses.presupuesto === 'premium') {
      return {
        name: 'Buscador de Joyitas',
        description: 'Te gusta subir un poco el nivel y descubrir vinos especiales.',
      };
    }

    return {
      name: 'Paladar Lombardo',
      description: 'Tenés un perfil versátil y abierto para disfrutar distintas etiquetas según el momento.',
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

    if (normalizedOccasion === 'regalo') {
      return 'Armamos esta caja para que tengas una opción segura, una botella con un poco más de nivel y otra para descubrir algo distinto sin salirte de tu estilo. Ideal para regalar con criterio y buena presencia.';
    }

    if (normalizedOccasion === 'asado' || normalizedOccasion === 'cena_amigos') {
      return 'Armamos esta caja para que tengas una opción segura, una botella con un poco más de nivel y otra para descubrir algo distinto sin salirte de tu estilo. Funciona muy bien para compartir en mesa.';
    }

    return `Armamos esta caja para que tengas una opción segura, una botella con un poco más de nivel y otra para descubrir algo distinto sin salirte de tu estilo. Queda alineada con tu perfil ${profile.name} y con la forma en la que disfrutás el vino.`;
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

    return `Una selección pensada para alguien que ${styleTone}, pero también quiere abrir espacio a nuevas etiquetas. Queda alineada con tu perfil ${profile.name} y con la forma en la que vivís el vino mes a mes.`;
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
      profileDescription.textContent = profile.description;
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
    const response = await fetch('vinos_lombardo_base.json');

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

  showLocalContextIfNeeded();
  renderQuestion();
  initSommelierChat();
}

const ASSISTANT_STORAGE_KEY = 'lombardo_assistant_history';

const getPageContext = () => {
  const customContext = document.body?.dataset?.pageContext;
  if (customContext) return customContext;

  const fileName = window.location.pathname.split('/').pop() || 'index.html';
  const contextMap = {
    'index.html': 'home',
    'vinos.html': 'vinos',
    'sommelier.html': 'sommelier',
    'club.html': 'club',
    'cafe.html': 'cafe',
    'experiencias.html': 'experiencias',
    'eventos.html': 'eventos',
    'contacto.html': 'contacto',
  };

  return contextMap[fileName] || 'general';
};

const initGlobalLombardoAssistant = () => {
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
        <p class="eyebrow">Asistente IA Lombardo</p>
        <h3>Puedo ayudarte con vinos, regalos, cajas, club, café y experiencias.</h3>
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
  const pageContext = getPageContext();

  const readHistory = () => {
    try {
      const raw = sessionStorage.getItem(ASSISTANT_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  };

  const writeHistory = (history) => {
    try {
      sessionStorage.setItem(ASSISTANT_STORAGE_KEY, JSON.stringify(history.slice(-12)));
    } catch (error) {
      // ignore
    }
  };

  let history = readHistory();

  const appendMessage = (role, content) => {
    if (!messages || !content) return;
    const item = document.createElement('article');
    item.className = `assistant-message is-${role}`;
    item.innerHTML = `<p class="assistant-role">${role === 'assistant' ? 'Asistente' : 'Vos'}</p><p>${content}</p>`;
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
  };

  const setLoading = (loading) => {
    if (!input || !submitBtn) return;
    input.disabled = loading;
    submitBtn.disabled = loading;
    submitBtn.textContent = loading ? 'Enviando...' : 'Enviar';
  };

  const sendMessage = async (message) => {
    const response = await fetch('/api/sommelier-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        pagina_actual: pageContext,
        history,
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || 'No se pudo obtener respuesta del asistente.');
    }

    return typeof data.answer === 'string' ? data.answer.trim() : '';
  };

  const handleSubmit = async (message) => {
    const trimmed = message.trim();
    if (!trimmed) return;

    appendMessage('user', trimmed);
    history.push({ role: 'user', content: trimmed });
    writeHistory(history);

    setLoading(true);
    try {
      const answer = await sendMessage(trimmed);
      const safeAnswer = answer || 'Gracias por tu consulta. Si querés, podés consultarlo directo por WhatsApp.';
      appendMessage('assistant', safeAnswer);
      history.push({ role: 'assistant', content: safeAnswer });
      writeHistory(history);
    } catch (error) {
      appendMessage('assistant', 'Ahora mismo no pude responder. Si querés, podés consultarlo directo por WhatsApp.');
    } finally {
      setLoading(false);
      input.value = '';
      input.focus();
    }
  };

  if (history.length) {
    history.forEach((item) => appendMessage(item.role, item.content));
  } else {
    const welcome = '¡Hola! Soy el Asistente IA Lombardo. Estoy para ayudarte con vinos, regalos, cajas, club, café y experiencias.';
    appendMessage('assistant', welcome);
    history.push({ role: 'assistant', content: welcome });
    writeHistory(history);
  }

  trigger?.addEventListener('click', () => {
    const isOpen = !panel.hidden;
    panel.hidden = isOpen;
    trigger.setAttribute('aria-expanded', String(!isOpen));
    container.classList.toggle('is-open', !isOpen);
    if (!isOpen) input.focus();
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
