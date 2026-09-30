# Visual Stopwatch & Game Timer: Architecture & Technical Specification

An offline-capable React (TypeScript) and Capacitor mobile application that acts as an automated stopwatch. The system captures photos of players with usernames printed on their shirts, extracts the text locally using Tesseract.js, reads the native camera shutter timestamp from EXIF metadata, queries the database for the matching player record, updates the corresponding start/end timestamp, and calculates elapsed time.

---

## 1. System Pipeline

```
  [Device Camera Shutter Click]
               │
      ┌────────┴────────┐
      ▼                 ▼
[EXIF Metadata]    [Image File]
      │                 │
      ▼                 ▼
[DateTimeOriginal] [Canvas Preprocessing]
(Source of Truth)  (Grayscale + Thresholding)
      │                 │
      │                 ▼
      │        [Tesseract.js OCR Worker]
      │                 │
      │                 ▼
      │        [Extracted Username String]
      └────────┬────────┘
               ▼
     [Database Query Engine]
  - Query player record by username
  - Update `time_started` if status is CREATED (Start Game)
    or `time_ended` if status is IN_PROGRESS (End Game),
    transitioning status to COMPLETED
  - Compute `time_used = time_ended - time_started`
```

---

## 2. Core Operational Principles

1. **Hardware Shutter Timestamp as Ground Truth:** Never use the processing completion time or database arrival time as the game clock. The capture timestamp (`DateTimeOriginal` / `SubSecTimeOriginal` from EXIF) is the sole authoritative time.
2. **Deterministic Database State Machine:** 
   * **Start Game Mode:** Finds player by username -> verifies status is `CREATED` -> sets `time_started = captureTimestamp` -> transitions status to `IN_PROGRESS`.
   * **End Game Mode:** Finds player by username -> verifies status is `IN_PROGRESS` -> sets `time_ended = captureTimestamp` -> computes `time_used = time_ended - time_started` -> transitions status to `COMPLETED`.
3. **Canvas Preprocessing for Fabric OCR:** Raw phone photos are preprocessed via an offscreen HTML5 `<canvas>` (grayscale conversion, contrast enhancement, binary thresholding) to strip fabric shadows before feeding pixels to Tesseract.js.
4. **Persistent Tesseract Worker:** The OCR worker and English language model are initialized once at application mount to avoid load delays during active game capture.

---

## 3. Technology Stack & Dependencies

| Layer | Dependency | Purpose |
| :--- | :--- | :--- |
| **Framework** | React 19 + TypeScript | UI view layer and component state |
| **Mobile Runtime** | Capacitor 6+ | Native hardware access (iOS / Android) |
| **Camera Access** | `@capacitor/camera` | Fast native shutter launch and local file URI |
| **Metadata Parser** | `exifreader` | Client-side EXIF capture timestamp extraction |
| **OCR Engine** | `tesseract.js` | On-device, 100% offline text extraction |
| **Fuzzy Matching** | `fuzzysort` | Resolves minor OCR character swaps against registered players |
| **Local / Remote DB** | IndexedDB / Supabase / PostgreSQL | Player storage and timing records |

---

## 4. Data Models & TypeScript Interfaces

### 4.1 `Player`
```typescript
export interface Player {
  id: string;               // UUID
  username: string;         // Unique shirt identifier (e.g., "SHADOW_01")
  displayName: string;
  gameId: string;
}
```

### 4.2 `GameSession`
```typescript
export interface GameSession {
  id: string;
  title: string;
  status: 'PENDING' | 'ACTIVE' | 'CONCLUDED';
  createdAt: string;
}
```

### 4.3 `GameTimingRecord`
```typescript
export interface GameTimingRecord {
  id: string;
  gameId: string;
  playerId: string;
  username: string;

  // Timestamps (ISO 8601 strings with millisecond resolution)
  time_started: string | null;
  time_ended: string | null;

  // Computed Duration (time_ended - time_started in milliseconds)
  time_used: number | null;

  status: 'CREATED' | 'IN_PROGRESS' | 'COMPLETED';
  updatedAt: string;
}
```

### 4.4 `CaptureQueueItem`
```typescript
export interface CaptureQueueItem {
  id: string;
  gameId: string;
  action: 'START_GAME' | 'END_GAME';
  imageUri: string;
  captureTimestamp: string;
  detectedText?: string;
  matchedUsername?: string;
  processingState: 'QUEUED' | 'PROCESSING' | 'SUCCESS' | 'ERROR';
  errorMessage?: string;
}
```

---

## 5. Architectural Directory Layout

```
src/
├── components/
│   ├── ShutterButton.tsx           # Primary capture trigger button
│   ├── ModeSelector.tsx            # Toggle between Start Game and End Game
│   ├── TimingSummaryTable.tsx      # Active player times and duration list
│   └── ManualReviewModal.tsx       # Fallback dialog if username is unreadable
├── services/
│   ├── camera.service.ts           # Capacitor camera interface
│   ├── metadata.service.ts         # ExifReader capture timestamp extraction
│   ├── imageProcessor.service.ts   # Canvas grayscale & thresholding filters
│   ├── ocr.service.ts              # Tesseract worker initialization & execution
│   └── database.service.ts         # Player lookup and timestamp update queries
├── utils/
│   ├── timeFormatter.ts            # Milliseconds to HH:MM:SS.mmm converter
│   └── textMatcher.ts              # Fuzzy string matching against player list
├── hooks/
│   ├── useGameStopwatch.ts         # Orchestration hook binding camera -> OCR -> DB
│   └── useTimingRecords.ts         # Reactive state hook for active player records
├── App.tsx
└── main.tsx
```

---

## 6. Implementation Stages

### Stage 1: Native Container & Hardware Shutter Pipeline
* Configure Capacitor project with camera capabilities.
* Set native permissions in iOS (`Info.plist`) and Android (`AndroidManifest.xml`):
  * `NSCameraUsageDescription` / `android.permission.CAMERA`
* Implement `CameraService` using `@capacitor/camera`:
  * Use `CameraSource.Camera` and `CameraResultType.Uri`.
* Implement `MetadataService` using `exifreader`:
  * Load raw blob directly from local device URI.
  * Extract `DateTimeOriginal` or fallback to device system time if EXIF is missing.

### Stage 2: Tesseract Worker & Canvas Image Optimization
* Implement `OcrService`:
  * Create and warm a singleton Tesseract worker on application startup.
  * Configure character whitelisting:
    ```typescript
    await worker.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-',
      tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
    });
    ```
* Implement `ImageProcessorService`:
  * Draw the incoming image onto an offscreen HTML5 `<canvas>`.
  * Traverse `ImageData` to apply high-contrast binarization:
    $$\text{Luminance} = 0.299R + 0.587G + 0.114B$$
  * Convert pixels above threshold to white (`255`), below to black (`0`).
  * Pass processed canvas directly to `worker.recognize(canvas)`.

### Stage 3: Database Query & Timestamp Update Engine
* Implement `DatabaseService`:
  * **Fetch Registered Usernames:** Cache the active game's player username list in memory.
  * **Fuzzy Resolution:** If raw OCR text is `PL4YER1`, match to `PLAYER1` using `fuzzysort`.
  * **Update Query Logic:**
    ```typescript
    async function recordPlayerTimestamp(
      gameId: string,
      username: string,
      timestamp: string,
      action: 'START_GAME' | 'END_GAME'
    ): Promise<GameTimingRecord> {
      // 1. Locate player record
      const player = await db.players.findUnique({ where: { username } });
      if (!player) throw new Error(`Player ${username} not found`);

      // 2. Fetch existing timing record
      let record = await db.timingRecords.findFirst({
        where: { gameId, playerId: player.id },
      });

      if (action === 'START_GAME') {
        // Guard: only allow starting if status is CREATED
        if (record && record.status !== 'CREATED') {
          throw new Error(`Cannot start game for ${username}: status is ${record.status}, expected CREATED`);
        }
        record = await db.timingRecords.upsert({
          where: { gameId_playerId: { gameId, playerId: player.id } },
          create: { gameId, playerId: player.id, username, time_started: timestamp, status: 'IN_PROGRESS' },
          update: { time_started: timestamp, status: 'IN_PROGRESS' },
        });
      } else if (action === 'END_GAME') {
        // Guard: only allow ending if status is IN_PROGRESS
        if (!record || record.status !== 'IN_PROGRESS') {
          throw new Error(`Cannot end game for ${username}: status is ${record?.status ?? 'missing'}, expected IN_PROGRESS`);
        }
        if (!record.time_started) {
          throw new Error(`Cannot end game for ${username}: time_started is missing`);
        }

        const startMs = new Date(record.time_started).getTime();
        const endMs = new Date(timestamp).getTime();
        const time_used = Math.max(0, endMs - startMs);

        record = await db.timingRecords.update({
          where: { id: record.id },
          data: { time_ended: timestamp, time_used, status: 'COMPLETED' },
        });
      }

      return record;
    }
    ```

### Stage 4: Orchestration & UI Construction
* Implement `useGameStopwatch` hook to tie the components together:
  * Manages active mode: `actionType = 'START_GAME' | 'END_GAME'`.
  * `triggerCapture()` executes:
    1. Camera shutter actuation.
    2. Parallel execution: Read EXIF metadata + apply canvas filtering.
    3. Pass processed image to Tesseract OCR worker.
    4. Query database with extracted username and write timestamp.
    5. Return timing record to the UI view.
* Build user interface:
  * Prominent mode switcher (`Start Game` vs. `End Game`).
  * Big touch-friendly shutter trigger button.
  * Live status table listing all players with their respective `time_started`, `time_ended`, and calculated `time_used`.
  * Error boundary modal allowing an operator to manually select a player from a dropdown if the photo was blurry or obscured, locking in the preserved capture timestamp.

---

## 7. Quality Gates & Validation Criteria

| Target Metric | Verification Standard |
| :--- | :--- |
| **Timestamp Integrity** | Recorded timestamp strictly equals the photo's EXIF shutter time, not OCR completion time. |
| **Offline Reliability** | OCR and timestamp calculations run completely without network access. |
| **Worker Latency** | Tesseract recognizes preprocessed single-line text within < 1.5 seconds on mobile. |
| **Database Integrity** | `time_ended` cannot be persisted unless the record status is `IN_PROGRESS` with a validated `time_started`. Start Game is rejected unless status is `CREATED`. |
| **Precision** | `time_used` accurately represents the exact difference between `time_started` and `time_ended` timestamps down to the millisecond. |