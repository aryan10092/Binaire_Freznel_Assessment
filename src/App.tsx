import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, PointerEvent } from 'react'

import { Provider} from '@react-spectrum/s2'
import { Header } from './components/Header'
import { PanoramaViewer } from './components/PanoramaViewer'
import { Sidebar } from './components/Sidebar'
import { PanoramaStitcher} from './services/PanoramaStitcher'
import type {
  ElectronApi,
  OpenCvApi,
  OutputFormat,
  ProjectionType,
  SelectedImage, ViewerTransform,
} from './types'

function App() {
  const [images, setImages] = useState<SelectedImage[]>([])
  const [opencvReady, setOpencvReady] = useState( () => Boolean(window.__opencvReady))

  const [stitching, setStitching] = useState(false)
  const [stitchError, setStitchError] = useState('')
  const [panoramaCreated, setPanoramaCreated] = useState(false)
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('png')
  const [exportError, setExportError] = useState('')
  const [projection, setProjection] = useState<ProjectionType>('cylindrical')

  const [viewerTransform, setViewerTransform] = useState<ViewerTransform>({x: 0,y: 0,zoom: 1,rotation: 0})

  const previewCanvas = useRef<HTMLCanvasElement>(null)
  const panoramaStitcher = useRef(new PanoramaStitcher())

  const dragStart = useRef<{x: number, y: number,  viewerX: number,viewerY: number} | null>(null)

  useEffect(() => {
    const handleOpenCvReady = () => setOpencvReady(true)
    window.addEventListener('opencv-ready', handleOpenCvReady)
    return () => window.removeEventListener('opencv-ready', handleOpenCvReady)
  }, [])


  function addImages(event: ChangeEvent<HTMLInputElement>) {
    const selectedImages = Array.from(event.target.files ?? [])
    
    //console.log("Selected imagesss",selectedImages)
    const newImages = selectedImages.map((file) => ({
      file, previewUrl: URL.createObjectURL(file)}))

    setImages((currentImages) => [...currentImages, ...newImages])
     setPanoramaCreated(false)
    setExportError('')
    event.target.value = ''
  }

  function removeImage(indexToRemove: number) {
    setImages((currentImages) => {
      URL.revokeObjectURL(currentImages[indexToRemove].previewUrl)
      return currentImages.filter((_, index) => index !== indexToRemove)
    })
    setPanoramaCreated(false)
    setExportError('')
  }

  function handleProjectionChange(newProjection: ProjectionType) {
    setProjection(newProjection)
    setPanoramaCreated(false)
    setExportError('')
  }

  function handleOutputFormatChange(newFormat: OutputFormat) {
    setOutputFormat(newFormat)
    setExportError('')
  }

  async function createPanorama() {
    if (!previewCanvas.current || images.length < 2) return

    setStitching(true)
    setStitchError('')
    setExportError('')

    setViewerTransform({x: 0, y: 0,zoom: 1, rotation: 0,})

  // console.log("canvas element",previewCanvas.current)
    try {
      await panoramaStitcher.current.stitch(
        images.map((image) => image.file),
        previewCanvas.current,
        projection)

      setPanoramaCreated(true)
    } catch (error) {
      setStitchError(
        error instanceof Error ? error.message : 'Panorama stitching failed',
      )
    } finally {
      setStitching(false)
    }
  }

  async function exportPanorama() {
    if (!previewCanvas.current || !panoramaCreated) return

    const extension = outputFormat === 'jpeg' ? 'jpg' : outputFormat
    const pngDataUrl = previewCanvas.current.toDataURL('image/png')

    if (outputFormat === 'avif') {
      const electronApi = (window as Window & { electronAPI?: ElectronApi }).electronAPI

      if (!electronApi?.saveAvif) {
        setExportError('AVIF export is available when running the Electron app.')
        return
      }
      //console.log(pngDataUrl)
      
      try {
        const didSave = await electronApi.saveAvif(pngDataUrl.split(',')[1])
        if (didSave) setExportError('')
      } catch (error) {
        setExportError(error instanceof Error ? error.message : 'AVIF export failed')
      }
      return
    }

    setExportError('')
    const dataUrl = previewCanvas.current.toDataURL(`image/${outputFormat}`, 0.92)
    const downloadLink = document.createElement('a')
    downloadLink.href = dataUrl
    downloadLink.download = `panorama.${extension}`
    downloadLink.click()
  }

  function changeZoom(amount: number) {
    setViewerTransform((current) => ({
      ...current,
      zoom: Math.min(3, Math.max(0.5, current.zoom + amount)),
    }))
  }

  function rotateViewer() {
    setViewerTransform((current) => ({
      ...current,
      rotation: (current.rotation + 90) % 360,
    }))
  }

  function resetViewerTransform() {
    setViewerTransform({
      x: 0,
      y: 0,
      zoom: 1,
      rotation: 0,
    })
  }

  function startPan(event: PointerEvent<HTMLDivElement>) {
    dragStart.current = {
      x: event.clientX,
      y: event.clientY,
      viewerX: viewerTransform.x,
      viewerY: viewerTransform.y,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function panViewer(event: PointerEvent<HTMLDivElement>) {
    if (!dragStart.current) return
    setViewerTransform((current) => ({
      ...current,
      x: dragStart.current!.viewerX + event.clientX - dragStart.current!.x,
      y: dragStart.current!.viewerY + event.clientY - dragStart.current!.y,
    }))
  }

  function stopPan() {
    dragStart.current = null
  }

  useEffect(() => {
    if (
      !opencvReady ||
      images.length === 0 ||
      panoramaCreated ||
      !previewCanvas.current
    ) {
      return
    }

    const openCvWindow = window as Window & { cv?: OpenCvApi }
    const openCv = openCvWindow.cv

    if (!openCv) return

    let cancelled = false
    const imageElement = new Image()

    imageElement.onload = () => {
      if (cancelled || !previewCanvas.current) {
        return
      }

      const imageMat = openCv.imread(imageElement)
      openCv.imshow(previewCanvas.current, imageMat)
      imageMat.delete()
    }

    imageElement.src = images[0].previewUrl

    return () => {
      cancelled = true
      imageElement.onload = null
    }
  }, [images, opencvReady, panoramaCreated])

  return (
    <Provider>
      <main className="min-h-screen bg-[#f5f7f5] text-[#26332b]">
        <Header opencvReady={opencvReady} />

        <div className="mx-auto max-w-[1400px] px-8 py-8">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
            <Sidebar
              images={images}
              opencvReady={opencvReady}
              stitching={stitching}
              stitchError={stitchError}
              projection={projection}
              outputFormat={outputFormat}
              onAddImages={addImages}
              onRemoveImage={removeImage}
              onProjectionChange={handleProjectionChange}
              onOutputFormatChange={handleOutputFormatChange}
              onCreatePanorama={createPanorama}
            />

            <PanoramaViewer
              canvasRef={previewCanvas}
              hasImages={images.length > 0}
              opencvReady={opencvReady}
              panoramaCreated={panoramaCreated}
              viewerTransform={viewerTransform}
              exportError={exportError}
              onZoom={changeZoom}
              onRotate={rotateViewer}
              onResetTransform={resetViewerTransform}
              onStartPan={startPan}
              onPan={panViewer}
              onStopPan={stopPan}
              onExport={exportPanorama}
            />
          </div>
        </div>
      </main>
    </Provider>
  )
}

export default App
