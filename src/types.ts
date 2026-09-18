
export type ProjectionType = 'cylindrical' | 'spherical'


export type SelectedImage = {
  file: File
  previewUrl: string
}

export type OpenCvApi = {
  imread: (image: HTMLImageElement) => { delete: () => void }
  imshow: (canvas: HTMLCanvasElement, image: { delete: () => void }) => void
}

export type ViewerTransform = {
  x: number
  y: number
  zoom: number
  rotation: number
}

export type OutputFormat = 'png' | 'jpeg' | 'avif'

export type ElectronApi = {
  saveAvif?: (pngBase64: string) => Promise<boolean>
}
