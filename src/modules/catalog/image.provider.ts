import { v2 as cloudinary } from 'cloudinary';
import { z } from 'zod';
import { unavailable } from '../../shared/http/problem.js';

export type ImageAsset = {
  publicId: string;
  version: string;
  url: string;
  format: string;
  bytes: number;
  width: number;
  height: number;
  resourceType: string;
};
export interface ImageProvider {
  authorize(publicId: string, timestamp: number): Record<string, string | number | boolean>;
  inspect(publicId: string): Promise<ImageAsset>;
  destroy(publicId: string): Promise<void>;
}
export type CloudinaryConfig = { cloudName: string; apiKey: string; apiSecret: string };
const metadata = z.object({
  public_id: z.string(),
  version: z.union([z.number().int(), z.string().regex(/^\d+$/)]).transform(String),
  secure_url: z.string().url(),
  format: z.string(),
  bytes: z.number().int(),
  width: z.number().int(),
  height: z.number().int(),
  resource_type: z.string(),
});
export class CloudinaryProvider implements ImageProvider {
  constructor(private config: CloudinaryConfig) {}
  authorize(publicId: string, timestamp: number) {
    const params = {
      public_id: publicId,
      timestamp,
      overwrite: false,
      allowed_formats: 'jpg,png,webp',
    };
    return {
      ...params,
      signature: cloudinary.utils.api_sign_request(params, this.config.apiSecret),
      api_key: this.config.apiKey,
      cloud_name: this.config.cloudName,
      uploadUrl: `https://api.cloudinary.com/v1_1/${this.config.cloudName}/image/upload`,
    };
  }
  async inspect(publicId: string): Promise<ImageAsset> {
    try {
      const raw: unknown = await cloudinary.api.resource(publicId, {
        ...this.configOptions(),
        resource_type: 'image',
        type: 'upload',
      });
      const asset = metadata.parse(raw);
      const url = new URL(asset.secure_url);
      if (
        url.protocol !== 'https:' ||
        url.hostname !== 'res.cloudinary.com' ||
        !url.pathname.startsWith(`/${this.config.cloudName}/image/upload/`)
      )
        throw unavailable();
      return {
        publicId: asset.public_id,
        version: asset.version,
        url: asset.secure_url,
        format: asset.format,
        bytes: asset.bytes,
        width: asset.width,
        height: asset.height,
        resourceType: asset.resource_type,
      };
    } catch {
      throw unavailable();
    }
  }
  async destroy(publicId: string) {
    try {
      const result: unknown = await cloudinary.uploader.destroy(publicId, {
        ...this.configOptions(),
        resource_type: 'image',
        type: 'upload',
        invalidate: true,
      });
      if (
        !result ||
        typeof result !== 'object' ||
        !('result' in result) ||
        !['ok', 'not found'].includes(String(result.result))
      )
        throw unavailable();
    } catch {
      throw unavailable();
    }
  }
  private configOptions() {
    return {
      cloud_name: this.config.cloudName,
      api_key: this.config.apiKey,
      api_secret: this.config.apiSecret,
      secure: true,
      timeout: 10000,
    };
  }
}
