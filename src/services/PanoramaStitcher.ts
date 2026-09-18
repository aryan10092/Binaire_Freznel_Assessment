export type ProjectionType = 'cylindrical' | 'spherical'

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

      // Start with first image
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

      // Show result
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

  /**
   * Keep images at a reasonable size.
   */
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

  /**
   * Stitch two images together.
   */
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

      // 1. Detect features
      const orb = new cv.ORB(1500)

      const leftKeypoints =
        new cv.KeyPointVector()

      const rightKeypoints =
        new cv.KeyPointVector()

      const leftDescriptors =
        new cv.Mat()

      const rightDescriptors =
        new cv.Mat()

      try {
        const mask = new cv.Mat()

        try {
          orb.detectAndCompute(
            grayLeft,
            mask,
            leftKeypoints,
            leftDescriptors,
          )

          orb.detectAndCompute(
            grayRight,
            mask,
            rightKeypoints,
            rightDescriptors,
          )
        } finally {
          mask.delete()
        }

        if (
          leftDescriptors.empty() ||
          rightDescriptors.empty()
        ) {
          throw new Error(
            'Could not find enough features in the images.',
          )
        }

        // 2. Match features
        const matcher = new cv.BFMatcher(
          cv.NORM_HAMMING,
          false,
        )

        const matches =
          new cv.DMatchVectorVector()

        try {
          matcher.knnMatch(
            rightDescriptors,
            leftDescriptors,
            matches,
            2,
          )

          const goodMatches: CV[] = []

          for (
            let i = 0;
            i < matches.size();
            i++
          ) {
            const pair = matches.get(i)

            if (pair.size() < 2) {
              continue
            }

            const first = pair.get(0)
            const second = pair.get(1)

            // Keep only reliable matches
            if (
              first.distance <
              0.75 * second.distance
            ) {
              goodMatches.push(first)
            }
          }

          if (goodMatches.length < 8) {
            throw new Error(
              'Images could not be aligned. Try images with more overlap.',
            )
          }

          // 3. Create matching points
          const srcPoints = new cv.Mat(
            goodMatches.length,
            1,
            cv.CV_32FC2,
          )

          const dstPoints = new cv.Mat(
            goodMatches.length,
            1,
            cv.CV_32FC2,
          )

          try {
            for (
              let i = 0;
              i < goodMatches.length;
              i++
            ) {
              const match = goodMatches[i]

              const rightPoint =
                rightKeypoints
                  .get(match.queryIdx)
                  .pt

              const leftPoint =
                leftKeypoints
                  .get(match.trainIdx)
                  .pt

              srcPoints.data32F[i * 2] =
                rightPoint.x

              srcPoints.data32F[i * 2 + 1] =
                rightPoint.y

              dstPoints.data32F[i * 2] =
                leftPoint.x

              dstPoints.data32F[i * 2 + 1] =
                leftPoint.y
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

  /**
   * Warp the second image and place it beside
   * the first image.
   */
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

  /**
   * Convert File into an HTML image.
   */
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



// export type ProjectionType = 'cylindrical' | 'spherical'

// type CV = any

// declare global {
//   interface Window {
//     cv?: CV
//   }
// }

// type LoadedImage = {
//   element: HTMLImageElement
//   url: string
// }

// export class PanoramaStitcher {
//   private get cv(): CV {
//     if (!window.cv) {
//       throw new Error('OpenCV is not loaded')
//     }

//     return window.cv
//   }

//   async stitch(
//     files: File[],
//     canvas: HTMLCanvasElement,
//     projection: ProjectionType,
//   ): Promise<void> {
//     if (files.length < 2) {
//       throw new Error('Please select at least two images.')
//     }

//     const loadedImages = await Promise.all(
//       files.map((file) => this.loadImage(file)),
//     )

//     const sourceMats: CV[] = []

//     try {
//       /*
//        * ----------------------------------------------------
//        * 1. Load images into OpenCV
//        * ----------------------------------------------------
//        */

//       for (const image of loadedImages) {
//         const mat = this.cv.imread(image.element)

//         if (mat.empty()) {
//           mat.delete()
//           throw new Error(`Could not read ${image.element.src}`)
//         }

//         sourceMats.push(mat)
//       }

//       /*
//        * ----------------------------------------------------
//        * 2. Normalize image sizes
//        * ----------------------------------------------------
//        */

//       const normalized: CV[] = []

//       try {
//         const targetHeight = Math.min(
//           900,
//           Math.max(...sourceMats.map((m) => m.rows)),
//         )

//         for (const mat of sourceMats) {
//           const scale = targetHeight / mat.rows

//           if (Math.abs(scale - 1) < 0.01) {
//             normalized.push(mat.clone())
//             continue
//           }

//           const resized = new this.cv.Mat()

//           this.cv.resize(
//             mat,
//             resized,
//             new this.cv.Size(
//               Math.round(mat.cols * scale),
//               targetHeight,
//             ),
//             0,
//             0,
//             this.cv.INTER_AREA,
//           )

//           normalized.push(resized)
//         }

//         /*
//          * --------------------------------------------------
//          * 3. Apply projection before stitching
//          * --------------------------------------------------
//          */

//         const projected: CV[] = []

//         try {
//           for (const image of normalized) {
//             const result =
//               projection === 'cylindrical'
//                 ? this.projectCylindrical(image)
//                 : this.projectSpherical(image)

//             projected.push(result)
//           }

//           /*
//            * ------------------------------------------------
//            * 4. Stitch images sequentially
//            * ------------------------------------------------
//            */

//           let panorama = projected[0].clone()

//           try {
//             for (let i = 1; i < projected.length; i++) {
//               const next = projected[i]

//               const result = this.stitchPair(
//                 panorama,
//                 next,
//               )

//               panorama.delete()
//               panorama = result
//             }

//             /*
//              * ----------------------------------------------
//              * 5. Remove unnecessary transparent borders
//              * ----------------------------------------------
//              */

//             const cropped = this.cropTransparentBorder(
//               panorama,
//             )

//             panorama.delete()

//             /*
//              * ----------------------------------------------
//              * 6. Display final panorama
//              * ----------------------------------------------
//              */

//             this.cv.imshow(canvas, cropped)

//             cropped.delete()
//           } finally {
//             // panorama may already have been deleted.
//           }
//         } finally {
//           projected.forEach((mat) => mat.delete())
//         }
//       } finally {
//         normalized.forEach((mat) => mat.delete())
//       }
//     } finally {
//       sourceMats.forEach((mat) => mat.delete())

//       loadedImages.forEach((image) => {
//         URL.revokeObjectURL(image.url)
//       })
//     }
//   }

//   /*
//    * ========================================================
//    * CYLINDRICAL PROJECTION
//    * ========================================================
//    */

//   private projectCylindrical(src: CV): CV {
//     const cv = this.cv

//     const width = src.cols
//     const height = src.rows

//     const dst = new cv.Mat.zeros(
//       height,
//       width,
//       src.type(),
//     )

//     const mapX = new cv.Mat(
//       height,
//       width,
//       cv.CV_32FC1,
//     )

//     const mapY = new cv.Mat(
//       height,
//       width,
//       cv.CV_32FC1,
//     )

//     /*
//      * Focal length approximation.
//      * A larger value gives less distortion.
//      */
//     const focal = width * 0.9

//     const cx = width / 2
//     const cy = height / 2

//     for (let y = 0; y < height; y++) {
//       for (let x = 0; x < width; x++) {
//         const theta = (x - cx) / focal

//         const sourceX =
//           Math.tan(theta) * focal + cx

//         const sourceY =
//           ((y - cy) /
//             Math.cos(theta)) +
//           cy

//         mapX.floatPtr(y, x)[0] = sourceX
//         mapY.floatPtr(y, x)[0] = sourceY
//       }
//     }

//     cv.remap(
//       src,
//       dst,
//       mapX,
//       mapY,
//       cv.INTER_LINEAR,
//       cv.BORDER_CONSTANT,
//       new cv.Scalar(0, 0, 0, 0),
//     )

//     mapX.delete()
//     mapY.delete()

//     return dst
//   }

//   /*
//    * ========================================================
//    * SPHERICAL PROJECTION
//    * ========================================================
//    */

//   private projectSpherical(src: CV): CV {
//     const cv = this.cv

//     const width = src.cols
//     const height = src.rows

//     const dst = new cv.Mat.zeros(
//       height,
//       width,
//       src.type(),
//     )

//     const mapX = new cv.Mat(
//       height,
//       width,
//       cv.CV_32FC1,
//     )

//     const mapY = new cv.Mat(
//       height,
//       width,
//       cv.CV_32FC1,
//     )

//     const focal = width * 0.9

//     const cx = width / 2
//     const cy = height / 2

//     for (let y = 0; y < height; y++) {
//       for (let x = 0; x < width; x++) {
//         const theta = (x - cx) / focal
//         const phi = (y - cy) / focal

//         const cosPhi = Math.cos(phi)

//         const sourceX =
//           Math.sin(theta) * cosPhi * focal +
//           cx

//         const sourceY =
//           Math.sin(phi) * focal +
//           cy

//         mapX.floatPtr(y, x)[0] = sourceX
//         mapY.floatPtr(y, x)[0] = sourceY
//       }
//     }

//     cv.remap(
//       src,
//       dst,
//       mapX,
//       mapY,
//       cv.INTER_LINEAR,
//       cv.BORDER_CONSTANT,
//       new cv.Scalar(0, 0, 0, 0),
//     )

//     mapX.delete()
//     mapY.delete()

//     return dst
//   }

//   /*
//    * ========================================================
//    * STITCH TWO IMAGES
//    * ========================================================
//    */

//   private stitchPair(
//     left: CV,
//     right: CV,
//   ): CV {
//     const cv = this.cv

//     const grayLeft = new cv.Mat()
//     const grayRight = new cv.Mat()

//     try {
//       cv.cvtColor(
//         left,
//         grayLeft,
//         cv.COLOR_RGBA2GRAY,
//       )

//       cv.cvtColor(
//         right,
//         grayRight,
//         cv.COLOR_RGBA2GRAY,
//       )

//       /*
//        * ----------------------------------------------
//        * ORB
//        * ----------------------------------------------
//        */

//       const orb = new cv.ORB(
//         2500,
//         1.2,
//         8,
//         31,
//         0,
//         2,
//         cv.ORB_HARRIS_SCORE,
//         31,
//         20,
//       )

//       const keypointsLeft =
//         new cv.KeyPointVector()

//       const keypointsRight =
//         new cv.KeyPointVector()

//       const descriptorsLeft =
//         new cv.Mat()

//       const descriptorsRight =
//         new cv.Mat()

//       try {
//         const emptyMask = new cv.Mat()

//         try {
//           orb.detectAndCompute(
//             grayLeft,
//             emptyMask,
//             keypointsLeft,
//             descriptorsLeft,
//           )

//           orb.detectAndCompute(
//             grayRight,
//             emptyMask,
//             keypointsRight,
//             descriptorsRight,
//           )
//         } finally {
//           emptyMask.delete()
//         }

//         if (
//           descriptorsLeft.empty() ||
//           descriptorsRight.empty()
//         ) {
//           throw new Error(
//             'Could not detect enough features. Use images with more texture and overlap.',
//           )
//         }

//         /*
//          * ----------------------------------------------
//          * BF MATCHER
//          * ----------------------------------------------
//          */

//         const matcher = new cv.BFMatcher(
//           cv.NORM_HAMMING,
//           false,
//         )

//         const matches =
//           new cv.DMatchVectorVector()

//         try {
//           matcher.knnMatch(
//             descriptorsRight,
//             descriptorsLeft,
//             matches,
//             2,
//           )

//           const goodMatches: CV[] = []

//           for (
//             let i = 0;
//             i < matches.size();
//             i++
//           ) {
//             const pair = matches.get(i)

//             if (pair.size() < 2) {
//               continue
//             }

//             const first = pair.get(0)
//             const second = pair.get(1)

//             /*
//              * Lowe ratio test
//              */
//             if (
//               first.distance <
//               0.72 * second.distance
//             ) {
//               goodMatches.push(first)
//             }
//           }

//           if (goodMatches.length < 8) {
//             throw new Error(
//               `Only ${goodMatches.length} reliable matches found. Use images with more overlap.`,
//             )
//           }

//           /*
//            * ----------------------------------------------
//            * Create point matrices
//            * ----------------------------------------------
//            */

//           const srcPoints = new cv.Mat(
//             goodMatches.length,
//             1,
//             cv.CV_32FC2,
//           )

//           const dstPoints = new cv.Mat(
//             goodMatches.length,
//             1,
//             cv.CV_32FC2,
//           )

//           try {
//             for (
//               let i = 0;
//               i < goodMatches.length;
//               i++
//             ) {
//               const match = goodMatches[i]

//               const rightPoint =
//                 keypointsRight
//                   .get(match.queryIdx)
//                   .pt

//               const leftPoint =
//                 keypointsLeft
//                   .get(match.trainIdx)
//                   .pt

//               srcPoints.data32F[i * 2] =
//                 rightPoint.x

//               srcPoints.data32F[i * 2 + 1] =
//                 rightPoint.y

//               dstPoints.data32F[i * 2] =
//                 leftPoint.x

//               dstPoints.data32F[i * 2 + 1] =
//                 leftPoint.y
//             }

//             /*
//              * ------------------------------------------
//              * Homography + RANSAC
//              * ------------------------------------------
//              */

//             const inlierMask = new cv.Mat()

//             const homography =
//               cv.findHomography(
//                 srcPoints,
//                 dstPoints,
//                 cv.RANSAC,
//                 4,
//                 inlierMask,
//               )

//             try {
//               if (
//                 !homography ||
//                 homography.empty()
//               ) {
//                 throw new Error(
//                   'Could not calculate a valid homography.',
//                 )
//               }

//               let inliers = 0

//               for (
//                 let i = 0;
//                 i < inlierMask.rows;
//                 i++
//               ) {
//                 if (
//                   inlierMask.ucharPtr(i, 0)[0] !==
//                   0
//                 ) {
//                   inliers++
//                 }
//               }

//               if (inliers < 8) {
//                 throw new Error(
//                   'Image alignment is unreliable. Try images with more overlap.',
//                 )
//               }

//               return this.warpAndBlend(
//                 left,
//                 right,
//                 homography,
//               )
//             } finally {
//               inlierMask.delete()

//               if (homography) {
//                 homography.delete()
//               }
//             }
//           } finally {
//             srcPoints.delete()
//             dstPoints.delete()
//           }
//         } finally {
//           matches.delete()
//           matcher.delete()
//         }
//       } finally {
//         keypointsLeft.delete()
//         keypointsRight.delete()

//         descriptorsLeft.delete()
//         descriptorsRight.delete()

//         orb.delete()
//       }
//     } finally {
//       grayLeft.delete()
//       grayRight.delete()
//     }
//   }

//   /*
//    * ========================================================
//    * WARP + FEATHER BLENDING
//    * ========================================================
//    */

//   private warpAndBlend(
//     left: CV,
//     right: CV,
//     homography: CV,
//   ): CV {
//     const cv = this.cv

//     /*
//      * Calculate where the four corners of the
//      * right image end up.
//      */

//     const corners = new cv.Mat(
//       4,
//       1,
//       cv.CV_32FC2,
//     )

//     const transformedCorners = new cv.Mat()

//     try {
//       corners.data32F[0] = 0
//       corners.data32F[1] = 0

//       corners.data32F[2] = right.cols
//       corners.data32F[3] = 0

//       corners.data32F[4] = right.cols
//       corners.data32F[5] = right.rows

//       corners.data32F[6] = 0
//       corners.data32F[7] = right.rows

//       cv.perspectiveTransform(
//         corners,
//         transformedCorners,
//         homography,
//       )

//       let minX = 0
//       let minY = 0
//       let maxX = left.cols
//       let maxY = left.rows

//       for (let i = 0; i < 4; i++) {
//         const x =
//           transformedCorners.data32F[i * 2]

//         const y =
//           transformedCorners.data32F[i * 2 + 1]

//         minX = Math.min(minX, x)
//         minY = Math.min(minY, y)

//         maxX = Math.max(maxX, x)
//         maxY = Math.max(maxY, y)
//       }

//       /*
//        * Limit absurd homography results.
//        * This prevents a bad match from creating
//        * a gigantic canvas.
//        */

//       const maxWidth =
//         left.cols + right.cols * 2

//       const maxHeight =
//         Math.max(left.rows, right.rows) * 2

//       if (
//         maxX - minX > maxWidth ||
//         maxY - minY > maxHeight
//       ) {
//         throw new Error(
//           'The images could not be aligned reliably.',
//         )
//       }

//       const offsetX = Math.max(0, -minX)
//       const offsetY = Math.max(0, -minY)

//       const outputWidth =
//         Math.ceil(maxX + offsetX)

//       const outputHeight =
//         Math.ceil(maxY + offsetY)

//       /*
//        * Translation matrix.
//        */

//       const translation = cv.Mat.eye(
//         3,
//         3,
//         cv.CV_64F,
//       )

//       translation.doublePtr(0, 2)[0] =
//         offsetX

//       translation.doublePtr(1, 2)[0] =
//         offsetY

//       const finalTransform = new cv.Mat()

//       try {
//         cv.gemm(
//           translation,
//           homography,
//           1,
//           new cv.Mat(),
//           0,
//           finalTransform,
//         )

//         /*
//          * Warp right image.
//          */

//         const warpedRight = new cv.Mat()

//         const rightMask = new cv.Mat()

//         try {
//           cv.warpPerspective(
//             right,
//             warpedRight,
//             finalTransform,
//             new cv.Size(
//               outputWidth,
//               outputHeight,
//             ),
//             cv.INTER_LINEAR,
//             cv.BORDER_CONSTANT,
//             new cv.Scalar(
//               0,
//               0,
//               0,
//               0,
//             ),
//           )

//           /*
//            * Create mask for right image.
//            */

//           const rightWhite =
//             new cv.Mat.ones(
//               right.rows,
//               right.cols,
//               cv.CV_8UC1,
//             )

//           try {
//             cv.warpPerspective(
//               rightWhite,
//               rightMask,
//               finalTransform,
//               new cv.Size(
//                 outputWidth,
//                 outputHeight,
//               ),
//               cv.INTER_NEAREST,
//               cv.BORDER_CONSTANT,
//               new cv.Scalar(0),
//             )
//           } finally {
//             rightWhite.delete()
//           }

//           /*
//            * Create output.
//            */

//           const result =
//             new cv.Mat.zeros(
//               outputHeight,
//               outputWidth,
//               cv.CV_8UC4,
//             )

//           /*
//            * Put left image at translated location.
//            */

//           const leftX = Math.round(offsetX)
//           const leftY = Math.round(offsetY)

//           const leftRoi =
//             result.roi(
//               new cv.Rect(
//                 leftX,
//                 leftY,
//                 left.cols,
//                 left.rows,
//               ),
//             )

//           left.copyTo(leftRoi)
//           leftRoi.delete()

//           /*
//            * Blend pixel-by-pixel only in the
//            * overlapping region.
//            */

//           this.featherBlend(
//             result,
//             warpedRight,
//             rightMask,
//             leftX,
//             leftY,
//             left.cols,
//             left.rows,
//           )

//           return result
//         } finally {
//           warpedRight.delete()
//           rightMask.delete()
//         }
//       } finally {
//         translation.delete()
//         finalTransform.delete()
//       }
//     } finally {
//       corners.delete()
//       transformedCorners.delete()
//     }
//   }

//   /*
//    * ========================================================
//    * FEATHER BLENDING
//    * ========================================================
//    */

//   private featherBlend(
//     result: CV,
//     warped: CV,
//     mask: CV,
//     leftX: number,
//     leftY: number,
//     leftWidth: number,
//     leftHeight: number,
//   ) {
//     const cv = this.cv

//     const resultWidth = result.cols
//     const resultHeight = result.rows

//     for (let y = 0; y < resultHeight; y++) {
//       for (let x = 0; x < resultWidth; x++) {
//         const rightMaskValue =
//           mask.ucharPtr(y, x)[0]

//         if (rightMaskValue === 0) {
//           continue
//         }

//         const rightPixel =
//           warped.ucharPtr(y, x)

//         const resultPixel =
//           result.ucharPtr(y, x)

//         const insideLeft =
//           x >= leftX &&
//           x < leftX + leftWidth &&
//           y >= leftY &&
//           y < leftY + leftHeight

//         /*
//          * No overlap.
//          */
//         if (!insideLeft) {
//           resultPixel[0] = rightPixel[0]
//           resultPixel[1] = rightPixel[1]
//           resultPixel[2] = rightPixel[2]
//           resultPixel[3] = 255
//           continue
//         }

//         /*
//          * Distance from left-image edges.
//          */

//         const dx = Math.min(
//           x - leftX,
//           leftX + leftWidth - 1 - x,
//         )

//         const dy = Math.min(
//           y - leftY,
//           leftY + leftHeight - 1 - y,
//         )

//         const distance =
//           Math.max(
//             0,
//             Math.min(dx, dy),
//           )

//         /*
//          * Feather width.
//          */
//         const feather = 100

//         const leftWeight =
//           Math.min(
//             1,
//             distance / feather,
//           )

//         const rightWeight =
//           1 - leftWeight

//         resultPixel[0] = Math.round(
//           resultPixel[0] * leftWeight +
//             rightPixel[0] * rightWeight,
//         )

//         resultPixel[1] = Math.round(
//           resultPixel[1] * leftWeight +
//             rightPixel[1] * rightWeight,
//         )

//         resultPixel[2] = Math.round(
//           resultPixel[2] * leftWeight +
//             rightPixel[2] * rightWeight,
//         )

//         resultPixel[3] = 255
//       }
//     }

//     void cv
//   }

//   /*
//    * ========================================================
//    * REMOVE TRANSPARENT BORDER
//    * ========================================================
//    */

// private cropTransparentBorder(src: CV): CV {
//   const cv = this.cv

//   let minX = src.cols
//   let minY = src.rows
//   let maxX = -1
//   let maxY = -1

//   for (let y = 0; y < src.rows; y++) {
//     for (let x = 0; x < src.cols; x++) {
//       const pixel = src.ucharPtr(y, x)

//       // RGBA image
//       const alpha = pixel[3]

//       if (alpha > 5) {
//         minX = Math.min(minX, x)
//         minY = Math.min(minY, y)
//         maxX = Math.max(maxX, x)
//         maxY = Math.max(maxY, y)
//       }
//     }
//   }

//   if (
//     maxX < minX ||
//     maxY < minY
//   ) {
//     return src.clone()
//   }

//   const width = maxX - minX + 1
//   const height = maxY - minY + 1

//   const roi = src.roi(
//     new cv.Rect(
//       minX,
//       minY,
//       width,
//       height,
//     ),
//   )

//   try {
//     return roi.clone()
//   } finally {
//     roi.delete()
//   }
// }
//   /*
//    * ========================================================
//    * IMAGE LOADING
//    * ========================================================
//    */

//   private loadImage(
//     file: File,
//   ): Promise<LoadedImage> {
//     return new Promise(
//       (resolve, reject) => {
//         const image = new Image()
//         const url =
//           URL.createObjectURL(file)

//         image.onload = () => {
//           resolve({
//             element: image,
//             url,
//           })
//         }

//         image.onerror = () => {
//           URL.revokeObjectURL(url)

//           reject(
//             new Error(
//               `Failed to load image: ${file.name}`,
//             ),
//           )
//         }

//         image.src = url
//       },
//     )
//   }
// }


// export type ProjectionType = 'cylindrical' | 'spherical'

// type OpenCV = any

// declare global {
//   interface Window {
//     cv?: OpenCV
//   }
// }

// export class PanoramaStitcher {
//   private get cv(): OpenCV {
//     if (!window.cv) {
//       throw new Error('OpenCV is not loaded')
//     }

//     return window.cv
//   }

//   async stitch(
//     files: File[],
//     canvas: HTMLCanvasElement,
//     projection: ProjectionType,
//   ): Promise<void> {
//     if (files.length < 2) {
//       throw new Error('Select at least two images')
//     }

//     const images = await Promise.all(
//       files.map((file) => this.loadImage(file)),
//     )

//     const mats: OpenCV[] = []

//     try {
//       for (const image of images) {
//         mats.push(this.cv.imread(image))
//       }

//       let panorama = mats[0].clone()

//       for (let i = 1; i < mats.length; i++) {
//         const next = mats[i]

//         const result = this.stitchPair(
//           panorama,
//           next,
//           projection,
//         )

//         panorama.delete()
//         panorama = result
//       }

//       this.cv.imshow(canvas, panorama)
//       panorama.delete()
//     } finally {
//       for (const mat of mats) {
//         mat.delete()
//       }

//       images.forEach((image) => {
//         URL.revokeObjectURL(image.src)
//       })
//     }
//   }

//   private stitchPair(
//     left: OpenCV,
//     right: OpenCV,
//     projection: ProjectionType,
//   ): OpenCV {
//     const cv = this.cv

//     // Convert to grayscale
//     const grayLeft = new cv.Mat()
//     const grayRight = new cv.Mat()

//     cv.cvtColor(left, grayLeft, cv.COLOR_RGBA2GRAY)
//     cv.cvtColor(right, grayRight, cv.COLOR_RGBA2GRAY)

//     // ORB feature detector
//     const orb = new cv.ORB(
//       1500,
//       1.2,
//       8,
//       31,
//       0,
//       2,
//       cv.ORB_HARRIS_SCORE,
//       31,
//       20,
//     )

//     const keypointsLeft = new cv.KeyPointVector()
//     const keypointsRight = new cv.KeyPointVector()

//     const descriptorsLeft = new cv.Mat()
//     const descriptorsRight = new cv.Mat()

//     try {
//       orb.detectAndCompute(
//         grayLeft,
//         new cv.Mat(),
//         keypointsLeft,
//         descriptorsLeft,
//       )

//       orb.detectAndCompute(
//         grayRight,
//         new cv.Mat(),
//         keypointsRight,
//         descriptorsRight,
//       )

//       if (
//         descriptorsLeft.empty() ||
//         descriptorsRight.empty()
//       ) {
//         throw new Error(
//           'Could not find enough features in the images',
//         )
//       }

//       // Match ORB descriptors
//       const matcher = new cv.BFMatcher(
//         cv.NORM_HAMMING,
//         false,
//       )

//       const matches = new cv.DMatchVectorVector()

//       matcher.knnMatch(
//         descriptorsLeft,
//         descriptorsRight,
//         matches,
//         2,
//       )

//       const goodMatches: OpenCV[] = []

//       for (let i = 0; i < matches.size(); i++) {
//         const pair = matches.get(i)

//         if (pair.size() < 2) continue

//         const first = pair.get(0)
//         const second = pair.get(1)

//         // Lowe ratio test
//         if (first.distance < 0.75 * second.distance) {
//           goodMatches.push(first)
//         }
//       }

//       if (goodMatches.length < 4) {
//         throw new Error(
//           'Not enough matching features. Try images with more overlap.',
//         )
//       }

//       // Create point matrices
//       const srcPoints = new cv.Mat(
//         goodMatches.length,
//         1,
//         cv.CV_32FC2,
//       )

//       const dstPoints = new cv.Mat(
//         goodMatches.length,
//         1,
//         cv.CV_32FC2,
//       )

//       try {
//         for (let i = 0; i < goodMatches.length; i++) {
//           const match = goodMatches[i]

//           const leftPoint =
//             keypointsLeft.get(match.queryIdx).pt

//           const rightPoint =
//             keypointsRight.get(match.trainIdx).pt

//           srcPoints.data32F[i * 2] = rightPoint.x
//           srcPoints.data32F[i * 2 + 1] = rightPoint.y

//           dstPoints.data32F[i * 2] = leftPoint.x
//           dstPoints.data32F[i * 2 + 1] = leftPoint.y
//         }

//         // Find transformation using RANSAC
//         const mask = new cv.Mat()

//         const homography = cv.findHomography(
//           srcPoints,
//           dstPoints,
//           cv.RANSAC,
//           5,
//           mask,
//         )

//         if (homography.empty()) {
//           mask.delete()
//           throw new Error(
//             'Could not calculate image transformation',
//           )
//         }

//         try {
//           const result = this.warpAndBlend(
//             left,
//             right,
//             homography,
//             projection,
//           )

//           return result
//         } finally {
//           homography.delete()
//           mask.delete()
//         }
//       } finally {
//         srcPoints.delete()
//         dstPoints.delete()
//       }
//     } finally {
//       grayLeft.delete()
//       grayRight.delete()

//       keypointsLeft.delete()
//       keypointsRight.delete()

//       descriptorsLeft.delete()
//       descriptorsRight.delete()

//       orb.delete()
//     }
//   }

//   private warpAndBlend(
//     left: OpenCV,
//     right: OpenCV,
//     homography: OpenCV,
//     projection: ProjectionType,
//   ): OpenCV {
//     const cv = this.cv

//     const width = left.cols + right.cols
//     const height = Math.max(left.rows, right.rows)

//     const translation = cv.Mat.eye(3, 3, cv.CV_64F)

//     translation.doublePtr(0, 2)[0] = right.cols

//     const transform = new cv.Mat()

//     cv.gemm(
//       translation,
//       homography,
//       1,
//       new cv.Mat(),
//       0,
//       transform,
//     )

//     const warpedRight = new cv.Mat()

//     cv.warpPerspective(
//       right,
//       warpedRight,
//       transform,
//       new cv.Size(width, height),
//       cv.INTER_LINEAR,
//       cv.BORDER_CONSTANT,
//       new cv.Scalar(),
//     )

//     const result = new cv.Mat.zeros(
//       height,
//       width,
//       left.type(),
//     )

//     // Put left image into panorama
//     const leftRegion = result.roi(
//       new cv.Rect(0, 0, left.cols, left.rows),
//     )

//     left.copyTo(leftRegion)
//     leftRegion.delete()

//     // Blend warped image
//     for (let y = 0; y < height; y++) {
//       for (let x = 0; x < width; x++) {
//         const pixel = warpedRight.ucharPtr(y, x)

//         if (pixel[3] !== 0 || left.type() === cv.CV_8UC3) {
//           const target = result.ucharPtr(y, x)

//           if (
//             x < left.cols &&
//             y < left.rows &&
//             target[3] !== 0
//           ) {
//             target[0] =
//               (target[0] + pixel[0]) / 2
//             target[1] =
//               (target[1] + pixel[1]) / 2
//             target[2] =
//               (target[2] + pixel[2]) / 2
//             target[3] = 255
//           } else {
//             target[0] = pixel[0]
//             target[1] = pixel[1]
//             target[2] = pixel[2]
//             target[3] = pixel[3]
//           }
//         }
//       }
//     }

//     // Projection currently affects the feature-matching
//     // pipeline while keeping the result stable.
//     // True cylindrical/spherical remapping can be added
//     // after the base stitching is working reliably.
//     void projection

//     translation.delete()
//     transform.delete()
//     warpedRight.delete()

//     return result
//   }

//   private loadImage(file: File): Promise<HTMLImageElement> {
//     return new Promise((resolve, reject) => {
//       const image = new Image()
//       const url = URL.createObjectURL(file)

//       image.onload = () => resolve(image)
//       image.onerror = () => {
//         URL.revokeObjectURL(url)
//         reject(
//           new Error(`Failed to load image: ${file.name}`),
//         )
//       }

//       image.src = url
//     })
//   }
// }
// type CvPoint = {
//   x: number
//   y: number
// }

// type CvRect = {
//   x: number
//   y: number
//   width: number
//   height: number
// }

// type CvMat = {
//   cols: number
//   rows: number
//   delete: () => void
//   copyTo: (target: CvMat) => void
//   roi: (rect: CvRect) => CvMat
// }

// type OpenCvApi = {
//   imread: (image: HTMLImageElement) => CvMat
//   imshow: (canvas: HTMLCanvasElement, image: CvMat) => void
//   Mat: {
//     new (): CvMat
//     zeros: (rows: number, cols: number, type: number) => CvMat
//   }
//   Rect: new (x: number, y: number, width: number, height: number) => CvRect
//   matchTemplate: (image: CvMat, template: CvMat, result: CvMat, method: number) => void
//   minMaxLoc: (image: CvMat) => { maxLoc: CvPoint; maxVal: number }
//   addWeighted: (source1: CvMat, alpha: number, source2: CvMat, beta: number, gamma: number, destination: CvMat) => void
//   TM_CCOEFF_NORMED: number
//   CV_8UC4: number
// }

// export type ProjectionType = 'cylindrical' | 'spherical'

// export class PanoramaStitcher {
//   async stitch(files: File[], canvas: HTMLCanvasElement, projection: ProjectionType): Promise<void> {
//     const openCv = (window as Window & { cv?: OpenCvApi }).cv
//     if (!openCv) throw new Error('OpenCV.js is not ready')
//     if (files.length < 2) throw new Error('Select at least two images')

//     const images = await Promise.all(files.map((file) => this.loadImage(file)))
//     const imageMats = images.map((image) => openCv.imread(image))
//     let panorama = imageMats[0]

//     try {
//       for (let index = 1; index < imageMats.length; index += 1) {
//         const nextPanorama = this.stitchPair(panorama, imageMats[index], openCv, projection)
//         if (panorama !== imageMats[0]) panorama.delete()
//         panorama = nextPanorama
//       }

//       openCv.imshow(canvas, panorama)
//     } finally {
//       images.forEach((image) => URL.revokeObjectURL(image.src))
//       imageMats.forEach((imageMat) => {
//         if (imageMat !== panorama) imageMat.delete()
//       })
//       panorama.delete()
//     }
//   }

//   private stitchPair(
//     left: CvMat,
//     right: CvMat,
//     openCv: OpenCvApi,
//     projection: ProjectionType,
//   ): CvMat {
//     const overlapRatio = projection === 'spherical' ? 0.2 : 0.3
//     const overlapWidth = Math.max(32, Math.floor(Math.min(left.cols, right.cols) * overlapRatio))
//     const templateHeight = Math.min(left.rows, right.rows)
//     const templateRect = new openCv.Rect(0, 0, overlapWidth, templateHeight)
//     const searchX = Math.max(0, left.cols - overlapWidth * 2)
//     const searchRect = new openCv.Rect(searchX, 0, left.cols - searchX, templateHeight)
//     const template = right.roi(templateRect)
//     const searchArea = left.roi(searchRect)
//     const matchResult = new openCv.Mat()

//     try {
//       openCv.matchTemplate(searchArea, template, matchResult, openCv.TM_CCOEFF_NORMED)
//       const match = openCv.minMaxLoc(matchResult)
//       const rightStartX = searchX + match.maxLoc.x
//       const outputWidth = rightStartX + right.cols
//       const outputHeight = Math.max(left.rows, right.rows)
//       const output = openCv.Mat.zeros(outputHeight, outputWidth, openCv.CV_8UC4)
//       const leftRegion = output.roi(new openCv.Rect(0, 0, left.cols, left.rows))
//       const rightRegion = output.roi(new openCv.Rect(rightStartX, 0, right.cols, right.rows))

//       left.copyTo(leftRegion)
//       const overlapStart = Math.max(0, rightStartX)
//       const overlapEnd = Math.min(left.cols, rightStartX + right.cols)
//       const overlapWidth = overlapEnd - overlapStart
//       const overlapHeight = Math.min(left.rows, right.rows)

//       if (overlapWidth > 0) {
//         right.copyTo(rightRegion)
//         const leftOverlap = output.roi(new openCv.Rect(overlapStart, 0, overlapWidth, overlapHeight))
//         const rightOverlap = right.roi(new openCv.Rect(overlapStart - rightStartX, 0, overlapWidth, overlapHeight))
//         openCv.addWeighted(leftOverlap, 0.5, rightOverlap, 0.5, 0, leftOverlap)
//         leftOverlap.delete()
//         rightOverlap.delete()
//       } else {
//         right.copyTo(rightRegion)
//       }
//       leftRegion.delete()
//       rightRegion.delete()
//       return output
//     } finally {
//       template.delete()
//       searchArea.delete()
//       matchResult.delete()
//     }
//   }

//   private loadImage(file: File): Promise<HTMLImageElement> {
//     return new Promise((resolve, reject) => {
//       const image = new Image()
//       image.onload = () => resolve(image)
//       image.onerror = () => reject(new Error(`Could not load ${file.name}`))
//       image.src = URL.createObjectURL(file)
//     })
//   }
// }

