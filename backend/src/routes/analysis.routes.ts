/**
 * Analysis routes expose endpoints for managing Essentia-based audio metadata generation.
 */

import { FastifyInstance } from 'fastify';

export async function analysisRoutes(fastify: FastifyInstance): Promise<void> {
  const service = fastify.audioAnalysisService;

  fastify.get('/analysis/status', async (_request, reply) => {
    return reply.send({ success: true, data: service.getStatus() });
  });

  fastify.post<{ Body: { limit?: number } }>('/analysis/pending', async (request, reply) => {
    const { limit } = request.body;
    const result = await service.analyzePending(limit);
    return reply.send({ success: result.success, data: result });
  });

  fastify.post<{ Body: { trackIds?: string[] } }>('/analysis/tracks', async (request, reply) => {
    const { trackIds } = request.body;
    const ids = Array.isArray(trackIds) ? trackIds.filter(Boolean) : [];
    const result = await service.analyzeTracks(ids);
    return reply.send({ success: result.success, data: result });
  });

  fastify.post<{ Body: { limit?: number } }>('/analysis/retry', async (request, reply) => {
    const { limit } = request.body;
    const result = await service.retryFailures(limit);
    return reply.send({ success: result.success, data: result });
  });
}
