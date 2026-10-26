import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { AuthService } from '../auth/auth.service.js';
import { principal } from '../auth/auth.http.js';
import { authenticate, authorize } from '../../middleware/authenticate.js';
import { csrf } from '../../middleware/csrf.js';
import { jsonValue } from '../../shared/http/serialization.js';
import { AdminService } from './admin.service.js';
import * as schema from './admin.validation.js';
import type { ImageService } from './image.service.js';
import { unavailable } from '../../shared/http/problem.js';

export function adminRoutes(auth: AuthService, service: AdminService, images?: ImageService) {
  const router = Router();
  router.use(authenticate(auth), authorize('ADMINISTRADOR'));
  router.use((request, response, next) => {
    response.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method))
      return csrf(auth)(request, response, next);
    next();
  });
  for (const resource of ['categories', 'products', 'option-groups', 'option-values'] as const) {
    router.get(`/${resource}`, async (request, response) =>
      response.json(
        jsonValue(await service.repository.list(resource, schema.adminList.parse(request.query))),
      ),
    );
    router.get(`/${resource}/:id`, async (request, response) =>
      response.json(
        jsonValue({
          data: await service.repository.get(resource, schema.dbId.parse(request.params.id)),
        }),
      ),
    );
  }
  const mutation =
    (
      fn: (
        request: Parameters<RequestHandler>[0],
        actor: ReturnType<typeof principal>,
      ) => Promise<unknown>,
      created = false,
    ): RequestHandler =>
    async (request, response) => {
      if (request.method === 'DELETE')
        z.object({})
          .strict()
          .parse(request.body ?? {});
      const result = await fn(request, principal(response));
      response.status(created ? 201 : 200).json(jsonValue({ data: result }));
    };
  router.post(
    '/categories',
    mutation((r, a) => service.createCategory(a, schema.categoryCreate.parse(r.body)), true),
  );
  router.patch(
    '/categories/:id',
    mutation((r, a) =>
      service.updateCategory(a, schema.dbId.parse(r.params.id), schema.categoryPatch.parse(r.body)),
    ),
  );
  router.delete(
    '/categories/:id',
    mutation((r, a) => service.deleteCategory(a, schema.dbId.parse(r.params.id))),
  );
  router.post(
    '/products',
    mutation((r, a) => service.createProduct(a, schema.productCreate.parse(r.body)), true),
  );
  router.patch(
    '/products/:id',
    mutation((r, a) =>
      service.updateProduct(a, schema.dbId.parse(r.params.id), schema.productPatch.parse(r.body)),
    ),
  );
  router.delete(
    '/products/:id',
    mutation((r, a) => service.deleteProduct(a, schema.dbId.parse(r.params.id))),
  );
  router.post(
    '/option-groups',
    mutation((r, a) => service.createGroup(a, schema.groupCreate.parse(r.body)), true),
  );
  router.patch(
    '/option-groups/:id',
    mutation((r, a) =>
      service.updateGroup(a, schema.dbId.parse(r.params.id), schema.groupPatch.parse(r.body)),
    ),
  );
  router.delete(
    '/option-groups/:id',
    mutation((r, a) => service.deleteGroup(a, schema.dbId.parse(r.params.id))),
  );
  router.post(
    '/option-groups/:id/values',
    mutation(
      (r, a) =>
        service.createValue(a, schema.dbId.parse(r.params.id), schema.valueCreate.parse(r.body)),
      true,
    ),
  );
  router.get('/option-groups/:id/values', async (request, response) => {
    // Listado de valores por grupo, sin convertirlo en endpoint público.
    const groupId = schema.dbId.parse(request.params.id);
    await service.repository.get('option-groups', groupId);
    const query = schema.adminList.parse(request.query);
    response.json(
      jsonValue(
        await service.repository.list('option-values', { ...query, groupId: groupId.toString() }),
      ),
    );
  });
  router.patch(
    '/option-values/:id',
    mutation((r, a) =>
      service.updateValue(a, schema.dbId.parse(r.params.id), schema.valuePatch.parse(r.body)),
    ),
  );
  router.delete(
    '/option-values/:id',
    mutation((r, a) => service.deleteValue(a, schema.dbId.parse(r.params.id))),
  );
  router.get('/products/:id/configuration', async (request, response) =>
    response.json(
      jsonValue({ data: await service.getConfiguration(schema.dbId.parse(request.params.id)) }),
    ),
  );
  router.put(
    '/products/:id/configuration',
    mutation((r, a) =>
      service.setConfiguration(
        a,
        schema.dbId.parse(r.params.id),
        schema.configuration.parse(r.body),
      ),
    ),
  );
  router.post(
    '/products/:id/image-upload',
    mutation((r, a) => {
      z.object({})
        .strict()
        .parse(r.body ?? {});
      if (!images) throw unavailable();
      return images.authorize(a, schema.dbId.parse(r.params.id));
    }, true),
  );
  router.put(
    '/products/:id/image',
    mutation((r, a) => {
      const body = z.object({ intentId: schema.dbId }).strict().parse(r.body);
      if (!images) throw unavailable();
      return images.associate(a, schema.dbId.parse(r.params.id), body.intentId);
    }),
  );
  return router;
}
export function availabilityRoutes(auth: AuthService, service: AdminService) {
  const router = Router();
  router.patch(
    '/products/:id/availability',
    csrf(auth),
    authenticate(auth),
    authorize('CAJERO', 'ADMINISTRADOR'),
    async (request, response) => {
      const body = z.object({ isAvailable: z.boolean() }).strict().parse(request.body);
      response.json(
        jsonValue({
          data: await service.availability(
            principal(response),
            schema.dbId.parse(request.params.id),
            body.isAvailable,
          ),
        }),
      );
    },
  );
  return router;
}
