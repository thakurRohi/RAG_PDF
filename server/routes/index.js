import { registerHealthRoutes } from './health.js';
import { registerEmbeddingKeyRoutes } from './embedding-keys.js';
import { registerDocumentRoutes } from './documents.js';
import { registerChatRoutes } from './chats.js';

export const registerRoutes = (app, dependencies) => {
  registerHealthRoutes(app, dependencies);
  app.use(dependencies.requireAuth);
  const getCustomJinaApiKey = registerEmbeddingKeyRoutes(app, dependencies);
  registerDocumentRoutes(app, { ...dependencies, getCustomJinaApiKey });
  registerChatRoutes(app, { ...dependencies, getCustomJinaApiKey });
};
