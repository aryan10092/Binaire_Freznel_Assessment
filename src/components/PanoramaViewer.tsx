import type { PointerEvent, Ref, WheelEvent } from 'react'
import { Button } from '@react-spectrum/s2'
import type { ViewerTransform } from '../types'

interface PanoramaViewerProps {
  canvasRef: Ref<HTMLCanvasElement>
  hasImages: boolean
  opencvReady: boolean
  panoramaCreated: boolean
  viewerTransform: ViewerTransform
  exportError: string
  onZoom: (amount: number) => void
  onRotate: () => void
  onResetTransform: () => void
  onStartPan: (event: PointerEvent<HTMLDivElement>) => void
  onPan: (event: PointerEvent<HTMLDivElement>) => void
  onStopPan: () => void
  onExport: () => void
}

export function PanoramaViewer({
  canvasRef,
  hasImages,
  opencvReady,
  panoramaCreated,
  viewerTransform, 
  exportError,

  onZoom,
  onRotate,
  onResetTransform,
  onStartPan,
  onPan,
  onStopPan,
  onExport,
}: PanoramaViewerProps) {
  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    if (!panoramaCreated) return
    event.preventDefault()
    onZoom(event.deltaY > 0 ? -0.1 : 0.1)
  }

  return (
    <section className="min-w-0">
      <div className="overflow-hidden rounded-xl border border-[#d8ded9] bg-white shadow-sm">

        {/*  header of canvas*/}
        <div className="flex items-center justify-between border-b border-[#e0e5e1] px-5 py-4">
          <div>

            <h2 className="text-base font-semibold">Panorama viewer</h2>
            <p className="mt-1 text-xs text-[#7a867f]">
              Drag to pan · Scroll to zoom · Rotate with the button </p>
          </div>

          <div className="flex gap-2">
            <Button
              variant="primary"
              fillStyle="outline"
              staticColor="black"
              onPress={() => onZoom(-0.1)}
              isDisabled={!panoramaCreated}>
              −  </Button>

            <Button
              variant="primary"
              fillStyle="outline"
              staticColor="black"
              onPress={() => onZoom(0.1)}
              isDisabled={!panoramaCreated}>
              +
            </Button>

            <Button
              variant="primary"
              fillStyle="outline"

              onPress={onRotate}
              staticColor="black"
              isDisabled={!panoramaCreated}>
              Rotate  </Button>

            <Button
              variant="primary"
              fillStyle="outline"
              staticColor="black"
              onPress={onResetTransform}
              isDisabled={!panoramaCreated}
            >
              Reset
            </Button>
          </div>
        </div>

        {/* footer of canvas*/}
        <div
          className="flex h-[min(68vh,620px)] min-h-[430px] items-center justify-center overflow-hidden bg-[#edf1ed]"
          style={{
            cursor: panoramaCreated ? 'grab' : 'default',
          }}
          onPointerDown={onStartPan}
          onPointerMove={onPan}
          onPointerUp={stopPanHandler}
          onPointerCancel={stopPanHandler}
          onWheel={handleWheel}
        >
          {hasImages && opencvReady ? (
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
                ref={canvasRef}
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
                Add at least two images and create a panorama to see the result
                here.
              </p>

              <p className="mt-3 text-xs text-[#929c96]">JPG · PNG · AVIF</p>
            </div>
          )}
        </div>

        {/* Viewer footer */}
        <div className="flex items-center justify-between border-t border-[#e0e5e1] bg-white px-5 py-4">
          <div className="text-sm text-[#68756d]">
            {panoramaCreated ? 'Panorama ready' : 'Waiting for panorama'}
          </div>

          <Button
            variant="primary"
            staticColor="black"
            onPress={onExport}
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
  )

  function stopPanHandler() {
    onStopPan()
  }
}
