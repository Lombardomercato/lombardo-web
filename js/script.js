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

if (!prefersReducedMotion) {
  document.documentElement.classList.add('motion-enabled');
  const revealNodes = document.querySelectorAll('.reveal');

  if (revealNodes.length) {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.2, rootMargin: '0px 0px -40px 0px' });

    revealNodes.forEach((node) => revealObserver.observe(node));
  }

  const parallaxNodes = document.querySelectorAll('[data-parallax]');

  if (parallaxNodes.length) {
    const updateParallax = () => {
      parallaxNodes.forEach((node) => {
        const speed = Number(node.dataset.parallax || 8);
        const rect = node.getBoundingClientRect();
        const offset = (window.innerHeight - rect.top) / window.innerHeight;
        const movement = (offset - 0.5) * speed;
        node.style.transform = `translate3d(0, ${movement}px, 0)`;
      });
    };

    updateParallax();
    window.addEventListener('scroll', updateParallax, { passive: true });
    window.addEventListener('resize', updateParallax);
  }
} else {
  document.querySelectorAll('.reveal').forEach((node) => node.classList.add('is-visible'));
}
