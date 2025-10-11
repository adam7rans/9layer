# Playback Heatmap Feature

## Overview
YouTube-style visualization showing which parts of each track are played most frequently. The "mountain range" graph displays play frequency across the track timeline.

## How It Works

### Data Collection
- **Playback segments** are automatically captured during playback
- Each segment records `startPosition`, `endPosition`, and `duration`
- When user seeks/skips, a new segment begins
- All segments are stored in the `playback_segments` database table

### Heatmap Generation
The backend divides each track into 100 buckets (time slices) and counts how many times each bucket was played:

```
Track Duration: 200 seconds
Bucket Size: 2 seconds each
Bucket 0: 0-2s → Played 5 times
Bucket 1: 2-4s → Played 5 times
Bucket 10: 20-22s → Played 12 times (HOTSPOT!)
```

### Visualization
- **Height** = Play frequency (taller = played more)
- **Color intensity** = Normalized frequency (brighter blue = more popular)
- **Red line** = Current playback position
- **Hover** = Shows timestamp
- **Click** = Seeks to that position

## Architecture

### Backend
**File**: `/backend/src/services/analytics.service.ts`
- `getTrackHeatmap()` - Generates heatmap data with configurable bucket count

**File**: `/backend/src/routes/analytics.routes.ts`
- `GET /analytics/track/:trackId/heatmap` - Returns heatmap data

### Frontend
**File**: `/frontend/src/components/HeatmapTimeline.tsx`
- React component that fetches and renders the heatmap
- SVG-based visualization with smooth gradients
- Interactive seeking and hover tooltips

**File**: `/frontend/src/components/IntegratedPlayer.tsx`
- Integrated into main player UI (replaces old progress bar)
- Automatically updates when track changes

### API
**File**: `/frontend/src/lib/api.ts`
- `api.analytics.getTrackHeatmap(trackId, userId?, bucketCount?)`

## API Response Example

```json
{
  "success": true,
  "data": {
    "trackId": "abc123",
    "trackDuration": 240,
    "bucketSize": 2.4,
    "maxPlays": 15,
    "buckets": [
      {
        "startPosition": 0,
        "endPosition": 2.4,
        "playCount": 8,
        "intensity": 0.53
      },
      {
        "startPosition": 2.4,
        "endPosition": 4.8,
        "playCount": 15,
        "intensity": 1.0
      }
    ]
  }
}
```

## Use Cases
1. **User Discovery** - See which parts of songs are most engaging
2. **Skip Patterns** - Identify intros/outros that users skip
3. **Replay Behavior** - Find the "best part" of songs (chorus, drop, etc.)
4. **Track Quality** - Songs with even heatmaps = fully listened, uneven = skip patterns

## Configuration
- **Bucket Count**: Default 100, adjustable via API parameter
  - Higher = More granular (slower)
  - Lower = Less detailed (faster)

## Performance
- Heatmap data is generated on-demand (not cached)
- For tracks with many listening sessions, generation takes ~50-200ms
- Client-side rendering uses SVG for smooth performance
- Data fetches only when track changes (not on every position update)

## Future Enhancements
- [ ] Cache heatmap data for popular tracks
- [ ] Global heatmap (all users combined)
- [ ] Heatmap intensity color themes
- [ ] Animated heatmap updates during playback
- [ ] Export heatmap data for analysis
