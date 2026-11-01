import React from 'react';
import ReactDOM from 'react-dom/client';
import { initStore } from './data/store';
import { applyTheme } from './lib/prefs';
import App from './App';
import './index.css';

applyTheme();
initStore();

// PF-08: installable app that opens without network (the service worker only caches the app's own files)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => undefined));
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
