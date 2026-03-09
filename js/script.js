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
