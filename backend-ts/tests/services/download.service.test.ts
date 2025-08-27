import { DownloadService } from '../../src/services/download.service';
import { TestDataFactory } from '../factory';
import { TestDatabase } from '../database';
import { PrismaClient } from '@prisma/client';
import { jest } from '@jest/globals';

// Mock yt-dlp
const mockYtDlp = {
  default: jest.fn(),
  exec: jest.fn(),
};

// Mock file system
const mockFs = {
  promises: {
    mkdir: jest.fn(),
    access: jest.fn(),
    stat: jest.fn(),
  },
  createWriteStream: jest.fn(),
};

// Mock fluent-ffmpeg
const mockFfmpeg = jest.fn().mockImplementation(() => ({
  input: jest.fn().mockReturnThis(),
  output: jest.fn().mockReturnThis(),
  on: jest.fn().mockReturnThis(),
  run: jest.fn().mockReturnThis(),
}));

jest.mock('youtube-dl-exec', () => mockYtDlp);
jest.mock('fs', () => mockFs);
jest.mock('fluent-ffmpeg', () => mockFfmpeg);

describe('DownloadService', () => {
  let prisma: PrismaClient;
  let downloadService: DownloadService;

  beforeAll(async () => {
    prisma = await TestDatabase.setup();
  });

  afterAll(async () => {
    await TestDatabase.teardown();
  });

  beforeEach(async () => {
    await TestDatabase.clean();
    downloadService = new DownloadService(prisma);
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with Prisma client', () => {
      expect(downloadService).toBeDefined();
      expect(downloadService).toBeInstanceOf(DownloadService);
    });
  });

  describe('downloadAudio', () => {
    it('should successfully download audio', async () => {
      const options = TestDataFactory.createDownloadOptions();
      const mockMetadata = {
        title: 'Test Song',
        artist: 'Test Artist',
        album: 'Test Album',
        duration: 180,
        youtubeId: 'test123',
      };

      // Mock yt-dlp execution
      mockYtDlp.exec.mockResolvedValue({
        stdout: JSON.stringify(mockMetadata),
        stderr: '',
      });

      // Mock file operations
      mockFs.promises.access.mockResolvedValue(undefined);
      mockFs.promises.stat.mockResolvedValue({
        size: 1024,
        isFile: () => true,
        isDirectory: () => false,
      } as any);

      const result = await downloadService.downloadAudio(options.url, options);

      expect(result.success).toBe(true);
      expect(result.trackId).toBeDefined();
      expect(result.filePath).toBeDefined();
      expect(result.metadata).toEqual(mockMetadata);
    });

    it('should handle download errors', async () => {
      const options = TestDataFactory.createDownloadOptions();

      // Mock yt-dlp to throw error
      mockYtDlp.exec.mockRejectedValue(new Error('Download failed'));

      const result = await downloadService.downloadAudio(options.url, options);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Download failed');
    });

    it('should create artist and album if they do not exist', async () => {
      const options = TestDataFactory.createDownloadOptions();
      const mockMetadata = {
        title: 'New Song',
        artist: 'New Artist',
        album: 'New Album',
        duration: 200,
        youtubeId: 'new123',
      };

      mockYtDlp.exec.mockResolvedValue({
        stdout: JSON.stringify(mockMetadata),
        stderr: '',
      });

      mockFs.promises.access.mockResolvedValue(undefined);
      mockFs.promises.stat.mockResolvedValue({
        size: 2048,
        isFile: () => true,
        isDirectory: () => false,
      } as any);

      await downloadService.downloadAudio(options.url, options);

      // Verify artist and album were created
      const artist = await prisma.artist.findFirst({
        where: { name: mockMetadata.artist }
      });
      const album = await prisma.album.findFirst({
        where: { title: mockMetadata.album }
      });

      expect(artist).toBeTruthy();
      expect(album).toBeTruthy();
    });

    it('should handle invalid URL', async () => {
      const options = TestDataFactory.createDownloadOptions({
        url: 'invalid-url'
      });

      const result = await downloadService.downloadAudio(options.url, options);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid URL');
    });
  });

  describe('getDownloadProgress', () => {
    it('should return progress for active download', async () => {
      const jobId = 'test-job-123';
      const mockProgress = {
        jobId,
        status: 'downloading' as const,
        progress: 50,
        currentSpeed: '1.2 MB/s',
        eta: '00:30',
        downloadedBytes: 512000,
        totalBytes: 1024000,
      };

      // Start a download to create a job
      const options = TestDataFactory.createDownloadOptions();
      downloadService.downloadAudio(options.url, options);

      // Mock the progress getter
      const progress = downloadService.getDownloadProgress(jobId);
      expect(progress).toBeDefined();
    });

    it('should return null for non-existent job', () => {
      const progress = downloadService.getDownloadProgress('non-existent-job');
      expect(progress).toBeNull();
    });
  });

  describe('cancelDownload', () => {
    it('should cancel active download', async () => {
      const options = TestDataFactory.createDownloadOptions();

      // Start download
      const downloadPromise = downloadService.downloadAudio(options.url, options);

      // Cancel it
      const cancelled = downloadService.cancelDownload('test-job');
      expect(cancelled).toBeDefined();
    });

    it('should return false for non-existent job', () => {
      const cancelled = downloadService.cancelDownload('non-existent-job');
      expect(cancelled).toBe(false);
    });
  });

  describe('getQueueStatus', () => {
    it('should return queue status', () => {
      const status = downloadService.getQueueStatus();

      expect(status).toHaveProperty('pending');
      expect(status).toHaveProperty('active');
      expect(status).toHaveProperty('total');
      expect(typeof status.pending).toBe('number');
      expect(typeof status.active).toBe('number');
      expect(typeof status.total).toBe('number');
    });

    it('should reflect active downloads in queue status', async () => {
      const options = TestDataFactory.createDownloadOptions();

      // Start multiple downloads
      downloadService.downloadAudio(options.url, options);
      downloadService.downloadAudio(options.url + '2', options);

      const status = downloadService.getQueueStatus();
      expect(status.total).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle file system errors', async () => {
      const options = TestDataFactory.createDownloadOptions();

      mockFs.promises.access.mockRejectedValue(new Error('Permission denied'));
      mockYtDlp.exec.mockResolvedValue({
        stdout: JSON.stringify({ title: 'Test' }),
        stderr: '',
      });

      const result = await downloadService.downloadAudio(options.url, options);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Permission denied');
    });

    it('should handle database errors', async () => {
      const options = TestDataFactory.createDownloadOptions();

      // Mock Prisma to throw error
      jest.spyOn(prisma.track, 'create').mockRejectedValue(new Error('Database error'));

      const result = await downloadService.downloadAudio(options.url, options);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Database error');
    });

    it('should handle yt-dlp errors', async () => {
      const options = TestDataFactory.createDownloadOptions();

      mockYtDlp.exec.mockRejectedValue(new Error('yt-dlp failed'));

      const result = await downloadService.downloadAudio(options.url, options);

      expect(result.success).toBe(false);
      expect(result.error).toContain('yt-dlp failed');
    });
  });

  describe('File Operations', () => {
    it('should create output directory if it does not exist', async () => {
      const options = TestDataFactory.createDownloadOptions();

      mockFs.promises.access.mockRejectedValue(new Error('Directory does not exist'));
      mockFs.promises.mkdir.mockResolvedValue(undefined);

      await downloadService.downloadAudio(options.url, options);

      expect(mockFs.promises.mkdir).toHaveBeenCalledWith(options.outputDir, { recursive: true });
    });

    it('should handle directory creation errors', async () => {
      const options = TestDataFactory.createDownloadOptions();

      mockFs.promises.access.mockRejectedValue(new Error('Directory does not exist'));
      mockFs.promises.mkdir.mockRejectedValue(new Error('Cannot create directory'));

      const result = await downloadService.downloadAudio(options.url, options);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot create directory');
    });
  });
});
