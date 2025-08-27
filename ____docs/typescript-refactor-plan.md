# 9layer TypeScript Refactor Implementation Plan

## Executive Summary

This document outlines the comprehensive plan to refactor 9layer's backend from Python/FastAPI to TypeScript/Node.js while maintaining the downloader functionality and removing the CLI music player.

**Timeline**: 8-12 weeks  
**Risk Level**: Medium  
**Team Impact**: High (focused effort required)  

## Current Architecture Assessment

### Existing Components
- **Frontend**: Next.js 15 + React 19 + TypeScript ✅ (Keep as-is)
- **Backend**: Python FastAPI + SQLAlchemy + WebSocket ❌ (Migrate to TypeScript)
- **Database**: PostgreSQL ✅ (Keep with new ORM)
- **CLI Player**: Python terminal interface ❌ (Remove completely)
- **Downloader**: Python yt-dlp wrapper ✅ (Migrate to TypeScript)

### Key Dependencies
- **yt-dlp**: YouTube content downloading
- **PostgreSQL**: Data persistence
- **WebSocket**: Real-time playback control
- **CORS**: Cross-origin requests
- **File System**: Music file management

## Migration Strategy

### Framework Selection
**Recommended**: **Fastify + TypeScript**
- High performance (2x faster than Express)
- Built-in validation and serialization
- Excellent WebSocket support
- TypeScript-first design
- Mature ecosystem

**Alternatives Considered**:
- **NestJS**: Too heavy, overkill for our use case
- **Express**: Mature but slower than Fastify
- **Koa**: Minimal but requires more boilerplate

### ORM Selection
**Recommended**: **Prisma**
- Type-safe database access
- Auto-generated TypeScript types
- Built-in migrations
- Excellent PostgreSQL support
- Schema-first approach

## Detailed Implementation Plan

### Phase 1: Foundation Setup (Week 1-2)

#### 1.1 Project Structure Setup
```bash
# Create new backend directory structure
backend-ts/
├── src/
│   ├── config/
│   │   ├── database.ts
│   │   ├── environment.ts
│   │   └── cors.ts
│   ├── controllers/
│   │   ├── download.controller.ts
│   │   ├── playback.controller.ts
│   │   └── websocket.controller.ts
│   ├── services/
│   │   ├── download.service.ts
│   │   ├── playback.service.ts
│   │   ├── file.service.ts
│   │   └── websocket.service.ts
│   ├── models/
│   │   ├── artist.model.ts
│   │   ├── album.model.ts
│   │   ├── track.model.ts
│   │   └── index.ts
│   ├── routes/
│   │   ├── download.routes.ts
│   │   ├── playback.routes.ts
│   │   └── websocket.routes.ts
│   ├── middleware/
│   │   ├── cors.middleware.ts
│   │   ├── logging.middleware.ts
│   │   └── error.middleware.ts
│   ├── utils/
│   │   ├── yt-dlp.ts
│   │   └── file-utils.ts
│   ├── types/
│   │   ├── api.types.ts
│   │   └── websocket.types.ts
│   └── app.ts
├── package.json
├── tsconfig.json
├── prisma/
│   ├── schema.prisma
│   └── migrations/
└── tests/
    ├── unit/
    ├── integration/
    └── e2e/
```

#### 1.2 Core Dependencies Installation
```json
{
  "dependencies": {
    "fastify": "^4.28.1",
    "@fastify/cors": "^9.0.1",
    "@fastify/websocket": "^10.0.1",
    "@fastify/static": "^7.0.4",
    "@prisma/client": "^5.19.1",
    "prisma": "^5.19.1",
    "yt-dlp-exec": "^3.0.5",
    "ws": "^8.18.0",
    "zod": "^3.23.8",
    "fluent-ffmpeg": "^2.1.3"
  },
  "devDependencies": {
    "@types/node": "^20.17.6",
    "@types/ws": "^8.5.13",
    "typescript": "^5.6.3",
    "tsx": "^4.19.1",
    "jest": "^29.7.0",
    "@types/jest": "^29.5.14"
  }
}
```

#### 1.3 Database Schema Migration
```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Artist {
  id        String   @id @default(cuid())
  name      String   @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  albums    Album[]
  tracks    Track[]

  @@map("artists")
}

model Album {
  id          String   @id @default(cuid())
  title       String
  artistId    String
  albumType   AlbumType @default(PLAYLIST)
  youtubeId   String?   @unique
  coverUrl    String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  artist      Artist   @relation(fields: [artistId], references: [id], onDelete: Cascade)
  tracks      Track[]

  @@map("albums")
}

model Track {
  id          String   @id @default(cuid())
  title       String
  artistId    String
  albumId     String
  duration    Int      @default(0)
  filePath    String   @unique
  fileSize    Int      @default(0)
  youtubeId   String?  @unique
  likeability Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  artist      Artist   @relation(fields: [artistId], references: [id], onDelete: Cascade)
  album       Album    @relation(fields: [albumId], references: [id], onDelete: Cascade)

  @@map("tracks")
}

enum AlbumType {
  ALBUM
  PLAYLIST
  SINGLE
}
```

### Phase 2: Core Services Implementation (Week 3-5)

#### 2.1 Download Service Migration
**Objective**: Migrate yt-dlp functionality to TypeScript

**Key Components**:
- **Downloader Service**: Core download logic
- **Queue Management**: Handle concurrent downloads
- **Metadata Extraction**: YouTube metadata parsing
- **File Organization**: Music directory structure

**Implementation**:
```typescript
// src/services/download.service.ts
export class DownloadService {
  private downloadQueue: Map<string, DownloadJob> = new Map();

  async downloadAudio(url: string, options: DownloadOptions): Promise<DownloadResult> {
    // yt-dlp wrapper implementation
    // Metadata extraction
    // File organization
    // Database updates
  }

  async getDownloadProgress(jobId: string): Promise<DownloadProgress> {
    // Progress tracking
  }
}
```

#### 2.2 Playback Service Implementation
**Objective**: Real-time audio playback with WebSocket control

**Key Components**:
- **Audio Streaming**: HTTP range requests for audio files
- **Playback State**: Current track, position, queue
- **Queue Management**: Add, remove, reorder tracks
- **WebSocket Broadcasting**: Real-time state updates

**Implementation**:
```typescript
// src/services/playback.service.ts
export class PlaybackService {
  private currentTrack: Track | null = null;
  private playbackQueue: Track[] = [];
  private websocketClients: Map<string, WebSocket> = new Map();

  async startPlayback(trackId: string): Promise<void> {
    // Load track
    // Start playback
    // Broadcast state to all clients
  }

  async addToQueue(trackId: string): Promise<void> {
    // Add track to queue
    // Update all clients
  }
}
```

#### 2.3 WebSocket Service Implementation
**Objective**: Real-time communication for playback control

**Key Components**:
- **Connection Management**: Client registration/cleanup
- **Message Routing**: Command processing
- **State Synchronization**: Keep clients in sync
- **Heartbeat Monitoring**: Connection health

**Implementation**:
```typescript
// src/services/websocket.service.ts
export class WebSocketService {
  private clients: Map<WebSocket, ClientInfo> = new Map();

  handleConnection(ws: WebSocket, request: FastifyRequest): void {
    // Register client
    // Set up message handlers
    // Start heartbeat
  }

  broadcast(message: WebSocketMessage): void {
    // Send to all connected clients
  }

  private handleMessage(ws: WebSocket, message: WebSocketMessage): void {
    // Process playback commands
    // Update playback service
    // Broadcast state changes
  }
}
```

### Phase 3: API Routes & Integration (Week 6-7)

#### 3.1 REST API Implementation
**Download Routes**:
```typescript
// src/routes/download.routes.ts
export async function downloadRoutes(fastify: FastifyInstance) {
  fastify.post('/download/audio', async (request, reply) => {
    // Download audio endpoint
  });

  fastify.post('/download/playlist', async (request, reply) => {
    // Download playlist endpoint
  });

  fastify.get('/download/progress/:jobId', async (request, reply) => {
    // Get download progress
  });
}
```

**Playback Routes**:
```typescript
// src/routes/playback.routes.ts
export async function playbackRoutes(fastify: FastifyInstance) {
  fastify.get('/tracks', async (request, reply) => {
    // Get all tracks
  });

  fastify.post('/playback/play/:trackId', async (request, reply) => {
    // Start playback
  });

  fastify.post('/playback/queue/add/:trackId', async (request, reply) => {
    // Add to queue
  });
}
```

#### 3.2 Frontend Integration
**Update Frontend API Calls**:
- Update all fetch calls to use new TypeScript endpoints
- Maintain existing WebSocket connection logic
- Update type definitions to match new backend types

### Phase 4: Testing & Optimization (Week 8-9)

#### 4.1 Testing Strategy
**Unit Tests**:
- Service layer testing
- Utility function testing
- Model validation testing

**Integration Tests**:
- API endpoint testing
- Database operation testing
- WebSocket communication testing

**E2E Tests**:
- Complete download workflow
- Playback functionality
- WebSocket real-time features

#### 4.2 Performance Optimization
**Database**:
- Connection pooling configuration
- Query optimization
- Index optimization

**WebSocket**:
- Connection pooling
- Message batching
- Compression

**File System**:
- Streaming for large files
- Caching strategies
- Concurrent download limits

### Phase 5: Deployment & Migration (Week 10-12)

#### 5.1 Deployment Setup
**Docker Configuration**:
```dockerfile
# Dockerfile for TypeScript backend
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

RUN npm run build

EXPOSE 8000

CMD ["npm", "start"]
```

**Environment Configuration**:
```bash
# .env
DATABASE_URL=postgresql://user:password@localhost:5432/music_player
NODE_ENV=production
PORT=8000
CORS_ORIGINS=http://localhost:3000
DOWNLOAD_DIR=/app/music
```

#### 5.2 Data Migration
**Database Migration**:
1. Run Prisma migrations
2. Migrate existing data from Python schema
3. Validate data integrity
4. Update frontend to use new schema

**File System Migration**:
1. Copy existing music files
2. Update file paths in database
3. Validate file accessibility

#### 5.3 Go-Live Plan
**Staged Rollout**:
1. Deploy TypeScript backend alongside Python backend
2. Route subset of traffic to new backend
3. Monitor performance and errors
4. Gradually increase traffic
5. Full cutover and Python backend decommissioning

## Risk Assessment & Mitigation

### High Risk Items
1. **WebSocket Complexity**: Real-time features critical to user experience
   - **Mitigation**: Thorough testing, gradual rollout, fallback mechanisms

2. **Database Migration**: Data integrity and performance
   - **Mitigation**: Comprehensive testing, backup strategy, rollback plan

3. **yt-dlp Integration**: YouTube downloading functionality
   - **Mitigation**: Test all download scenarios, maintain Python fallback

### Medium Risk Items
1. **Type Safety**: Learning curve and initial bugs
   - **Mitigation**: Code reviews, gradual adoption, TypeScript training

2. **Performance**: Node.js vs Python performance characteristics
   - **Mitigation**: Benchmarking, optimization, monitoring

## Success Metrics

### Functional Metrics
- ✅ All download functionality working
- ✅ WebSocket real-time features working
- ✅ Database operations performing well
- ✅ Frontend integration seamless

### Performance Metrics
- 📊 API response times < 100ms
- 📊 WebSocket latency < 50ms
- 📊 Database query performance maintained
- 📊 Memory usage optimized

### Quality Metrics
- 🧪 Test coverage > 80%
- 🐛 Zero critical bugs in production
- 📖 Documentation complete and accurate
- 🚀 Deployment successful with zero downtime

## Rollback Plan

### Database Rollback
1. Restore PostgreSQL backup from before migration
2. Revert to Python backend
3. Update frontend to use old API endpoints
4. Validate functionality

### Code Rollback
1. Keep Python backend deployed but inactive
2. Switch load balancer configuration
3. Roll back frontend changes if needed
4. Monitor for 24 hours

## Timeline Summary

| Phase | Duration | Key Deliverables |
|-------|----------|------------------|
| Foundation | 2 weeks | Project setup, database schema, core dependencies |
| Core Services | 3 weeks | Download service, playback service, WebSocket service |
| API Integration | 2 weeks | REST routes, frontend integration, testing |
| Optimization | 2 weeks | Performance tuning, comprehensive testing |
| Deployment | 3 weeks | Production deployment, data migration, monitoring |

## Team Requirements

### Required Skills
- **TypeScript/Node.js**: Primary development
- **PostgreSQL**: Database design and optimization
- **WebSocket**: Real-time communication
- **yt-dlp**: YouTube integration
- **Docker**: Containerization

### Recommended Team Structure
- **2 Backend Developers**: TypeScript implementation
- **1 Database Specialist**: Schema design and migration
- **1 QA Engineer**: Testing and validation
- **1 DevOps Engineer**: Deployment and monitoring

## Conclusion

This refactor represents a significant investment in 9layer's future architecture. The move to TypeScript will provide:

- **Better type safety** across the entire stack
- **Improved developer experience** with modern tooling
- **Enhanced performance** with Fastify and optimized Node.js
- **Unified technology stack** for easier maintenance
- **Future-proof architecture** ready for scaling

**Success Factors**:
1. Thorough planning and phased approach
2. Comprehensive testing at each stage
3. Gradual rollout with rollback capability
4. Team alignment and clear communication

The recommended approach balances innovation with stability, ensuring the music application continues to deliver value to users throughout the transition.
