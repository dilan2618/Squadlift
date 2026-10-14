// Prepara fotos del teléfono para subirlas: corrige la orientación, recorta y reduce el peso.

async function decode(file) {
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }) } catch { /* sigue */ }
  // Respaldo para navegadores sin createImageBitmap con opciones
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return img
  } finally { URL.revokeObjectURL(url) }
}

const toBlob = (canvas, q) => new Promise(r => canvas.toBlob(r, 'image/jpeg', q))

/** Foto de perfil: cuadrada, 512×512, JPEG liviano (~40–90 KB) */
export async function prepareAvatar(file, size = 512) {
  const img = await decode(file)
  const w = img.width, h = img.height
  const side = Math.min(w, h)
  const c = document.createElement('canvas')
  c.width = size; c.height = size
  const ctx = c.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, size, size)
  const blob = await toBlob(c, 0.85)
  if (!blob) throw new Error('No pudimos leer esa imagen. Prueba con otra foto.')
  return blob
}

/** Foto de progreso: hasta 1600px en el lado largo */
export async function prepareProgressPhoto(file, max = 1600) {
  const img = await decode(file)
  const scale = Math.min(1, max / Math.max(img.width, img.height))
  const c = document.createElement('canvas')
  c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale)
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
  return toBlob(c, 0.82)
}
