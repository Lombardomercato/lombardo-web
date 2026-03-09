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

  const mockRecommendations = [
    {
      name: 'Trumpeter Malbec',
      price: '$18.500',
      reason: 'Una opción intensa y muy gastronómica, ideal para carnes y encuentros con amigos.',
    },
    {
      name: 'Saint Felicien Malbec',
      price: '$19.800',
      reason: 'Más elegante y estructurado, perfecto si querés subir un poco el nivel sin salirte de una línea clásica.',
    },
    {
      name: 'Rutini Cabernet Malbec',
      price: '$21.000',
      reason: 'Gran alternativa para compartir, con presencia y buen equilibrio para comidas importantes.',
    },
  ];

  const responses = {
    tipo_vino: '',
    presupuesto: '',
    ocasion: '',
    comida: '',
    estilo: '',
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

  if (stepTotal) stepTotal.textContent = String(questions.length);

  const isComplete = () => Object.values(responses).every(Boolean);

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

    prevBtn.hidden = currentStep === 0;
    const hasSelection = Boolean(selected);
    nextBtn.hidden = currentStep === questions.length - 1;
    nextBtn.disabled = !hasSelection;
    submitBtn.hidden = currentStep !== questions.length - 1;
    submitBtn.disabled = !isComplete();
  };

  const renderResults = () => {
    resultList.innerHTML = '';

    mockRecommendations.forEach((wine) => {
      const card = document.createElement('article');
      card.className = 'sommelier-wine-card reveal is-visible';
      card.innerHTML = `<h3>${wine.name}</h3><p class="sommelier-price">${wine.price}</p><p>${wine.reason}</p>`;
      resultList.appendChild(card);
    });
  };

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

  submitBtn.addEventListener('click', () => {
    if (!isComplete()) return;

    renderResults();
    setPanelTransition(quizPanel);
    quizPanel.hidden = true;
    resultPanel.hidden = false;
    setPanelTransition(resultPanel);
    sommelierApp.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });

    // punto futuro para integración con backend / IA
    // sendSommelierAnswers(responses)
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
