import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import cvPromise from '@techstark/opencv-js'

declare global {
  interface Window {
    __opencvReady?: boolean
    cv?: any
  }
}

async function initializeOpenCV() {
  try {
    const cv = await cvPromise
    //console.log("OpenCV", cv)
    window.cv = cv
    window.__opencvReady = true
    window.dispatchEvent(new Event('opencv-ready'))
  } catch (error) {
    console.error('Failed to load OpenCV:', error)
  }
}

initializeOpenCV()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)