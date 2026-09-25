import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

// Aplicar tema (claro/oscuro) antes de render para evitar parpadeo
const _pref = localStorage.getItem("aleke-theme") || "dark";
document.documentElement.classList.toggle("dark", _pref === "dark");

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)