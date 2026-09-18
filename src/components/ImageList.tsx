import type { SelectedImage } from '../types'

interface ImageListProps {
  images: SelectedImage[]
  onRemoveImage: (index: number) => void
}

export function ImageList({ images, onRemoveImage }: ImageListProps) {
  if (images.length === 0) {
    return null
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Selected images</span>
        <span className="text-xs text-[#7a867f]">
          {images.length} image{images.length !== 1 ? 's' : ''}
      </span>
      </div>

      <div className="max-h-[300px] space-y-2 overflow-y-auto pr-1 scrollbar-thin 
      scrollbar-track-transparent scrollbar-thumb-[#c7d0ca]">
        {images.map((image, index) => (
          <div
            key={`${image.file.name}-${index}`}
            className="flex items-center gap-3 rounded-lg border border-[#e0e5e1] bg-[#f8faf8] p-2">
            <img
              src={image.previewUrl} alt={image.file.name}
              className="h-12 w-16 rounded-md border border-[#d8ded9] object-cover" />

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{image.file.name}</p>
              <p className="text-xs text-[#7a867f]">Image {index + 1}</p>
            </div>

            <button
              type="button" 
              onClick={() => onRemoveImage(index)}
              className="rounded-md px-2 py-1 text-xs text-[#68756d] transition hover:bg-[#e9eeea] hover:text-[#26332b]">
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
