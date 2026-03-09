const navToggle = document.querySelector('.nav-toggle');
const mainNav = document.querySelector('.main-nav');

if (navToggle && mainNav) {
  navToggle.addEventListener('click', () => {
    const open = mainNav.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', String(open));
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

  let currentStep = 0;

  const stepCurrent = sommelierApp.querySelector('[data-step-current]');
  const stepTotal = sommelierApp.querySelector('[data-step-total]');
  const stepTitle = sommelierApp.querySelector('[data-step-title]');
  const progressTrack = sommelierApp.querySelector('.sommelier-progress-track');
  const progressFill = sommelierApp.querySelector('[data-progress-fill]');
  const quizPanel = sommelierApp.querySelector('[data-quiz-panel]');
  const resultPanel = sommelierApp.querySelector('[data-result]');
  const questionTitle = sommelierApp.querySelector('[data-question-title]');
  const questionHelper = sommelierApp.querySelector('[data-question-helper]');
  const optionsWrap = sommelierApp.querySelector('[data-options]');
  const nextBtn = sommelierApp.querySelector('[data-next]');
  const prevBtn = sommelierApp.querySelector('[data-prev]');
  const submitBtn = sommelierApp.querySelector('[data-submit]');
  const restartBtn = sommelierApp.querySelector('[data-restart]');
  const resultList = sommelierApp.querySelector('[data-result-list]');
  const freeTextWrap = sommelierApp.querySelector('[data-free-text-wrap]');
  const freeTextInput = sommelierApp.querySelector('[data-free-text]');

  const requiredQuestionKeys = questions.map((question) => question.key);

  if (stepTotal) stepTotal.textContent = String(questions.length);

  const isComplete = () => requiredQuestionKeys.every((key) => Boolean(responses[key]));

  const setPanelTransition = (panel) => {
    panel.classList.add('is-transitioning');
    window.setTimeout(() => panel.classList.remove('is-transitioning'), 200);
  };

  const renderQuestion = () => {
    const question = questions[currentStep];
    const selected = responses[question.key];

    if (stepCurrent) stepCurrent.textContent = String(currentStep + 1);
    if (stepTitle) stepTitle.textContent = question.title;
    if (questionTitle) questionTitle.textContent = question.title;
    if (questionHelper) questionHelper.textContent = question.helper;
    if (progressTrack) progressTrack.setAttribute('aria-valuenow', String(currentStep + 1));
    if (progressFill) progressFill.style.width = `${((currentStep + 1) / questions.length) * 100}%`;

    optionsWrap.innerHTML = '';

    question.options.forEach((option) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'sommelier-option';
      button.textContent = option;
      button.setAttribute('aria-pressed', String(selected === option));

      if (selected === option) button.classList.add('is-selected');

      button.addEventListener('click', () => {
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

  const getRecommendationMessage = () => (
    `Una gran opción para ${responses.comida.toLowerCase()} y ${responses.ocasion.toLowerCase()}, dentro de tu rango de precio.`
  );

  const sortByPriorityAndPrice = (a, b) => {
    const priorityOrder = { alta: 3, media: 2, baja: 1 };
    const aPriority = priorityOrder[(a.prioridad_venta || '').toLowerCase()] || 0;
    const bPriority = priorityOrder[(b.prioridad_venta || '').toLowerCase()] || 0;

    if (bPriority !== aPriority) return bPriority - aPriority;
    return (a.precio || 0) - (b.precio || 0);
  };

  const getWineScore = (wine) => {
    let score = 0;

    if (answerMappings.tipo_vino[responses.tipo_vino]
      && wine.tipo_vino?.toLowerCase() === answerMappings.tipo_vino[responses.tipo_vino]) {
      score += 25;
    }

    if (wine.nivel_precio?.toLowerCase() === answerMappings.presupuesto[responses.presupuesto]) {
      score += 20;
    }

    if (wine.maridaje_principal?.toLowerCase() === answerMappings.comida[responses.comida]) {
      score += 25;
    }

    if (wine.ocasion?.toLowerCase() === answerMappings.ocasion[responses.ocasion]) {
      score += 20;
    }

    if ((wine.prioridad_venta || '').toLowerCase() === 'alta') {
      score += 10;
    }

    return score;
  };

  const getTopRecommendations = () => {
    const activeWines = winesCatalog.filter((wine) => wine.activo === true);

    const scoredWines = activeWines
      .map((wine) => ({ ...wine, score: getWineScore(wine) }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return sortByPriorityAndPrice(a, b);
      });

    const withMatches = scoredWines.filter((wine) => wine.score > 0).slice(0, 3);

    if (withMatches.length) return withMatches;

    return activeWines.sort(sortByPriorityAndPrice).slice(0, 3);
  };

  const renderResults = () => {
    resultList.innerHTML = '';
    const recommendations = getTopRecommendations();

    recommendations.forEach((wine) => {
      const card = document.createElement('article');
      card.className = 'sommelier-wine-card reveal is-visible';
      card.innerHTML = `<h3>${wine.nombre}</h3><p class="sommelier-price">${formatPrice(wine.precio)}</p><p>${getRecommendationMessage()}</p>`;
      resultList.appendChild(card);
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

    submitBtn.disabled = true;
    submitBtn.textContent = 'Buscando vinos...';

    try {
      if (!winesCatalog.length) {
        await loadWineCatalog();
      }

      renderResults();
      setPanelTransition(quizPanel);
      quizPanel.hidden = true;
      resultPanel.hidden = false;
      setPanelTransition(resultPanel);
      sommelierApp.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
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
    currentStep = 0;
    resultPanel.hidden = true;
    quizPanel.hidden = false;
    setPanelTransition(quizPanel);
    renderQuestion();
    sommelierApp.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
  });

  renderQuestion();
}
