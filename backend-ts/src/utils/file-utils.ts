import { promises as fs, createReadStream } from 'fs';
import * as path from 'path';
import { FileInfo } from '../types/api.types';
import { env } from '../config/environment';

export class FileUtils {
  /**
   * Ensure directory exists, creating it if necessary
   */
  static async ensureDirectory(dirPath: string): Promise<void> {
    try {
      await fs.access(dirPath);
    } catch {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }

  /**
   * Get file information
   */
  static async getFileInfo(filePath: string): Promise<FileInfo | null> {
    try {
      const stats = await fs.stat(filePath);
      return {
        path: filePath,
        size: stats.size,
        modified: stats.mtime,
        isDirectory: stats.isDirectory(),
      };
    } catch {
      return null;
    }
  }

  /**
   * List files in directory with optional filtering
   */
  static async listFiles(
    dirPath: string,
    options: {
      recursive?: boolean;
      extensions?: string[];
      excludeDirs?: string[];
    } = {}
  ): Promise<FileInfo[]> {
    const { recursive = false, extensions, excludeDirs = [] } = options;

    try {
      const items = await fs.readdir(dirPath);
      const files: FileInfo[] = [];

      for (const item of items) {
        const fullPath = path.join(dirPath, item);
        const stats = await fs.stat(fullPath);

        // Skip excluded directories
        if (stats.isDirectory() && excludeDirs.includes(item)) {
          continue;
        }

        // Handle recursive listing
        if (stats.isDirectory() && recursive) {
          const subFiles = await FileUtils.listFiles(fullPath, options);
          files.push(...subFiles);
        }

        // Filter by extensions if specified
        if (stats.isFile()) {
          if (!extensions || extensions.some(ext => item.endsWith(ext))) {
            files.push({
              path: fullPath,
              size: stats.size,
              modified: stats.mtime,
              isDirectory: false,
            });
          }
        }
      }

      return files;
    } catch {
      return [];
    }
  }

  /**
   * Create organized directory structure for music files
   */
  static createMusicDirectoryStructure(baseDir: string, artist: string, album?: string): string {
    let structure = path.join(baseDir, FileUtils.sanitizeFilename(artist));
    if (album) {
      structure = path.join(structure, FileUtils.sanitizeFilename(album));
    }
    return structure;
  }

  /**
   * Generate filename from track information
   */
  static generateTrackFilename(trackTitle: string, trackNumber?: number, extension = 'mp3'): string {
    const sanitizedTitle = FileUtils.sanitizeFilename(trackTitle);
    const prefix = trackNumber ? `${trackNumber.toString().padStart(2, '0')} - ` : '';
    return `${prefix}${sanitizedTitle}.${extension}`;
  }

  /**
   * Sanitize filename by removing invalid characters
   */
  static sanitizeFilename(filename: string): string {
    return filename
      .replace(/[<>:"/\\|?*]/g, '') // Remove invalid characters
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .trim() // Remove leading/trailing whitespace
      .substring(0, 255); // Limit length
  }

  /**
   * Calculate directory size recursively
   */
  static async getDirectorySize(dirPath: string): Promise<number> {
    try {
      let totalSize = 0;
      const items = await fs.readdir(dirPath);

      for (const item of items) {
        const fullPath = path.join(dirPath, item);
        const stats = await fs.stat(fullPath);

        if (stats.isDirectory()) {
          totalSize += await FileUtils.getDirectorySize(fullPath);
        } else {
          totalSize += stats.size;
        }
      }

      return totalSize;
    } catch {
      return 0;
    }
  }

  /**
   * Clean up empty directories recursively
   */
  static async cleanEmptyDirectories(dirPath: string): Promise<void> {
    try {
      const items = await fs.readdir(dirPath);

      for (const item of items) {
        const fullPath = path.join(dirPath, item);
        const stats = await fs.stat(fullPath);

        if (stats.isDirectory()) {
          await FileUtils.cleanEmptyDirectories(fullPath);
          // Check if directory is now empty
          const remainingItems = await fs.readdir(fullPath);
          if (remainingItems.length === 0) {
            await fs.rmdir(fullPath);
          }
        }
      }
    } catch {
      // Ignore errors during cleanup
    }
  }

  /**
   * Move file to new location, creating directories if necessary
   */
  static async moveFile(sourcePath: string, targetPath: string): Promise<void> {
    const targetDir = path.dirname(targetPath);
    await FileUtils.ensureDirectory(targetDir);
    await fs.rename(sourcePath, targetPath);
  }

  /**
   * Copy file to new location, creating directories if necessary
   */
  static async copyFile(sourcePath: string, targetPath: string): Promise<void> {
    const targetDir = path.dirname(targetPath);
    await FileUtils.ensureDirectory(targetDir);
    await fs.copyFile(sourcePath, targetPath);
  }

  /**
   * Delete file or directory recursively
   */
  static async deleteFile(filePath: string): Promise<void> {
    try {
      const stats = await fs.stat(filePath);
      if (stats.isDirectory()) {
        await fs.rm(filePath, { recursive: true, force: true });
      } else {
        await fs.unlink(filePath);
      }
    } catch {
      // Ignore errors if file doesn't exist
    }
  }

  /**
   * Get music files from download directory
   */
  static async getMusicFiles(): Promise<FileInfo[]> {
    const musicExtensions = ['.mp3', '.m4a', '.flac', '.aac', '.ogg', '.wma'];
    return FileUtils.listFiles(env.DOWNLOAD_DIR, {
      recursive: true,
      extensions: musicExtensions,
      excludeDirs: ['temp', 'cache', 'thumbs'],
    });
  }

  /**
   * Create temporary file path
   */
  static createTempFilePath(filename: string): string {
    const tempDir = path.join(env.DOWNLOAD_DIR, 'temp');
    return path.join(tempDir, filename);
  }

  /**
   * Stream file content
   */
  static createFileStream(filePath: string, options?: { start?: number; end?: number }) {
    return createReadStream(filePath, options);
  }

  /**
   * Get file extension
   */
  static getFileExtension(filePath: string): string {
    return path.extname(filePath).toLowerCase();
  }

  /**
   * Check if file is audio file
   */
  static isAudioFile(filePath: string): boolean {
    const audioExtensions = ['.mp3', '.m4a', '.flac', '.aac', '.ogg', '.wma', '.wav'];
    return audioExtensions.includes(FileUtils.getFileExtension(filePath));
  }

  /**
   * Format file size for display
   */
  static formatFileSize(bytes: number): string {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Get available disk space
   */
  static async getDiskSpace(_dirPath: string): Promise<{ free: number; total: number } | null> {
    try {
      // Note: This is a simplified version. In production, you might want to use
      // a library like 'diskusage' or system calls for accurate disk space info
      return {
        free: 0, // Placeholder - would need platform-specific implementation
        total: 0, // Placeholder - would need platform-specific implementation
      };
    } catch {
      return null;
    }
  }
}

// Export default instance
export default FileUtils;
