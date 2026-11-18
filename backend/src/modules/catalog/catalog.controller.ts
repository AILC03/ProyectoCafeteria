import type { RequestHandler } from 'express';
import { z } from 'zod';
import { idSchema, pageQuerySchema } from '../../shared/http/pagination.js';
import { jsonValue } from '../../shared/http/serialization.js';
import type { CatalogService } from './catalog.service.js';

const productQuery = pageQuerySchema.extend({
  categoryId: idSchema.optional(),
  isAvailable: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});
export function catalogController(service: CatalogService) {
  const categories: RequestHandler = async (request, response) => {
    response.json(jsonValue(await service.categories(pageQuerySchema.parse(request.query))));
  };
  const products: RequestHandler = async (request, response) => {
    response.json(jsonValue(await service.products(productQuery.parse(request.query))));
  };
  const product: RequestHandler = async (request, response) => {
    response.json(jsonValue(await service.product(idSchema.parse(request.params.productId))));
  };
  const options: RequestHandler = async (request, response) => {
    response.json(jsonValue(await service.options(idSchema.parse(request.params.productId))));
  };
  return { categories, products, product, options };
}
