import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import './styles/variables.css'
import './styles/app-theme-pages.css'
import { applyAppTheme, getSavedAppTheme } from './utils/appTheme'
import { applyBottomNavTheme, getSavedBottomNavTheme } from './utils/bottomNavTheme'
import { initAppUiStyle } from './utils/appUiStyle'
import { getSavedAppUiStyle } from './utils/appUiStyleStorage'
import { loadUiStyleCss } from './utils/loadUiStyleCss'
import App from './App.tsx'

async function bootstrap() {
  initAppUiStyle()
  await loadUiStyleCss(getSavedAppUiStyle())
  applyAppTheme(getSavedAppTheme())
  applyBottomNavTheme(getSavedBottomNavTheme())

  registerSW({ immediate: true })

  createRoot(document.getElementById('root')!).render(
    <App />
  )
}

void bootstrap()
