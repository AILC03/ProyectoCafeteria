import assert from 'node:assert/strict';
import console from 'node:console';
import { fileURLToPath, URL } from 'node:url';
import SwaggerParser from '@apidevtools/swagger-parser';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const path = fileURLToPath(new URL('../docs/api/openapi.yaml', import.meta.url));
const api = await SwaggerParser.validate(path);
const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
let checked = 0;
for (const [route, item] of Object.entries(api.paths)) {
  for (const method of ['get', 'post', 'patch', 'put', 'delete']) {
    const operation = item[method];
    if (!operation) continue;
    const requestMedia = operation.requestBody?.content?.['application/json'];
    if (requestMedia && 'example' in requestMedia) {
      const validate = ajv.compile(requestMedia.schema);
      assert.ok(validate(requestMedia.example), `${method} ${route}: entrada ejemplo no conforme`);
      checked++;
    }
    for (const response of Object.values(operation.responses)) {
      for (const media of Object.values(response.content ?? {})) {
        if (!('example' in media)) continue;
        const validate = ajv.compile(media.schema);
        assert.ok(validate(media.example), `${route}: ejemplo no conforme a esquema`);
        if (media.example.instance)
          assert.equal(media.example.instance, route.replace('{productId}', '10'));
        checked++;
      }
    }
  }
}
console.info(`OpenAPI válido; ${checked} ejemplos conformes a esquema y ruta.`);
