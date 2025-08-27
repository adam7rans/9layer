import request from 'supertest';
import { FastifyInstance } from 'fastify';
import { TestDatabase } from '../database';
import { TestDataFactory } from '../factory';
import { PrismaClient } from '@prisma/client';
import { jest } from '@jest/globals';

// Mock the download service
const mockDownloadService = {
  downloadAudio: jest.fn(),
  getDownloadProgress: jest.fn(),
  cancelDownload: jest.fn(),
  getQueueStatus: jest.fn(),
};

// Mock yt-dlp
const mockYtDlp = {
  default: jest.fn(),
  exec: jest.fn(),
};

// Mock the services
jest.mock('../../src/services/download.service', () => ({
  DownloadService: jest.fn().mockImplementation(() => mockDownloadService),
}));

jest.mock('youtube-dl-exec', () => mockYtDlp);

describe('Download Routes Integration Tests', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = await TestDatabase.setup();
  });

  afterAll(async () => {
    await TestDatabase.teardown();
  });

  beforeEach(async () => {
    await TestDatabase.clean();
    jest.clearAllMocks();

    // Import and create app after mocks are set up
    const { createApp } = await import('../test-app');
    app = await createApp();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /download/audio', () => {
    it('should successfully download audio', async () => {
      const downloadOptions = TestDataFactory.createDownloadOptions();
      const mockResult = {
        success: true,
        trackId: 'test-track-123',
        filePath: '/downloads/test.mp3',
        metadata: {
          title: 'Test Song',
          artist: 'Test Artist',
          album: 'Test Album',
          duration: 180,
          youtubeId: 'test123',
        },
      };

      mockDownloadService.downloadAudio.mockResolvedValue(mockResult);

      const response = await request(app.server)
        .post('/download/audio')
        .send({
          url: downloadOptions.url,
          quality: downloadOptions.quality,
          format: downloadOptions.format,
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockResult);
      expect(mockDownloadService.downloadAudio).toHaveBeenCalledWith(
        downloadOptions.url,
        expect.objectContaining({
          url: downloadOptions.url,
          quality: downloadOptions.quality,
          format: downloadOptions.format,
        })
      );
    });

    it('should handle missing URL', async () => {
      const response = await request(app.server)
        .post('/download/audio')
        .send({
          quality: 'best',
          format: 'audio',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('URL is required');
    });

    it('should handle download errors', async () => {
      const downloadOptions = TestDataFactory.createDownloadOptions();
      const mockError = {
        success: false,
        error: 'Download failed: Network error',
      };

      mockDownloadService.downloadAudio.mockResolvedValue(mockError);

      const response = await request(app.server)
        .post('/download/audio')
        .send({
          url: downloadOptions.url,
        });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Download failed');
    });

    it('should handle invalid URL format', async () => {
      const response = await request(app.server)
        .post('/download/audio')
        .send({
          url: 'invalid-url',
        });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /download/playlist', () => {
    it('should successfully download playlist', async () => {
      const downloadOptions = TestDataFactory.createDownloadOptions();
      const mockYtDlpResult = {
        stdout: JSON.stringify([
          { youtubeId: 'video1', title: 'Song 1', duration: 180 },
          { youtubeId: 'video2', title: 'Song 2', duration: 200 },
        ]),
        stderr: '',
      };

      mockYtDlp.exec.mockResolvedValue(mockYtDlpResult);
      mockDownloadService.downloadAudio.mockResolvedValue({
        success: true,
        trackId: 'track123',
        filePath: '/downloads/track.mp3',
      });

      const response = await request(app.server)
        .post('/download/playlist')
        .send({
          url: 'https://www.youtube.com/playlist?list=test123',
          quality: downloadOptions.quality,
          format: downloadOptions.format,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Queued');
      expect(response.body.tracksQueued).toBeGreaterThan(0);
    });

    it('should handle non-playlist URLs', async () => {
      const downloadOptions = TestDataFactory.createDownloadOptions();

      // Mock yt-dlp to indicate it's not a playlist
      mockYtDlp.exec.mockResolvedValue({
        stdout: JSON.stringify({ youtubeId: 'single', title: 'Single Video' }),
        stderr: '',
      });

      const response = await request(app.server)
        .post('/download/playlist')
        .send({
          url: downloadOptions.url,
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not a playlist');
    });

    it('should handle playlist parsing errors', async () => {
      mockYtDlp.exec.mockRejectedValue(new Error('Failed to parse playlist'));

      const response = await request(app.server)
        .post('/download/playlist')
        .send({
          url: 'https://www.youtube.com/playlist?list=test123',
        });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /download/progress/:jobId', () => {
    it('should return download progress', async () => {
      const jobId = 'test-job-123';
      const mockProgress = {
        jobId,
        status: 'downloading',
        progress: 65,
        currentSpeed: '2.1 MB/s',
        eta: '00:45',
        downloadedBytes: 650000,
        totalBytes: 1000000,
      };

      mockDownloadService.getDownloadProgress.mockReturnValue(mockProgress);

      const response = await request(app.server)
        .get(`/download/progress/${jobId}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.jobId).toBe(jobId);
      expect(response.body.progress).toBe(65);
      expect(mockDownloadService.getDownloadProgress).toHaveBeenCalledWith(jobId);
    });

    it('should handle non-existent job', async () => {
      mockDownloadService.getDownloadProgress.mockReturnValue(null);

      const response = await request(app.server)
        .get('/download/progress/non-existent-job');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });
  });

  describe('DELETE /download/progress/:jobId', () => {
    it('should cancel download successfully', async () => {
      const jobId = 'test-job-123';
      mockDownloadService.cancelDownload.mockReturnValue(true);

      const response = await request(app.server)
        .delete(`/download/progress/${jobId}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('cancelled');
      expect(mockDownloadService.cancelDownload).toHaveBeenCalledWith(jobId);
    });

    it('should handle non-existent job cancellation', async () => {
      mockDownloadService.cancelDownload.mockReturnValue(false);

      const response = await request(app.server)
        .delete('/download/progress/non-existent-job');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });
  });

  describe('GET /download/queue', () => {
    it('should return queue status', async () => {
      const mockQueueStatus = {
        pending: 2,
        active: 1,
        total: 3,
      };

      mockDownloadService.getQueueStatus.mockReturnValue(mockQueueStatus);

      const response = await request(app.server)
        .get('/download/queue');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.pending).toBe(2);
      expect(response.body.active).toBe(1);
      expect(response.body.total).toBe(3);
      expect(mockDownloadService.getQueueStatus).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle service errors gracefully', async () => {
      mockDownloadService.downloadAudio.mockRejectedValue(new Error('Service error'));

      const response = await request(app.server)
        .post('/download/audio')
        .send({
          url: 'https://www.youtube.com/watch?v=test123',
        });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Internal server error');
    });

    it('should handle malformed JSON', async () => {
      const response = await request(app.server)
        .post('/download/audio')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');

      expect(response.status).toBe(400);
    });
  });

  describe('Request Validation', () => {
    it('should validate required fields', async () => {
      const response = await request(app.server)
        .post('/download/audio')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should validate URL format', async () => {
      const response = await request(app.server)
        .post('/download/audio')
        .send({
          url: 'not-a-valid-url',
        });

      expect(response.status).toBe(500);
    });

    it('should validate quality parameter', async () => {
      const response = await request(app.server)
        .post('/download/audio')
        .send({
          url: 'https://www.youtube.com/watch?v=test123',
          quality: 'invalid-quality',
        });

      expect(response.status).toBe(400);
    });

    it('should validate format parameter', async () => {
      const response = await request(app.server)
        .post('/download/audio')
        .send({
          url: 'https://www.youtube.com/watch?v=test123',
          format: 'invalid-format',
        });

      expect(response.status).toBe(400);
    });
  });

  describe('CORS and Headers', () => {
    it('should include proper CORS headers', async () => {
      const response = await request(app.server)
        .options('/download/audio');

      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBeDefined();
      expect(response.headers['access-control-allow-methods']).toContain('POST');
    });

    it('should handle preflight requests', async () => {
      const response = await request(app.server)
        .options('/download/audio')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'POST');

      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });
  });
});
