// AIOS Landing Page - Interactive functionality
(function() {
  'use strict';

  // ============================================
  // Theme Management
  // ============================================
  const THEME_KEY = 'aios-theme';
  const themeToggle = document.getElementById('theme-toggle');
  const html = document.documentElement;

  function getStoredTheme() {
    return localStorage.getItem(THEME_KEY);
  }

  function getPreferredTheme() {
    const stored = getStoredTheme();
    if (stored) return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    html.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
  }

  function initTheme() {
    const theme = getPreferredTheme();
    applyTheme(theme);
  }

  function toggleTheme() {
    const current = html.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
  }

  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
    themeToggle.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleTheme();
      }
    });
  }

  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!getStoredTheme()) {
      applyTheme(e.matches ? 'dark' : 'light');
    }
  });

  initTheme();

  // ============================================
  // Mockup Tab Switching
  // ============================================
  const tabs = document.querySelectorAll('.mockup__tab');
  const views = document.querySelectorAll('.mockup__view');

  function activateTab(targetView) {
    tabs.forEach(tab => {
      const isActive = tab.dataset.view === targetView;
      tab.classList.toggle('mockup__tab--active', isActive);
      tab.setAttribute('aria-selected', isActive);
    });

    views.forEach(view => {
      const isActive = view.id === `view-${targetView}`;
      view.classList.toggle('mockup__view--active', isActive);
      if (isActive) {
        view.removeAttribute('hidden');
      } else {
        view.setAttribute('hidden', '');
      }
    });
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      activateTab(tab.dataset.view);
    });
    tab.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activateTab(tab.dataset.view);
      }
    });
  });

  // ============================================
  // Mobile Menu
  // ============================================
  const menuToggle = document.getElementById('menu-toggle');
  const mobileMenu = document.getElementById('mobile-menu');

  if (menuToggle && mobileMenu) {
    menuToggle.addEventListener('click', () => {
      const expanded = menuToggle.getAttribute('aria-expanded') === 'true';
      menuToggle.setAttribute('aria-expanded', !expanded);
      mobileMenu.hidden = expanded;
    });

    mobileMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        menuToggle.setAttribute('aria-expanded', 'false');
        mobileMenu.hidden = true;
      });
    });
  }

  // ============================================
  // Intersection Observer for Scroll Animations
  // ============================================
  const observerOptions = {
    root: null,
    rootMargin: '0px 0px -10% 0px',
    threshold: 0.1
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  document.querySelectorAll('.reveal').forEach((el, i) => {
    el.style.setProperty('--idx', i);
    observer.observe(el);
  });

  // Automatically set transition delay index for children of staggered grids
  document.querySelectorAll('.stagger, .features, .stats, .mockup__metrics, .mockup__agents-grid').forEach(container => {
    Array.from(container.children).forEach((child, index) => {
      child.style.setProperty('--idx', index);
    });
  });

  // ============================================
  // Smooth Scroll for Anchor Links
  // ============================================
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;
      const target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        target.focus({ preventScroll: true });
      }
    });
  });

  // ============================================
  // Parallax Hero Glow (reduced motion safe)
  // ============================================
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!prefersReduced) {
    const heroGlow = document.querySelector('.hero__glow');
    if (heroGlow) {
      window.addEventListener('scroll', () => {
        const scrolled = window.scrollY;
        const rate = scrolled * 0.3;
        heroGlow.style.transform = `translateY(${rate}px)`;
      }, { passive: true });
    }
  }

  // ============================================
  // Download Tracking (optional)
  // ============================================
  document.querySelectorAll('a[href$=".exe"]').forEach(link => {
    link.addEventListener('click', () => {
      if (typeof gtag !== 'undefined') {
        gtag('event', 'download', {
          event_category: 'engagement',
          event_label: 'AIOS_Setup_1.2.5'
        });
      }
    });
  });
})();