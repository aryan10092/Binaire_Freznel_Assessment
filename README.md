# Panorama Stitcher

A desktop panorama stitching application built as part of the Binaire Javascript Developer assessment.

## Features

* Select multiple images
* Create panorama using OpenCV.js
* Cylindrical and spherical projection
* Pan, zoom and rotate the panorama
* Export as PNG, JPEG and AVIF
* Electron desktop application

## Tech Used

* React
* TypeScript
* Electron
* OpenCV.js
* Tailwind CSS
* Adobe Spectrum 2
* Sharp

## How to Run

Install dependencies:

```bash
npm install
```

Start the React app:

```bash
npm run dev
```

In another terminal, start Electron:

```bash
npm run electron
```

## Stitching

The stitching is handled in `PanoramaStitcher.ts`.

The basic process is:

```text
Images
  ↓
ORB feature detection
  ↓
BFMatcher
  ↓
RANSAC + Homography
  ↓
Warp and combine
  ↓
Panorama
```

## Export

PNG and JPEG are exported directly from the canvas.

For AVIF, the canvas image is sent to the Electron main process and converted using Sharp.

## Project Structure

```text
src/
├── App.tsx
├── main.tsx
├── PanoramaStitcher.ts
└── index.css

electron/
├── main.cjs
└── preload.cjs
```

## Note

This project is made as a simple working implementation for the assessment.
