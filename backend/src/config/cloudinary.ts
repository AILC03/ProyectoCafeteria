import { z } from 'zod';
import type { CloudinaryConfig } from '../modules/catalog/image.provider.js';
const schema = z.object({
  CLOUDINARY_CLOUD_NAME: z.string().regex(/^[A-Za-z0-9_-]+$/),
  CLOUDINARY_API_KEY: z.string().min(1),
  CLOUDINARY_API_SECRET: z.string().min(1),
});
export function cloudinaryConfiguration(
  input: Record<string, string | undefined>,
): CloudinaryConfig | undefined {
  if (!input.CLOUDINARY_CLOUD_NAME && !input.CLOUDINARY_API_KEY && !input.CLOUDINARY_API_SECRET)
    return undefined;
  const result = schema.safeParse(input);
  if (!result.success)
    throw new Error('Configuración Cloudinary incompleta; no se muestran claves.');
  return {
    cloudName: result.data.CLOUDINARY_CLOUD_NAME,
    apiKey: result.data.CLOUDINARY_API_KEY,
    apiSecret: result.data.CLOUDINARY_API_SECRET,
  };
}
