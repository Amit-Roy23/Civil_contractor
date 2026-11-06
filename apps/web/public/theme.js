// sets light / dark before the first paint (kept as a file so no inline script is needed)
try {
  var p = JSON.parse(localStorage.getItem('wcm-prefs') || '{}');
  var t = p.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', t);
} catch (e) {}
