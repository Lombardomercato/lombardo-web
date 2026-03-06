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
