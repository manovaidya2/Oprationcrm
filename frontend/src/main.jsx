// ============================================================
// main.jsx - AuthProvider wrapper
// ============================================================

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { installUploadCompression } from './lib/imageCompression.js'

// every image uploaded from any page is compressed in the browser first
installUploadCompression()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
