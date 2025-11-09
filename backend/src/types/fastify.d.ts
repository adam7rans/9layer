import { PrismaClient } from '@prisma/client';
import { AudioAnalysisService } from '../services/audio-analysis.service';

// Augment FastifyInstance to include prisma property
declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    audioAnalysisService: AudioAnalysisService;
  }
}
