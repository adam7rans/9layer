import { useState, useEffect, useRef } from 'react';

interface ProgressItem {
  jobId: string;
  progress: number;
  status: string;
  lastUpdate: number;
}

/**
 * Custom hook for smoothing progress updates when real updates are sparse.
 * Provides linear interpolation between actual progress values to create
 * the appearance of smooth progress even when backend emits coarse updates.
 */
export function useProgressSmoothing<T extends { jobId: string; progress?: number; status?: string }>(
  jobs: T[],
  smoothingInterval = 100 // Update interpolated progress every 100ms
): T[] {
  const [smoothedJobs, setSmoothedJobs] = useState<T[]>(jobs);
  const progressMapRef = useRef<Map<string, ProgressItem>>(new Map());
  const animationRef = useRef<number | null>(null);

  // Update our internal progress map when jobs change
  useEffect(() => {
    const now = Date.now();

    jobs.forEach(job => {
      const existing = progressMapRef.current.get(job.jobId);
      const progress = job.progress ?? 0;
      const status = job.status ?? 'pending';

      if (!existing || existing.progress !== progress) {
        progressMapRef.current.set(job.jobId, {
          jobId: job.jobId,
          progress,
          status,
          lastUpdate: now
        });
      }
    });

    // Remove jobs that no longer exist
    const currentJobIds = new Set(jobs.map(j => j.jobId));
    for (const [jobId] of progressMapRef.current) {
      if (!currentJobIds.has(jobId)) {
        progressMapRef.current.delete(jobId);
      }
    }
  }, [jobs]);

  // Animation loop for smooth progress interpolation
  useEffect(() => {
    const animate = () => {
      const now = Date.now();
      let hasActiveDownloads = false;

      const updated = jobs.map(job => {
        const progressItem = progressMapRef.current.get(job.jobId);
        if (!progressItem) return job;

        const { progress: targetProgress, status, lastUpdate } = progressItem;

        // Only smooth progress for active downloads
        if (status === 'downloading' && targetProgress < 100) {
          hasActiveDownloads = true;

          const timeSinceUpdate = now - lastUpdate;
          const currentProgress = job.progress ?? 0;

          // If no progress update for more than 2 seconds and progress < 95%,
          // slowly increment to show activity (max 2% per second)
          if (timeSinceUpdate > 2000 && currentProgress < 95) {
            const maxIncrease = (timeSinceUpdate / 1000) * 2; // 2% per second
            const smoothedProgress = Math.min(
              targetProgress + maxIncrease,
              95 // Never go above 95% on smoothing
            );

            return {
              ...job,
              progress: Math.round(smoothedProgress * 10) / 10 // Keep one decimal
            };
          }
        }

        return job;
      });

      setSmoothedJobs(updated);

      // Continue animation if there are active downloads
      if (hasActiveDownloads) {
        animationRef.current = setTimeout(animate, smoothingInterval);
      } else {
        animationRef.current = null;
      }
    };

    // Start animation if there are downloading jobs
    const hasDownloading = jobs.some(job => job.status === 'downloading');
    if (hasDownloading && !animationRef.current) {
      animationRef.current = setTimeout(animate, smoothingInterval);
    }

    return () => {
      if (animationRef.current) {
        clearTimeout(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [jobs, smoothingInterval]);

  return smoothedJobs;
}