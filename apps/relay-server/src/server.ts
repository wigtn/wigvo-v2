import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyCors from '@fastify/cors';
import { config } from './config.js';
import { callsRoute } from './routes/calls.js';
import { streamRoute } from './routes/stream.js';
import { twilioWebhookRoute } from './routes/twilio-webhook.js';

const activeCalls = new Map<string, unknown>();

const app = Fastify({
  logger: {
    level: config.nodeEnv === 'production' ? 'info' : 'debug',
  },
});

// Plugins
await app.register(fastifyCors, { origin: true });
await app.register(fastifyWebsocket);

// Health check
app.get('/health', async () => ({
  status: 'ok',
  activeSessions: activeCalls.size,
  uptime: process.uptime(),
  callMode: config.callMode,
}));

// Routes
await app.register(callsRoute, { prefix: '/relay' });
await app.register(streamRoute, { prefix: '/relay' });
await app.register(twilioWebhookRoute, { prefix: '/relay/twilio' });

// Graceful shutdown
const shutdown = async (signal: string) => {
  app.log.info(`Received ${signal}. Graceful shutdown...`);

  // Wait for active calls to complete (max 30 seconds)
  const shutdownDeadline = Date.now() + 30_000;
  while (activeCalls.size > 0 && Date.now() < shutdownDeadline) {
    app.log.info(`Waiting for ${activeCalls.size} active call(s) to complete...`);
    await new Promise((r) => setTimeout(r, 2000));
  }

  if (activeCalls.size > 0) {
    app.log.warn(`Force closing ${activeCalls.size} remaining call(s)`);
  }

  await app.close();
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Start
try {
  await app.listen({ port: config.port, host: config.host });
  app.log.info(`Relay Server running on ${config.host}:${config.port}`);
  app.log.info(`Call mode: ${config.callMode}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

export { app, activeCalls };
