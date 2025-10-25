// src/main.tsx

import React from 'react';
import ReactDOM from 'react-dom/client';
// FIX: Use a NAMED import to resolve the "no exported member" error.
import App from './App.tsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);