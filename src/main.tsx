// import { StrictMode } from 'react'
// import { createRoot } from 'react-dom/client'
// import './index.css'
// import App from './App.tsx'
// import cv from '@techstark/opencv-js'

// declare global {
//   interface Window {
//     __opencvReady?: boolean
//     cv?: typeof cv
//   }
// }

// window.cv = cv as typeof window.cv

// cv.onRuntimeInitialized = () => {
//   window.__opencvReady = true
//   window.dispatchEvent(new Event('opencv-ready'))
// }

// createRoot(document.getElementById('root')!).render(
//   <StrictMode>
//     <App />
//   </StrictMode>,
// )

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

    window.cv = cv
    window.__opencvReady = true

    // console.log('OpenCV loaded:', cv)
    // console.log('Mat:', cv.Mat)
    // console.log('ORB_create:', cv.ORB)
    // console.log(
    //   'ORB APIs:',
    //   Object.keys(cv).filter((key) =>
    //     key.toLowerCase().includes('orb')
    //   )
    // )

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