/**
 * Generates the login page HTML. Kept separate from serve.ts to stay under 300 lines.
 * Self-contained with Tailwind + DaisyUI CDN. Light mode default, system preference
 * detection, smooth animations. Designed to match Linear/Vercel login quality.
 */
export function loginPageHtml(): string {
	return `<!DOCTYPE html>
<html lang="en" data-theme="phantom-light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign in - Phantom</title>

<!-- Flash prevention -->
<script>
  (function() {
    var stored = localStorage.getItem('phantom-theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = stored || (prefersDark ? 'phantom-dark' : 'phantom-light');
    document.documentElement.setAttribute('data-theme', theme);
  })();
<\/script>

<!-- Fonts -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">

<!-- DaisyUI + Tailwind -->
<link href="https://cdn.jsdelivr.net/npm/daisyui@5" rel="stylesheet" type="text/css" />
<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"><\/script>

<style type="text/tailwindcss">
  @theme {
    --color-phantom: #0891b2;
    --color-phantom-bright: #22d3ee;
    --color-phantom-dim: #0e7490;
    --font-family-sans: 'Inter', system-ui, -apple-system, sans-serif;
  }

  [data-theme="phantom-light"] {
    --color-base-100: #fafaf9;
    --color-base-200: #ffffff;
    --color-base-300: #e7e5e4;
    --color-base-content: #1c1917;
    --color-primary: #0891b2;
    --color-primary-content: #ffffff;
    --color-secondary: #57534e;
    --color-secondary-content: #ffffff;
    --color-accent: #0891b2;
    --color-accent-content: #ffffff;
    --color-neutral: #f5f5f4;
    --color-neutral-content: #57534e;
    --color-info: #2563eb;
    --color-info-content: #ffffff;
    --color-success: #16a34a;
    --color-success-content: #ffffff;
    --color-warning: #ca8a04;
    --color-warning-content: #ffffff;
    --color-error: #dc2626;
    --color-error-content: #ffffff;
    --radius-box: 0.75rem;
    --radius-field: 0.625rem;
    --radius-selector: 0.5rem;
    --border: 1px;
    --depth: 1;
    --noise: 0;
    color-scheme: light;
  }

  [data-theme="phantom-dark"] {
    --color-base-100: #0c0a09;
    --color-base-200: #1c1917;
    --color-base-300: #292524;
    --color-base-content: #fafaf9;
    --color-primary: #22d3ee;
    --color-primary-content: #0c0a09;
    --color-secondary: #a8a29e;
    --color-secondary-content: #0c0a09;
    --color-accent: #22d3ee;
    --color-accent-content: #0c0a09;
    --color-neutral: #1c1917;
    --color-neutral-content: #a8a29e;
    --color-info: #60a5fa;
    --color-info-content: #0c0a09;
    --color-success: #4ade80;
    --color-success-content: #0c0a09;
    --color-warning: #fbbf24;
    --color-warning-content: #0c0a09;
    --color-error: #f87171;
    --color-error-content: #0c0a09;
    --radius-box: 0.75rem;
    --radius-field: 0.625rem;
    --radius-selector: 0.5rem;
    --border: 1px;
    --depth: 1;
    --noise: 0;
    color-scheme: dark;
  }

  html {
    transition: background-color 0.2s ease, color 0.2s ease;
  }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .login-animate {
    animation: fadeUp 0.4s ease-out;
  }

  .btn-spinner {
    display: inline-block;
    width: 16px;
    height: 16px;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
    margin-right: 8px;
    vertical-align: middle;
    opacity: 0.6;
  }
</style>
</head>
<body class="bg-base-100 text-base-content font-sans min-h-screen flex flex-col items-center justify-center px-6 py-12">

  <!-- Theme toggle -->
  <button
    id="theme-toggle"
    class="fixed top-4 right-4 btn btn-ghost btn-sm btn-square z-50"
    aria-label="Toggle theme"
  >
    <svg id="icon-sun" class="w-4 h-4 hidden" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
    </svg>
    <svg id="icon-moon" class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
    </svg>
  </button>

  <div class="w-full max-w-sm login-animate">
    <!-- Brand -->
    <div class="flex flex-col items-center mb-8">
      <div class="w-28 h-28 mb-4"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none"><defs><linearGradient id="ghostBody" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#6ee7a8"/><stop offset="18%" stop-color="#34d48c"/><stop offset="35%" stop-color="#b87aed"/><stop offset="55%" stop-color="#8b5cf6"/><stop offset="75%" stop-color="#FB923C"/><stop offset="100%" stop-color="#F97316"/></linearGradient><linearGradient id="ghostStroke" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#1fa86e"/><stop offset="40%" stop-color="#6d28d9"/><stop offset="100%" stop-color="#EA580C"/></linearGradient><radialGradient id="glowCenter" cx="0.5" cy="0.4" r="0.5"><stop offset="0%" stop-color="#c4b5fd" stop-opacity="0.25"/><stop offset="60%" stop-color="#a78bfa" stop-opacity="0.1"/><stop offset="100%" stop-color="#7c3aed" stop-opacity="0"/></radialGradient></defs><circle cx="256" cy="250" r="200" fill="url(#glowCenter)"><animate attributeName="r" values="190;210;190" dur="3s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.8;1;0.8" dur="3s" repeatCount="indefinite"/></circle><g><animateTransform attributeName="transform" type="translate" values="0,0; 0,-8; 0,0" dur="2.5s" repeatCount="indefinite" calcMode="spline" keySplines="0.45 0 0.55 1; 0.45 0 0.55 1"/><path fill="url(#ghostBody)" stroke="url(#ghostStroke)" stroke-width="3"><animate attributeName="d" dur="2s" repeatCount="indefinite" calcMode="spline" keySplines="0.45 0 0.55 1; 0.45 0 0.55 1" values="M 256 52 C 160 52, 100 130, 100 230 L 100 380 C 100 395, 112 405, 122 395 C 135 382, 148 398, 160 405 C 175 414, 185 395, 198 390 C 210 386, 218 404, 232 408 C 244 412, 250 398, 256 394 C 262 398, 268 412, 280 408 C 294 404, 302 386, 314 390 C 327 395, 337 414, 352 405 C 364 398, 377 382, 390 395 C 400 405, 412 395, 412 380 L 412 230 C 412 130, 352 52, 256 52 Z;M 256 52 C 160 52, 100 130, 100 230 L 100 380 C 100 390, 115 410, 128 400 C 140 390, 150 405, 165 412 C 178 418, 190 398, 202 393 C 214 388, 222 410, 236 414 C 248 418, 254 402, 256 398 C 258 402, 264 418, 276 414 C 290 410, 298 388, 310 393 C 322 398, 334 418, 347 412 C 362 405, 372 390, 384 400 C 397 410, 412 390, 412 380 L 412 230 C 412 130, 352 52, 256 52 Z;M 256 52 C 160 52, 100 130, 100 230 L 100 380 C 100 395, 112 405, 122 395 C 135 382, 148 398, 160 405 C 175 414, 185 395, 198 390 C 210 386, 218 404, 232 408 C 244 412, 250 398, 256 394 C 262 398, 268 412, 280 408 C 294 404, 302 386, 314 390 C 327 395, 337 414, 352 405 C 364 398, 377 382, 390 395 C 400 405, 412 395, 412 380 L 412 230 C 412 130, 352 52, 256 52 Z"/></path><ellipse cx="210" cy="225" rx="32" ry="38" fill="#1a1a2e"/><circle cx="220" cy="211" r="14" fill="white" opacity="0.9"/><ellipse cx="302" cy="225" rx="32" ry="38" fill="#1a1a2e"/><circle cx="312" cy="211" r="14" fill="white" opacity="0.9"/><ellipse cx="256" cy="300" rx="28" ry="22" fill="#1a1a2e"/><circle cx="175" cy="265" r="24" fill="#f0abcf" opacity="0.25"/><circle cx="337" cy="265" r="24" fill="#f0abcf" opacity="0.25"/></g></svg></div>
      <div class="flex items-center gap-2">
        <span class="text-2xl font-bold tracking-tight">Phantom</span>
        <span class="badge badge-sm bg-primary/10 text-primary border-primary/20 font-mono text-xs">agent</span>
      </div>
      <p class="text-sm text-base-content/50 mt-1">Your autonomous AI co-worker</p>
    </div>

    <!-- Card -->
    <div class="card bg-base-200 border border-base-300 shadow-sm">
      <div class="card-body p-8">
        <h1 class="text-lg font-semibold tracking-tight mb-1">Welcome back</h1>
        <p class="text-sm text-base-content/50 mb-6 leading-relaxed">
          Enter the access token from your Slack DM to continue.
        </p>

        <form id="login-form" autocomplete="off">
          <div class="mb-5">
            <label class="text-xs font-medium text-base-content/60 mb-1.5 block" for="token">Access token</label>
            <input
              class="input input-bordered w-full bg-base-100 border-base-300 focus:border-primary focus:outline-none text-sm"
              id="token"
              name="token"
              type="text"
              placeholder="Paste your token here"
              autocomplete="off"
              spellcheck="false"
            />
          </div>
          <button
            class="btn btn-primary w-full text-sm font-medium"
            type="submit"
            id="submit-btn"
          >Sign in</button>

          <!-- Error message -->
          <div id="error-msg" class="hidden mt-4">
            <div class="flex items-center gap-2 p-3 rounded-xl bg-error/10 border border-error/20">
              <svg class="w-4 h-4 text-error flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
              </svg>
              <span id="error-text" class="text-xs text-error"></span>
            </div>
          </div>

          <!-- Success message -->
          <div id="success-msg" class="hidden mt-4">
            <div class="flex items-center gap-2 p-3 rounded-xl bg-success/10 border border-success/20">
              <svg class="w-4 h-4 text-success flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
              <span class="text-xs text-success">Authenticated. Redirecting...</span>
            </div>
          </div>
        </form>

        <!-- Divider -->
        <div class="flex items-center gap-3 my-5">
          <div class="flex-1 h-px bg-base-300"></div>
          <span class="text-xs text-base-content/30">or</span>
          <div class="flex-1 h-px bg-base-300"></div>
        </div>

        <p class="text-center text-xs text-base-content/40 leading-relaxed">
          Ask your Phantom agent for a magic link via Slack.
        </p>
      </div>
    </div>

    <p class="text-center text-xs text-base-content/30 mt-6">Phantom - AI that works alongside you</p>
  </div>

  <script>
    // Theme toggle
    (function() {
      var toggle = document.getElementById('theme-toggle');
      var sun = document.getElementById('icon-sun');
      var moon = document.getElementById('icon-moon');

      function updateIcons() {
        var theme = document.documentElement.getAttribute('data-theme');
        var isDark = theme === 'phantom-dark';
        sun.classList.toggle('hidden', !isDark);
        moon.classList.toggle('hidden', isDark);
      }

      updateIcons();

      toggle.addEventListener('click', function() {
        var current = document.documentElement.getAttribute('data-theme');
        var next = current === 'phantom-dark' ? 'phantom-light' : 'phantom-dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('phantom-theme', next);
        updateIcons();
      });
    })();

    // Auth logic
    (function() {
      var params = new URLSearchParams(location.search);
      var magic = params.get('magic');
      if (magic) {
        authenticate(magic);
        return;
      }

      document.getElementById('login-form').addEventListener('submit', function(e) {
        e.preventDefault();
        var token = document.getElementById('token').value.trim();
        if (token) authenticate(token);
      });

      function showError(text) {
        document.getElementById('error-text').textContent = text;
        document.getElementById('error-msg').classList.remove('hidden');
        document.getElementById('success-msg').classList.add('hidden');
      }

      function showSuccess() {
        document.getElementById('success-msg').classList.remove('hidden');
        document.getElementById('error-msg').classList.add('hidden');
      }

      function authenticate(token) {
        var btn = document.getElementById('submit-btn');
        btn.disabled = true;
        btn.innerHTML = '<span class="btn-spinner"><\\/span>Signing in...';

        fetch('/ui/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: token }),
          credentials: 'same-origin'
        }).then(function(res) {
          if (res.ok) {
            showSuccess();
            setTimeout(function() { location.href = '/ui/'; }, 600);
          } else {
            return res.json().then(function(data) {
              showError(data.error || 'Invalid token. Please try again.');
              btn.disabled = false;
              btn.innerHTML = 'Sign in';
            });
          }
        }).catch(function() {
          showError('Unable to connect. Check your network and try again.');
          btn.disabled = false;
          btn.innerHTML = 'Sign in';
        });
      }
    })();
  <\/script>
</body>
</html>`;
}
