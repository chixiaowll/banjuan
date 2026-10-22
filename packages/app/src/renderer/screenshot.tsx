import React from 'react'
import { createRoot } from 'react-dom/client'
import { I18nProvider } from '@banjuan/shared-ui/src/i18n/index.js'
import Overlay from './screenshot/Overlay.js'
import Pin from './screenshot/Pin.js'

// Its own Vite entry: React + the i18n module only, not the 3MB main bundle.
const isPin = window.location.hash === '#pin'
if (isPin) document.body.classList.add('pin')
createRoot(document.getElementById('root')!).render(
  <I18nProvider>{isPin ? <Pin /> : <Overlay />}</I18nProvider>,
)
