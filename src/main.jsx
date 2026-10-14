import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './lib/auth'
import { registerSW } from './lib/push'
import { applyTheme, loadLocalTheme } from './lib/theme'
import './index.css'

// Aplica el tema guardado antes de dibujar la app (sin parpadeo de colores)
applyTheme(loadLocalTheme())
registerSW()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)
