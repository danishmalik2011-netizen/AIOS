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
  let simTimer = null;
  let currentSimStep = 0;

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
      if (simTimer) {
        clearTimeout(simTimer);
        simTimer = null;
        const simTxt = document.querySelector('.mockup__sim-text');
        if (simTxt) simTxt.textContent = 'Simulation paused (Manual mode)';
        const pulse = document.querySelector('.mockup__sim-pulse');
        if (pulse) {
          pulse.style.background = '#f59e0b';
          pulse.style.boxShadow = '0 0 8px #f59e0b';
        }
      }
      activateTab(tab.dataset.view);
    });
    tab.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (simTimer) {
          clearTimeout(simTimer);
          simTimer = null;
        }
        activateTab(tab.dataset.view);
      }
    });
  });

  // ============================================
  // Mockup Auto-Simulation Flow Loop
  // ============================================
  const simulationSteps = [
    {
      stepId: 0,
      view: 'dashboard',
      badge: 'Director: Allocating "scaffold contact form"',
      run: () => {
        const tasksVal = document.getElementById('dashboard-tasks');
        if (tasksVal) tasksVal.textContent = '284';
        const linesVal = document.getElementById('dashboard-lines');
        if (linesVal) linesVal.textContent = '14.2k';
        const logVal = document.getElementById('dashboard-log');
        if (logVal) {
          logVal.innerHTML = `<span class="t-info"><svg class="ico" aria-hidden="true"><use href="#i-arrow" /></svg></span> <span class="t-agent">[Director]</span> Decomposing: "scaffold react contact form"
<span class="t-ok"><svg class="ico" aria-hidden="true"><use href="#i-check" /></svg></span> 3 subtasks created. Allocating agent roles...`;
        }
      }
    },
    {
      stepId: 1,
      view: 'agents',
      badge: 'Roster active: Architect & CodeSmith',
      run: () => {
        const archCard = document.getElementById('agent-card-architect');
        const codeCard = document.getElementById('agent-card-codesmith');
        const sentCard = document.getElementById('agent-card-sentinel');
        if (archCard) archCard.className = 'a-card a-card--active';
        if (codeCard) codeCard.className = 'a-card';
        if (sentCard) sentCard.className = 'a-card';
        
        const archStatus = document.getElementById('agent-status-architect');
        if (archStatus) {
          archStatus.textContent = 'Planning';
          archStatus.className = 'a-card__status status-running';
        }
        const chatAssistant = document.getElementById('chat-bubble-assistant');
        if (chatAssistant) {
          chatAssistant.style.opacity = '1';
          chatAssistant.innerHTML = `<span class="t-agent">[Architect]</span> Blueprint structured: ContactForm.tsx. Routing tasks to CodeSmith.`;
        }
      }
    },
    {
      stepId: 2,
      view: 'canvas',
      badge: 'CodeSmith: Writing ContactForm.tsx',
      run: () => {
        const archCard = document.getElementById('agent-card-architect');
        const codeCard = document.getElementById('agent-card-codesmith');
        if (archCard) archCard.className = 'a-card';
        if (codeCard) codeCard.className = 'a-card a-card--active';
        
        const codeStatus = document.getElementById('agent-status-codesmith');
        if (codeStatus) {
          codeStatus.textContent = 'Writing';
          codeStatus.className = 'a-card__status status-running';
        }
        
        const canvasCode = document.getElementById('canvas-code-block');
        if (canvasCode) {
          canvasCode.innerHTML = `<code><span class="c-keyword">import</span> React <span class="c-keyword">from</span> <span class="c-str">'react'</span>;
<span class="c-keyword">import</span> { useForm } <span class="c-keyword">from</span> <span class="c-str">'react-hook-form'</span>;

<span class="c-keyword">export function</span> <span class="c-fn">ContactForm</span>() {
  <span class="c-keyword">const</span> { register, handleSubmit } = <span class="c-fn">useForm</span>();
<span class="c-add">+  const onSubmit = (data) => console.log(data);</span>

  <span class="c-keyword">return</span> (
<span class="c-add">+    &lt;form onSubmit={handleSubmit(onSubmit)} className="space-y-4"&gt;</span>
<span class="c-add">+      &lt;input {...register('email', { required: true })} placeholder="Email" /&gt;</span>
<span class="c-add">+      &lt;button type="submit"&gt;Submit&lt;/button&gt;</span>
<span class="c-add">+    &lt;/form&gt;</span>
  );
}</code>`;
        }
      }
    },
    {
      stepId: 3,
      view: 'terminal',
      badge: 'Sentinel: Verifying logic and test suites',
      run: () => {
        const codeCard = document.getElementById('agent-card-codesmith');
        const sentCard = document.getElementById('agent-card-sentinel');
        if (codeCard) codeCard.className = 'a-card';
        if (sentCard) sentCard.className = 'a-card a-card--active';
        
        const sentStatus = document.getElementById('agent-status-sentinel');
        if (sentStatus) {
          sentStatus.textContent = 'Verifying';
          sentStatus.className = 'a-card__status status-running';
        }
        
        const termBlock = document.getElementById('terminal-body-block');
        if (termBlock) {
          termBlock.innerHTML = `<span class="t-dim">$ npm run test</span>
<span class="t-ok"><svg class="ico" aria-hidden="true"><use href="#i-check" /></svg> PASS</span> src/components/__tests__/ContactForm.test.tsx (3.8s)
  ✓ Form renders input fields correctly
  ✓ Input validation rules trigger errors
  ✓ Submission handles mock payload
<span class="t-ok"><svg class="ico" aria-hidden="true"><use href="#i-check" /></svg> Sentinel:</span> Code safety verified. 0 threats detected.`;
        }
      }
    },
    {
      stepId: 4,
      view: 'dashboard',
      badge: 'Goal Completed: Form scaffolding committed',
      run: () => {
        const sentCard = document.getElementById('agent-card-sentinel');
        if (sentCard) sentCard.className = 'a-card';
        
        const archStatus = document.getElementById('agent-status-architect');
        const codeStatus = document.getElementById('agent-status-codesmith');
        const sentStatus = document.getElementById('agent-status-sentinel');
        
        if (archStatus) { archStatus.textContent = 'Idle'; archStatus.className = 'a-card__status status-idle'; }
        if (codeStatus) { codeStatus.textContent = 'Idle'; codeStatus.className = 'a-card__status status-idle'; }
        if (sentStatus) { sentStatus.textContent = 'Idle'; sentStatus.className = 'a-card__status status-idle'; }
        
        const tasksVal = document.getElementById('dashboard-tasks');
        if (tasksVal) tasksVal.textContent = '285';
        const linesVal = document.getElementById('dashboard-lines');
        if (linesVal) linesVal.textContent = '14.3k';
        
        const logVal = document.getElementById('dashboard-log');
        if (logVal) {
          logVal.innerHTML = `<span class="t-ok"><svg class="ico" aria-hidden="true"><use href="#i-check" /></svg></span> <span class="t-agent">[Git]</span> Committed: "feat: contact form"
<span class="t-ok"><svg class="ico" aria-hidden="true"><use href="#i-check" /></svg></span> <span class="t-agent">[Director]</span> Task completed successfully in 12.8s!
<span class="t-prompt">aios <svg class="ico" aria-hidden="true"><use href="#i-chevron-right" /></svg></span> <span class="t-cursor"></span>`;
        }
      }
    }
  ];

  function runSimulationStep() {
    const step = simulationSteps[currentSimStep];
    
    // Update step highlights
    document.querySelectorAll('.step-indicator').forEach((el, idx) => {
      el.classList.toggle('active', idx === currentSimStep);
    });
    
    // Switch mockup tab
    activateTab(step.view);
    
    // Update status bar texts
    const simTxt = document.querySelector('.mockup__sim-text');
    if (simTxt) simTxt.textContent = step.badge;
    const pulse = document.querySelector('.mockup__sim-pulse');
    if (pulse) {
      pulse.style.background = '#38bdf8';
      pulse.style.boxShadow = '0 0 8px #38bdf8';
    }
    
    // Fire page modification
    step.run();
    
    // Schedule next
    currentSimStep = (currentSimStep + 1) % simulationSteps.length;
    simTimer = setTimeout(runSimulationStep, currentSimStep === 0 ? 5500 : 3500);
  }

  const mockupEl = document.querySelector('.mockup');
  if (mockupEl) {
    const mockupObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          if (!simTimer) runSimulationStep();
        } else {
          if (simTimer) {
            clearTimeout(simTimer);
            simTimer = null;
          }
        }
      });
    }, { threshold: 0.15 });
    mockupObserver.observe(mockupEl);
  }

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
          event_label: 'AIOS_Setup_1.3.0'
        });
      }
    });
  });

  // ============================================
  // Copy-to-clipboard for code snippets
  // ============================================
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const text = btn.dataset.copy || '';
      try {
        await navigator.clipboard.writeText(text);
      } catch (e) {
        // Fallback for non-secure contexts
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); } catch (_) {}
        document.body.removeChild(ta);
      }
      const label = btn.querySelector('.copy-btn__label');
      const original = label ? label.textContent : 'Copy';
      btn.classList.add('is-copied');
      if (label) label.textContent = 'Copied!';
      setTimeout(() => {
        btn.classList.remove('is-copied');
        if (label) label.textContent = original;
      }, 1600);
    });
  });

  // ============================================
  // Animated stat counters (count-up on scroll)
  // ============================================
  function animateCount(el) {
    const target = parseFloat(el.dataset.count);
    const suffix = el.dataset.suffix || '';
    const prefix = el.dataset.prefix || '';
    const decimals = (el.dataset.count.split('.')[1] || '').length;
    const duration = 1400;
    const start = performance.now();
    el.classList.add('is-counting');
    function tick(now) {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      const val = (target * eased).toFixed(decimals);
      el.textContent = prefix + val + suffix;
      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = prefix + target.toFixed(decimals) + suffix;
    }
    requestAnimationFrame(tick);
  }

  const statObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && entry.target.dataset.count !== undefined) {
        animateCount(entry.target);
        statObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });
  document.querySelectorAll('.stat__value[data-count]').forEach(el => statObserver.observe(el));

  // ============================================
  // Back-to-top button
  // ============================================
  const toTop = document.getElementById('to-top');
  if (toTop) {
    const onScroll = () => {
      if (window.scrollY > 600) {
        toTop.hidden = false;
        requestAnimationFrame(() => toTop.classList.add('is-visible'));
      } else {
        toTop.classList.remove('is-visible');
        setTimeout(() => { if (!toTop.classList.contains('is-visible')) toTop.hidden = true; }, 300);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    toTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: prefersReduced ? 'auto' : 'smooth' });
    });
  }

  // ============================================
  // Sticky nav shadow + active section highlight
  // ============================================
  const nav = document.querySelector('.nav');
  const navLinks = Array.from(document.querySelectorAll('.nav__links a[href^="#"]'));
  const sections = navLinks
    .map(a => document.querySelector(a.getAttribute('href')))
    .filter(Boolean);

  if (nav) {
    window.addEventListener('scroll', () => {
      nav.classList.toggle('nav--scrolled', window.scrollY > 12);
    }, { passive: true });
  }

  if (sections.length) {
    const sectionObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const id = entry.target.id;
          navLinks.forEach(a => {
            a.classList.toggle('is-active', a.getAttribute('href') === '#' + id);
          });
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach(s => sectionObserver.observe(s));
  }
  // Handle URL hashes on load/change to show appropriate tab and scroll to it
  function handleHashChange() {
    const hash = window.location.hash;
    if (hash === '#workspaces' || hash === '#docs') {
      const mockupEl = document.querySelector('.mockup');
      if (mockupEl) {
        mockupEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      
      // Pause simulation
      if (simTimer) {
        clearTimeout(simTimer);
        simTimer = null;
        const simTxt = document.querySelector('.mockup__sim-text');
        if (simTxt) simTxt.textContent = 'Simulation paused (Manual mode)';
        const pulse = document.querySelector('.mockup__sim-pulse');
        if (pulse) {
          pulse.style.background = '#f59e0b';
          pulse.style.boxShadow = '0 0 8px #f59e0b';
        }
      }
      
      activateTab(hash === '#workspaces' ? 'workspaces' : 'docs');
    }
  }
  
  window.addEventListener('hashchange', handleHashChange);
  setTimeout(handleHashChange, 300);
})();