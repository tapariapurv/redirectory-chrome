// Scroll reveals, sticky-nav border, and the theme picker. No dependencies.
(() => {
  const nav = document.querySelector('.nav');
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
  );
  document.querySelectorAll('.reveal').forEach((el, i) => {
    el.style.transitionDelay = `${Math.min(i % 6, 5) * 50}ms`;
    io.observe(el);
  });

  const img = document.getElementById('theme-img');
  const tabs = document.querySelectorAll('.theme-picker button');
  // Warm the cache so switching is instant.
  tabs.forEach((t) => (new Image().src = t.dataset.shot));
  tabs.forEach((tab) =>
    tab.addEventListener('click', () => {
      if (tab.getAttribute('aria-selected') === 'true') return;
      tabs.forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
      img.classList.add('fading');
      setTimeout(() => {
        img.src = tab.dataset.shot;
        img.decode().finally(() => img.classList.remove('fading'));
      }, 180);
    })
  );
})();
