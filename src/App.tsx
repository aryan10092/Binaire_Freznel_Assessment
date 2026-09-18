import { useEffect, useRef, useState } from 'react'
import { PanoramaStitcher } from './services/PanoramaStitcher'
import type { ProjectionType } from './services/PanoramaStitcher'
import {
  Provider,
  Button,
  Picker,
  PickerItem,
} from '@react-spectrum/s2'

type SelectedImage = {
  file: File
  previewUrl: string
}

type OpenCvApi = {
  imread: (image: HTMLImageElement) => { delete: () => void }
  imshow: (canvas: HTMLCanvasElement, image: { delete: () => void }) => void
}

type ViewerTransform = {
  x: number
  y: number
  zoom: number
  rotation: number
}

type ElectronApi = {
  saveAvif?: (pngBase64: string) => Promise<boolean>
}

function App() {
  const [images, setImages] = useState<SelectedImage[]>([])
//   const [opencvReady, setOpencvReady] = useState(() => {
//     const openCvWindow = window as Window & { __opencvReady?: boolean }
//     return Boolean(openCvWindow.__opencvReady)
//   })
const [opencvReady, setOpencvReady] = useState(
  () => Boolean(window.__opencvReady)
)
  const [stitching, setStitching] = useState(false)
  const [stitchError, setStitchError] = useState('')
  const [panoramaCreated, setPanoramaCreated] = useState(false)
  const [outputFormat, setOutputFormat] = useState<'png' | 'jpeg' | 'avif'>('png')
  const [exportError, setExportError] = useState('')
  const [projection, setProjection] = useState<ProjectionType>('cylindrical')
  const [viewerTransform, setViewerTransform] = useState<ViewerTransform>({
    x: 0,
    y: 0,
    zoom: 1,
    rotation: 0,
  })
  const previewCanvas = useRef<HTMLCanvasElement>(null)
  const panoramaStitcher = useRef(new PanoramaStitcher())
  const dragStart = useRef<{ x: number; y: number; viewerX: number; viewerY: number } | null>(null)

  useEffect(() => {
    const handleOpenCvReady = () => setOpencvReady(true)
    window.addEventListener('opencv-ready', handleOpenCvReady)
    return () => window.removeEventListener('opencv-ready', handleOpenCvReady)
  }, [])

  function addImages(event: React.ChangeEvent<HTMLInputElement>) {
    const selectedImages = Array.from(event.target.files ?? [])
   // console.log('Selected images', selectedImages)

    const newImages = selectedImages.map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
    }))
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

  async function createPanorama() {
    if (!previewCanvas.current || images.length < 2) return

    setStitching(true)
    setStitchError('')
     setExportError('')

  setViewerTransform({
    x: 0,
    y: 0,
    zoom: 1,
    rotation: 0,
  })

  console.log('Creating panorama with projection', projection)
    try {
      await panoramaStitcher.current.stitch(
        images.map((image) => image.file),
        previewCanvas.current,
        projection,
      )
      setPanoramaCreated(true)
    } catch (error) {
      setStitchError(error instanceof Error ? error.message : 'Panorama stitching failed')
    } finally {
      setStitching(false)
    }
  }

  async function exportPanorama() {
    if (!previewCanvas.current || !panoramaCreated) return

    console.log('Exporting panorama as', outputFormat)

    const extension = outputFormat === 'jpeg' ? 'jpg' : outputFormat
    const pngDataUrl = previewCanvas.current.toDataURL('image/png')

    if (outputFormat === 'avif') {
      const electronApi = (window as Window & { electronAPI?: ElectronApi }).electronAPI
      if (!electronApi?.saveAvif) {
        setExportError('AVIF export is available when running the Electron app.')
        return
      }

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

  function startPan(event: React.PointerEvent<HTMLDivElement>) {
    dragStart.current = {
      x: event.clientX,
      y: event.clientY,
      viewerX: viewerTransform.x,
      viewerY: viewerTransform.y,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function panViewer(event: React.PointerEvent<HTMLDivElement>) {
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

  const openCvWindow =
    window as Window & { cv?: OpenCvApi }

  const openCv = openCvWindow.cv

  if (!openCv) return

  let cancelled = false

  const imageElement = new Image()

  imageElement.onload = () => {
    if (
      cancelled ||
      !previewCanvas.current
    ) {
      return
    }

    const imageMat =
      openCv.imread(imageElement)

    openCv.imshow(
      previewCanvas.current,
      imageMat,
    )

    imageMat.delete()
  }

  imageElement.src =
    images[0].previewUrl

  return () => {
    cancelled = true
    imageElement.onload = null
  }
}, [
  images,
  opencvReady,
  panoramaCreated,
])


return (
  <Provider >
    <main className="min-h-screen bg-[#f5f7f5] text-[#26332b]">
      {/*app header */}
      <header className="border-b border-[#d8ded9] bg-white">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-8 py-5">
          <div>
         <h1 className="text-2xl font-semibold tracking-tight">
              Panorama Stitcher  </h1>

            <p className="mt-1 text-sm text-[#68756d]">
              Create and export panoramas from multiple images
            </p>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                opencvReady ? "bg-[#3f8f5b]" : "bg-[#c58a32]"
              }`} />

            <span className="text-[#68756d]">
              {opencvReady ? "OpenCV ready" : "Loading OpenCV..."}
            </span>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="mx-auto max-w-[1400px] px-8 py-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">

          {/* Left side */}
          <aside className="h-fit rounded-xl border border-[#d8ded9] bg-white p-5 shadow-sm">
            <div className="mb-6">
              <h2 className="text-base font-semibold">
                Images
              </h2>

              <p className="mt-1 text-sm leading-5 text-[#68756d]">
                Add at least two images with overlapping areas.
              </p>
            </div>

            {/* Add images */}
            <div className="mb-5">
              <Button
                variant="primary"
                staticColor='black'
                onPress={() =>
                  document.getElementById("image-input")?.click()
                } >
                Add images
              </Button>

              <input
                id="image-input"
                type="file"
                accept=".jpg,.jpeg,.png,.avif"
                multiple
                className="hidden"
                onChange={addImages}
              />
            </div>

            {/* Selected images */}
            {images.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    Selected images
                  </span>

                  <span className="text-xs text-[#7a867f]">
                    {images.length} image{images.length !== 1 ? "s" : ""}
                  </span>
                </div>

                <div className="max-h-[300px] space-y-2 overflow-y-auto pr-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-[#c7d0ca]">
                  {images.map((image, index) => (
                    <div
                      key={`${image.file.name}-${index}`}
                      className="flex items-center gap-3  rounded-lg border border-[#e0e5e1] bg-[#f8faf8] p-2"
                    >
                      <img
                        src={image.previewUrl}
                        alt={image.file.name}
                        className="h-12 w-16 rounded-md border border-[#d8ded9] object-cover"
                      />

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {image.file.name}
                        </p>

                        <p className="text-xs text-[#7a867f]">
                          Image {index + 1}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeImage(index)}
                        className="rounded-md px-2 py-1 text-xs text-[#68756d] transition hover:bg-[#e9eeea] hover:text-[#26332b]"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Settings */}
            <div className="mt-6 border-t border-[#e0e5e1] pt-5">
              <div className="space-y-4">
                <Picker
                  label="Projection"
                  key={projection}
                  value={projection}
                  onChange={(key) => {
                    const value = String(key) as ProjectionType
                    setProjection(value)
                    setPanoramaCreated(false)
                    setExportError("")
                  }}
                >
                  <PickerItem id="cylindrical">Cylindrical</PickerItem>
                  <PickerItem id="spherical">Spherical</PickerItem>
                </Picker>

                <Picker
                   label="Output format"
  value={outputFormat}
  onChange={(key) => {
    console.log('Selected key:', key);
    if (key === 'png' || key === 'jpeg' || key === 'avif') {
      setOutputFormat(key);
      setExportError('');
    }
  }}
                >
                  <PickerItem id="png">PNG</PickerItem>
                  <PickerItem id="jpeg">JPEG</PickerItem>
                  <PickerItem id="avif">AVIF</PickerItem   >
                </Picker>
              </div>
            </div>

            {/* Create */}
            <div className="mt-6 border-t border-[#e0e5e1] pt-5">
              <Button
                variant="primary"
                
                staticColor="black"
                onPress={createPanorama}
                isDisabled={
                  !opencvReady ||
                  images.length < 2 ||
                  stitching
                }
                
                isPending={stitching}
              >
                Create panorama
              </Button>

              {stitchError && (
                <div className="mt-3 rounded-lg border border-[#e4caca] bg-[#fff7f7] px-3 py-2 text-sm text-[#9a4444]">
                  {stitchError}
                </div>
              )}
            </div>
          </aside>

          {/* Right side - Viewer */}
          <section className="min-w-0">
            <div className="overflow-hidden rounded-xl border border-[#d8ded9] bg-white shadow-sm">

              {/* Viewer header */}
              <div className="flex items-center justify-between border-b border-[#e0e5e1] px-5 py-4">
                <div>
                  <h2 className="text-base font-semibold">
                    Panorama viewer
                  </h2>

                  <p className="mt-1 text-xs text-[#7a867f]">
                    Drag to pan · Scroll to zoom · Rotate with the button
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    fillStyle='outline'
                    staticColor='black'
                    onPress={() => changeZoom(-0.1)}
                    isDisabled={!panoramaCreated}
                  >
                    −
                  </Button>

                  <Button
                    variant="primary"
                    fillStyle='outline'
                    staticColor='black'
                    onPress={() => changeZoom(0.1)}
                    isDisabled={!panoramaCreated}
                  >
                    +
                  </Button>

                  <Button
                    variant="primary"
                    fillStyle='outline'
                    onPress={rotateViewer}
                    staticColor="black"
                    isDisabled={!panoramaCreated}
                  >
                    Rotate
                  </Button>

                  <Button
                    variant="primary"
                    fillStyle='outline'
                    staticColor='black'
                    onPress={() =>
                      setViewerTransform({
                        x: 0,
                        y: 0,
                        zoom: 1,
                        rotation: 0,
                      })
                    }
                    isDisabled={!panoramaCreated}
                  >
                    Reset
                  </Button>
                </div>
              </div>

              {/* Viewer */}
              <div
                className="flex h-[min(68vh,620px)] min-h-[430px] items-center justify-center overflow-hidden bg-[#edf1ed]"
                style={{
                  cursor: panoramaCreated
                    ? "grab"
                    : "default",
                }}
                onPointerDown={startPan}
                onPointerMove={panViewer}
                onPointerUp={stopPan}
                onPointerCancel={stopPan}
                onWheel={(event) => {
                  if (!panoramaCreated) return

                  event.preventDefault()

                  changeZoom(
                    event.deltaY > 0 ? -0.1 : 0.1
                  )
                }}
              >
                {images.length > 0 && opencvReady ? (
                  <div
                    className="flex items-center justify-center"
                    style={{
                      transform: `
                        translate(${viewerTransform.x}px, ${viewerTransform.y}px)
                        scale(${viewerTransform.zoom})
                        rotate(${viewerTransform.rotation}deg)
                      `,
                    }}
                  >
                    <canvas
                      ref={previewCanvas}
                      className="block max-h-[560px] max-w-[1050px] rounded-md shadow-sm"
                    />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center text-center">
                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#dfe7e0] text-3xl text-[#617267]">
                      +
                    </div>

                    <h3 className="text-base font-medium text-[#3d4b43]">
                      No panorama yet
                    </h3>

                    <p className="mt-2 max-w-sm text-sm text-[#78847d]">
                      Add at least two images and create a panorama
                      to see the result here.
                    </p>

                    <p className="mt-3 text-xs text-[#929c96]">
                      JPG · PNG · AVIF
                    </p>
                  </div>
                )}
              </div>

              {/* Viewer footer */}
              <div className="flex items-center justify-between border-t border-[#e0e5e1] bg-white px-5 py-4">
                <div className="text-sm text-[#68756d]">
                  {panoramaCreated
                    ? "Panorama ready"
                    : "Waiting for panorama"}
                </div>

                <Button
                  variant="primary"
                  staticColor="black"
                  onPress={exportPanorama}
                  isDisabled={!panoramaCreated}
                >
                  Export panorama
                </Button>
              </div>
            </div>

            {/* Export error */}
            {exportError && (
              <div className="mt-3 rounded-lg border border-[#e4caca] bg-[#fff7f7] px-4 py-3 text-sm text-[#9a4444]">
                {exportError}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  </Provider>
)


}

export default App
