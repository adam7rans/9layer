import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import { join } from 'path';

export class TestDatabase {
  private static instance: PrismaClient;

  static async setup(): Promise<PrismaClient> {
    if (!this.instance) {
      // Create test database
      const databaseUrl = process.env.DATABASE_URL || 'postgresql://localhost:5432/9layer_test';

      try {
        // Run migrations
        execSync('npx prisma migrate deploy', {
          cwd: join(__dirname, '../..'),
          env: { ...process.env, DATABASE_URL: databaseUrl }
        });

        this.instance = new PrismaClient({
          datasourceUrl: databaseUrl,
        });

        // Clean database before tests
        await this.instance.track.deleteMany();
        await this.instance.artist.deleteMany();
        await this.instance.album.deleteMany();

      } catch (error) {
        console.error('Failed to setup test database:', error);
        throw error;
      }
    }

    return this.instance;
  }

  static async teardown(): Promise<void> {
    if (this.instance) {
      await this.instance.$disconnect();
    }
  }

  static async clean(): Promise<void> {
    if (this.instance) {
      await this.instance.track.deleteMany();
      await this.instance.artist.deleteMany();
      await this.instance.album.deleteMany();
    }
  }
}
