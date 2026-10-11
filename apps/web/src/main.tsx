import React from 'react';
import ReactDOM from 'react-dom/client';
import { initStore } from './data/store';
import { applyTheme } from './lib/prefs';
import App from './App';
import './index.css';

applyTheme();
initStore();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
