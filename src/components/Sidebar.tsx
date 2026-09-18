import type { ChangeEvent } from 'react'
import { Button, Picker, PickerItem } from '@react-spectrum/s2'
import type { OutputFormat, ProjectionType, SelectedImage } from '../types'
import { ImageList } from './ImageList'

interface SidebarProps {
  images: SelectedImage[]
  opencvReady: boolean
  stitching: boolean
  stitchError: string
  projection: ProjectionType
  outputFormat: OutputFormat
  onAddImages: (event: ChangeEvent<HTMLInputElement>) => void
  onRemoveImage: (index: number) => void
  onProjectionChange: (projection: ProjectionType) => void
  onOutputFormatChange: (format: OutputFormat) => void
  onCreatePanorama: () => void
}

export function Sidebar({
  images,
  opencvReady,
  stitching,
  stitchError,
  projection,
  outputFormat,
  onAddImages,
  onRemoveImage,
  onProjectionChange,
  onOutputFormatChange,
  onCreatePanorama,
}: SidebarProps) {
  return (
    <aside className="h-fit rounded-xl border border-[#d8ded9] bg-white p-5 shadow-sm">
      <div className="mb-6">
        <h2 className="text-base font-semibold">Images</h2>
        <p className="mt-1 text-sm leading-5 text-[#68756d]">
          Add at least two images with overlapping areas.</p>
      </div>

      <div className="mb-5">
        <Button
          variant="primary"
          staticColor="black"
          onPress={() => document.getElementById('image-input')?.click()}>
          Add images </Button>

        <input
          id="image-input"
          type="file"
          accept=".jpg,.jpeg,.png,.avif"
          multiple
          className="hidden"
          onChange={onAddImages} />
      </div>

      <ImageList images={images} onRemoveImage={onRemoveImage} />

      {/* Selector area  */}
      <div className="mt-6 border-t border-[#e0e5e1] pt-5">
        <div className="space-y-4">
          <Picker
            label="Projection"
            key={projection}
            value={projection}
            onChange={(key) => {
              onProjectionChange(String(key) as ProjectionType)
            }}
          >
            <PickerItem id="cylindrical">Cylindrical</PickerItem>
            <PickerItem id="spherical">Spherical</PickerItem>
          </Picker>

          <Picker
            label="Output format"
            value={outputFormat}
            onChange={(key) => {
              if (key === 'png' || key === 'jpeg' || key === 'avif') {
                onOutputFormatChange(key)
              }
            }}
          >
            <PickerItem id="png">PNG</PickerItem>
            <PickerItem id="jpeg">JPEG</PickerItem>
            <PickerItem id="avif">AVIF</PickerItem>
          </Picker>
        </div>
      </div>

      {/* Create button */}
      <div className="mt-6 border-t border-[#e0e5e1] pt-5">
        <Button
          variant="primary"
          staticColor="black"
          onPress={onCreatePanorama}
          isDisabled={!opencvReady || images.length < 2 || stitching}
          isPending={stitching}
        >
          {stitching ? 'Creating...' : 'Create Panorama'}
        </Button>

        {stitchError && (
          <div className="mt-3 rounded-lg border border-[#e4caca] bg-[#fff7f7] px-3 py-2 text-sm text-[#9a4444]">
            {stitchError}
          </div>
        )}
      </div>
    </aside>
  )
}
