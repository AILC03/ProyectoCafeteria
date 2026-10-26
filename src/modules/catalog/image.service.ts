import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { Principal } from '../auth/auth.types.js';
import { forbidden } from '../auth/auth.tokens.js';
import { HttpProblem, notFound, unavailable } from '../../shared/http/problem.js';
import { AdminService, conflict } from './admin.service.js';
import type { ImageProvider, ImageAsset } from './image.provider.js';

const prefix = 'cafeteria/products/';
export class ImageService {
  constructor(
    readonly admin: AdminService,
    readonly provider: ImageProvider,
    readonly now: () => Date = () => new Date(),
  ) {}
  async authorize(actor: Principal, productId: bigint) {
    const intent = await this.admin.write(actor, 'IMAGE_UPLOAD_AUTHORIZED', async (tx) => {
      const product = await tx.product.findFirst({ where: { id: productId, deletedAt: null } });
      if (!product) throw notFound();
      const now = this.now();
      return tx.imageUploadIntent.create({
        data: {
          productId,
          actorId: actor.userId,
          publicId: `${prefix}${productId}/${randomBytes(16).toString('hex')}`,
          expectedVersion: product.imageVersion,
          expectedPublicId: product.imagePublicId,
          createdAt: now,
          expiresAt: new Date(now.getTime() + 10 * 60000),
        },
      });
    });
    return {
      intentId: intent.id,
      expiresAt: intent.expiresAt,
      maxBytes: 5 * 1024 * 1024,
      maxDimension: 8192,
      parameters: this.provider.authorize(
        intent.publicId,
        Math.floor(intent.createdAt.getTime() / 1000),
      ),
    };
  }
  async associate(actor: Principal, productId: bigint, intentId: bigint) {
    const db = this.admin.repository.db;
    const intent = await db.imageUploadIntent.findUnique({ where: { id: intentId } });
    if (!intent || intent.productId !== productId || intent.actorId !== actor.userId)
      throw forbidden();
    if (intent.consumedAt || intent.expiresAt <= this.now())
      throw conflict('Autorización de imagen usada o vencida');
    // No mantener transacciones ni locks durante llamadas al proveedor.
    let asset: ImageAsset;
    try {
      asset = await this.provider.inspect(intent.publicId);
    } catch {
      throw unavailable();
    }
    if (
      asset.publicId !== intent.publicId ||
      asset.resourceType !== 'image' ||
      !['jpg', 'jpeg', 'png', 'webp'].includes(asset.format) ||
      asset.bytes <= 0 ||
      asset.bytes > 5 * 1024 * 1024 ||
      asset.width < 1 ||
      asset.height < 1 ||
      asset.width > 8192 ||
      asset.height > 8192 ||
      asset.width * asset.height > 40000000 ||
      !/^\d{1,40}$/.test(asset.version) ||
      !asset.url.startsWith('https://')
    ) {
      // Conserva el asset vigente. El intent expirado se limpiará por el dispatcher.
      throw new HttpProblem(
        400,
        'IMAGE_INVALID',
        'La imagen no cumple formato, tamaño o dimensiones',
      );
    }
    return this.admin.write(actor, 'PRODUCT_IMAGE_REPLACED', async (tx) => {
      await tx.$queryRaw`SELECT id FROM image_upload_intents WHERE id=${intentId} FOR UPDATE`;
      const current = await tx.imageUploadIntent.findUnique({ where: { id: intentId } });
      const product = await tx.product.findFirst({ where: { id: productId, deletedAt: null } });
      if (!product) throw notFound();
      if (
        !current ||
        current.consumedAt ||
        current.expiresAt <= this.now() ||
        product.imageVersion !== current.expectedVersion ||
        product.imagePublicId !== current.expectedPublicId
      )
        throw conflict('Imagen modificada concurrentemente o autorización vencida');
      const updated = await tx.product.update({
        where: { id: productId },
        data: { imageUrl: asset.url, imagePublicId: asset.publicId, imageVersion: asset.version },
      });
      await tx.imageUploadIntent.update({
        where: { id: intentId },
        data: { consumedAt: this.now() },
      });
      if (product.imagePublicId && product.imagePublicId !== asset.publicId) {
        const oldIntent = await tx.imageUploadIntent.findUnique({
          where: { publicId: product.imagePublicId },
        });
        const availableAt = new Date(
          Math.max(
            this.now().getTime(),
            oldIntent ? oldIntent.createdAt.getTime() + 2 * 3600000 : 0,
          ),
        );
        await tx.job.upsert({
          where: { dedupeKey: `image-delete:${product.imagePublicId}` },
          create: {
            type: 'CLOUDINARY_DELETE',
            reference: product.imagePublicId,
            dedupeKey: `image-delete:${product.imagePublicId}`,
            availableAt,
          },
          update: {},
        });
      }
      return updated;
    });
  }
}

export async function cleanupImages(
  db: PrismaClient,
  provider: ImageProvider,
  now: () => Date = () => new Date(),
) {
  // Esperar dos horas: una firma de carga del proveedor puede vivir más que el intent local.
  const cutoff = new Date(now().getTime() - 2 * 3600000);
  const expired = await db.$queryRaw<
    { publicId: string }[]
  >`SELECT i.public_id AS "publicId" FROM image_upload_intents i
    WHERE i.consumed_at IS NULL AND i.created_at<${cutoff}
    AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.dedupe_key='image-delete:' || i.public_id)
    ORDER BY i.id LIMIT 100`;
  for (const intent of expired)
    await db.job.upsert({
      where: { dedupeKey: `image-delete:${intent.publicId}` },
      create: {
        type: 'CLOUDINARY_DELETE',
        reference: intent.publicId,
        dedupeKey: `image-delete:${intent.publicId}`,
        availableAt: now(),
      },
      update: {},
    });
  let processed = 0;
  for (let index = 0; index < 20; index++) {
    const job = await db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { id: bigint }[]
      >`SELECT id FROM jobs WHERE type='CLOUDINARY_DELETE' AND (status='PENDING' OR (status='PROCESSING' AND locked_until<${now()})) AND available_at<=${now()} ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1`;
      if (!rows[0]) return null;
      return tx.job.update({
        where: { id: rows[0].id },
        data: {
          status: 'PROCESSING',
          lockedUntil: new Date(now().getTime() + 30000),
          attempts: { increment: 1 },
        },
      });
    });
    if (!job) break;
    try {
      if (!/^cafeteria\/products\/\d+\/[a-f0-9]{32}$/.test(job.reference))
        throw new Error('Invalid asset');
      // No permitir que un job elimine una imagen aún referenciada, incluso por un retirado.
      if (await db.product.count({ where: { imagePublicId: job.reference } }))
        throw new Error('Referenced asset');
      await provider.destroy(job.reference);
      await db.job.updateMany({
        where: { id: job.id, lockedUntil: job.lockedUntil },
        data: { status: 'SUCCEEDED', lockedUntil: null, lastError: null },
      });
      processed++;
    } catch {
      await db.job.updateMany({
        where: { id: job.id, lockedUntil: job.lockedUntil },
        data: {
          status: 'PENDING',
          lockedUntil: null,
          lastError: 'IMAGE_CLEANUP_RETRY',
          availableAt: new Date(
            now().getTime() + Math.min(3600000, 1000 * 2 ** Math.min(job.attempts, 12)),
          ),
        },
      });
    }
  }
  return processed;
}
