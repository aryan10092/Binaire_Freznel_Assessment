import type { ProjectionType } from '../types'

type CV = any

declare global {
  interface Window {
    cv?: CV
  }
}

export class PanoramaStitcher {
  private get cv(): CV {
    if (!window.cv) {
      throw new Error('OpenCV is not loaded')
    }

    return window.cv
  }

  async stitch(
    files: File[],
    canvas: HTMLCanvasElement,
    _projection: ProjectionType,
  ): Promise<void> {
    if (files.length < 2) {
      throw new Error('Please select at least two images.')
    }

    const images = await Promise.all(
      files.map((file) => this.loadImage(file)),
    )

    const mats: CV[] = []

    try {
      // Load images
      for (const image of images) {
  const tempCanvas = document.createElement('canvas')

  tempCanvas.width = image.naturalWidth
  tempCanvas.height = image.naturalHeight

  const ctx = tempCanvas.getContext('2d')

  if (!ctx) {
    throw new Error('Could not create canvas.')
  }

  ctx.drawImage(image, 0, 0)

  const mat = this.cv.imread(tempCanvas)

  if (mat.empty()) {
    mat.delete()
    throw new Error('Could not read image.')
  }

  mats.push(this.resizeImage(mat))
  mat.delete()
}

      // first image
      let panorama = mats[0].clone()

      // Add remaining images one by one
      for (let i = 1; i < mats.length; i++) {
        const next = this.stitchPair(
          panorama,
          mats[i],
        )

        panorama.delete()
        panorama = next
      }

      //  result
      const projected = this.applyProjection(
  panorama,
  _projection,
)   

try {
  this.cv.imshow(canvas, projected)
} finally {
  projected.delete()
  panorama.delete()
}
    } finally {
      mats.forEach((mat) => mat.delete())

     
    }
  }

  private applyProjection(
  src: CV,
  projection: ProjectionType,
): CV {
  if (projection === 'cylindrical') {
    return this.cylindricalProjection(src)
  }

  return this.sphericalProjection(src)
}

private cylindricalProjection(src: CV): CV {
  const cv = this.cv

  const width = src.cols
  const height = src.rows

  const result = new cv.Mat()

  const mapX = new cv.Mat(
    height,
    width,
    cv.CV_32FC1,
  )

  const mapY = new cv.Mat(
    height,
    width,
    cv.CV_32FC1,
  )

  const focal = width
  const centerX = width / 2
  const centerY = height / 2

  try {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const theta =
          (x - centerX) / focal

        const sourceX =
          Math.tan(theta) * focal + centerX

        const sourceY =
          (y - centerY) /
            Math.cos(theta) +
          centerY

        mapX.floatPtr(y, x)[0] = sourceX
        mapY.floatPtr(y, x)[0] = sourceY
      }
    }

    cv.remap(
      src,
      result,
      mapX,
      mapY,
      cv.INTER_LINEAR,
      cv.BORDER_CONSTANT,
    )

    return result
  } finally {
    mapX.delete()
    mapY.delete()
  }
}

private sphericalProjection(src: CV): CV {
  const cv = this.cv

  const width = src.cols
  const height = src.rows

  const result = new cv.Mat()

  const mapX = new cv.Mat(
    height,
    width,
    cv.CV_32FC1,
  )

  const mapY = new cv.Mat(
    height,
    width,
    cv.CV_32FC1,
  )

  const focal = width
  const centerX = width / 2
  const centerY = height / 2

  try {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const theta =
          (x - centerX) / focal

        const phi =
          (y - centerY) / focal

        const sourceX =
          Math.tan(theta) * focal +
          centerX

        const sourceY =
          Math.tan(phi) * focal +
          centerY

        mapX.floatPtr(y, x)[0] = sourceX
        mapY.floatPtr(y, x)[0] = sourceY
      }
    }

    cv.remap(
      src,
      result,
      mapX,
      mapY,
      cv.INTER_LINEAR,
      cv.BORDER_CONSTANT,
    )

    return result
  } finally {
    mapX.delete()
    mapY.delete()
  }
}

  
   // this keeps images at reasonable size
   
  private resizeImage(src: CV): CV {
    const maxHeight = 900

    if (src.rows <= maxHeight) {
      return src.clone()
    }

    const scale = maxHeight / src.rows

    const result = new this.cv.Mat()

    this.cv.resize(
      src,
      result,
      new this.cv.Size(
        Math.round(src.cols * scale),
        maxHeight,
      ),
      0,
      0,
      this.cv.INTER_AREA,
    )

    return result
  }

  // Stitch two images together
   
  private stitchPair(
    left: CV,
    right: CV,
  ): CV {
    const cv = this.cv

    const grayLeft = new cv.Mat()
    const grayRight = new cv.Mat()

    try {
      cv.cvtColor(
        left,
        grayLeft,
        cv.COLOR_RGBA2GRAY,
      )

      cv.cvtColor(
        right,
        grayRight,
        cv.COLOR_RGBA2GRAY,
      )

      // 1 Detect features
      const orb = new cv.ORB(1500)

      const leftKeypoints = new cv.KeyPointVector()
      const rightKeypoints = new cv.KeyPointVector()

      const leftDescriptors =new cv.Mat()
      const rightDescriptors =new cv.Mat()

      try {
        const mask = new cv.Mat()

        try {
          orb.detectAndCompute(grayLeft,mask,leftKeypoints, leftDescriptors,)

          orb.detectAndCompute(grayRight, mask, rightKeypoints, rightDescriptors,)
            
        } finally {
          mask.delete()
        }

        if (leftDescriptors.empty() ||rightDescriptors.empty() ) {
          throw new Error(
            'Could not find enough features in the images.',
          )
        }

        // 2 Match features
        const matcher = new cv.BFMatcher(cv.NORM_HAMMING,false,)

        const matches =new cv.DMatchVectorVector()

        try {
          matcher.knnMatch(
            rightDescriptors,
            leftDescriptors,
            matches,
            2,
          )

          const goodMatches: CV[] = []

          for (
            let i = 0;i < matches.size();i++) {
            const pair = matches.get(i)

            if (pair.size() < 2) {
              continue
            }

            const first = pair.get(0)
            const second = pair.get(1)

            // Keep only reliable matches
            if ( first.distance <0.75 * second.distance) {
              goodMatches.push(first)
            }
          }

          if (goodMatches.length < 8) {
            throw new Error(
              'Images could not be aligned. Try images with more overlap.',
            )
          }

          // 3 Create matching points
          const srcPoints = new cv.Mat(goodMatches.length,1, cv.CV_32FC2)

          const dstPoints = new cv.Mat(goodMatches.length,1, cv.CV_32FC2)

          try {
            for (let i = 0;i < goodMatches.length; i++) {
              const match = goodMatches[i]

              const rightPoint =rightKeypoints.get(match.queryIdx).pt
              const leftPoint = leftKeypoints.get(match.trainIdx).pt

              srcPoints.data32F[i * 2] =rightPoint.x
              srcPoints.data32F[i * 2 + 1] =rightPoint.y

              dstPoints.data32F[i * 2] = leftPoint.x
              dstPoints.data32F[i * 2 + 1] =leftPoint.y
            }

            // 4. Calculate homography
            const mask = new cv.Mat()

            const homography =
              cv.findHomography(
                srcPoints,
                dstPoints,
                cv.RANSAC,
                5,
                mask,
              )

            try {
              if (
                !homography ||
                homography.empty()
              ) {
                throw new Error(
                  'Images could not be aligned.',
                )
              }

              return this.combineImages(
                left,
                right,
                homography,
              )
            } finally {
              mask.delete()
              homography.delete()
            }
          } finally {
            srcPoints.delete()
            dstPoints.delete()
          }
        } finally {
          matches.delete()
          matcher.delete()
        }
      } finally {
        leftKeypoints.delete()
        rightKeypoints.delete()

        leftDescriptors.delete()
        rightDescriptors.delete()

        orb.delete()
      }
    } finally {
      grayLeft.delete()
      grayRight.delete()
    }
  }

 //Warp the second image and place it beside the first image.
  private combineImages(
    left: CV,
    right: CV,
    homography: CV,
  ): CV {
    const cv = this.cv

    const width =
      left.cols + right.cols

    const height =
      Math.max(left.rows, right.rows)

    const result =
      new cv.Mat.zeros(
        height,
        width,
        left.type(),
      )

    try {
      // Put first image on the canvas
      const roi = result.roi(
        new cv.Rect(
          0,
          0,
          left.cols,
          left.rows,
        ),
      )

      try {
        left.copyTo(roi)
      } finally {
        roi.delete()
      }

      // Warp second image
      const warped = new cv.Mat()

      try {
        cv.warpPerspective(
          right,
          warped,
          homography,
          new cv.Size(
            width,
            height,
          ),
        )

        // Copy non-black pixels
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const pixel =
              warped.ucharPtr(y, x)

            if (
              pixel[0] !== 0 ||
              pixel[1] !== 0 ||
              pixel[2] !== 0
            ) {
              const output =
                result.ucharPtr(y, x)

              output[0] = pixel[0]
              output[1] = pixel[1]
              output[2] = pixel[2]

              if (result.channels() === 4) {
                output[3] = 255
              }
            }
          }
        }
      } finally {
        warped.delete()
      }

      return result
    } catch (error) {
      result.delete()
      throw error
    }
  }

  // Converts File into an HTML image.
private loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const url = URL.createObjectURL(file)

    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }

    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(`Failed to load ${file.name}`))
    }

    image.src = url
  })
}
}


