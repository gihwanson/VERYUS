import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import './styles/variables.css'
import './styles/app-theme-pages.css'
import './styles/app-theme-contrast.css'
import { applyAppTheme, getSavedAppTheme } from './utils/appTheme'
import { applyBottomNavTheme, getSavedBottomNavTheme } from './utils/bottomNavTheme'
import App from './App.tsx'

applyAppTheme(getSavedAppTheme())
applyBottomNavTheme(getSavedBottomNavTheme())

registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <App />
)
