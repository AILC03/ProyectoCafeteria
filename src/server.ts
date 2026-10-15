import { createApp } from './app.js';
import { parseEnvironment } from './config/env.js';

const env = parseEnvironment(process.env);
const server = createApp().listen(env.PORT, () => {
  console.info(`API escuchando en puerto ${env.PORT}`);
});
function shutdown() {
  server.close((error) => {
    process.exitCode = error ? 1 : 0;
  });
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
