/**
 * setProfilePicture принимает только JPEG. Конвертируем любое изображение (PNG, WebP, HEIC в Safari…)
 * в квадратный JPEG по центру — так аватар выглядит одинаково во всех клиентах мессенджера.
 */
export async function toSquareJpeg(file: Blob, size = 640, quality = 0.9): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  try {
    const side = Math.min(bitmap.width, bitmap.height)
    const target = Math.min(size, side)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = target
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas недоступен')
    ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, target, target)
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Не удалось сжать изображение'))), 'image/jpeg', quality),
    )
  } finally {
    bitmap.close()
  }
}
