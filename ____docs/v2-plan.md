Of course. Here is the full-featured plan with checkboxes for each task and milestone, making it easy to track progress.

### **Product Requirement Document (PRD): MusicPlayer v2**

**1. Overview**

MusicPlayer v2 aims to evolve the existing command-line music player into a full-fledged, modern application with a web-based user interface. The primary goal is to provide a seamless and intuitive user experience for playing and managing a local music library, accessible through a web browser. This will involve refactoring the backend for robustness, creating a comprehensive API, and building a rich, interactive frontend.

**2. Target Audience**

*   **Primary:** Users who want a simple, self-hosted solution for listening to their local music collection from any device on their network.
*   **Secondary:** Developers and tinkerers who appreciate a well-structured, open-source music player they can extend or integrate with other systems.

**3. Key Features**

*   **Backend Refactoring:** A cleaner, more maintainable backend with consolidated modules and clear separation of concerns.
*   **API Layer:** A robust API to control playback, query the music library, and receive real-time updates.
*   **Web-Based UI:** A responsive and modern user interface built with a contemporary framework like React/Next.js.
*   **Core Playback Controls:** Standard controls including play, pause, next, previous, seek, and volume adjustment.
*   **Music Library Management:** The ability to search for tracks by title, artist, or album.
*   **Real-time Synchronization:** The UI should instantly reflect the current playback state.
*   **Deployment and Packaging:** The application will be containerized for easy deployment.

**4. High-Level Goals**

*   **Goal 1: Modernize the application architecture.** Refactor the backend for scalability and maintainability, and introduce a clear API layer.
*   **Goal 2: Deliver a rich user experience.** Create a web-based UI that is intuitive, responsive, and provides all necessary playback controls.
*   **Goal 3: Ensure robust and reliable performance.** The application should be stable, with real-time updates and graceful handling of user interactions.
*   **Goal 4: Simplify deployment and maintenance.** Package the application using Docker for easy setup and deployment.

### **Generated Task List: MusicPlayer v2**

---

### **[x] Phase 0: Repository Hygiene & Backend Preparation**
*   **Milestone:** A clean, well-structured backend codebase ready for new feature development.

*   **[x] Task 0.1: Consolidate Helper Modules**
    *   **Description:** Move `files.py`, `playback.py`, `db.py`, `system.py`, and `ui.py` into a new `musicplayer/helpers/` directory.
    *   **Acceptance Criteria:** All specified files are moved, and the application remains functional after updating all internal imports.

*   **[x] Task 0.2: Establish Project Dependencies**
    *   **Description:** Create a `pyproject.toml` file and a `requirements.txt` with pinned versions of essential libraries (e.g., `sqlalchemy`, `python-dotenv`, `fastapi`).
    *   **Acceptance Criteria:** The `pyproject.toml` and `requirements.txt` files are present and contain the necessary dependencies with specific versions. A virtual environment can be successfully created and all packages installed from this file.

*   **[x] Task 0.3: Expand Unit Test Skeletons**
    *   **Description:** For each helper module, create basic unit test files with placeholder tests for future implementation.
    *   **Acceptance Criteria:** Each helper module has a corresponding test file in the `tests/` directory with at least one placeholder test function.

*   **[x] Task 0.4: Update Documentation**
    *   **Description:** Update the `README.md` file to reflect the new project structure and explain the layout of the `musicplayer/` package.
    *   **Acceptance Criteria:** The `README.md` clearly explains the new directory tree and the purpose of the core modules.

---

### **[x] Phase 1: Service/API Layer**
*   **Milestone:** A functional API server that can handle playback commands and provide state updates.

*   **[x] Task 1.1: Choose and Scaffold an HTTP Server**
    *   **Description:** Initialize a FastAPI application.
    *   **Acceptance Criteria:** A basic FastAPI server is running and accessible.

*   **[x] Task 1.2: Implement Core API Endpoints**
    *   **Description:** Create the following REST endpoints:
        *   `GET /tracks?search=`: To list tracks, supporting searches by album, artist, and title.
        *   `GET /current`: To get the current playback state (track, time, duration, volume, artwork URL).
        *   `POST /command`: To handle commands like play, pause, next, previous, volume set, and seek.
    *   **Acceptance Criteria:** Each endpoint is functional and returns the expected data or performs the specified action.

*   **[x] Task 1.3: Implement Real-Time Event Streaming**
    *   **Description:** Set up a WebSocket channel at `ws://…/events` to stream playback state updates in real-time.
    *   **Acceptance Criteria:** A WebSocket client can connect to the endpoint and receive state change messages when playback is manipulated.

*   **[x] Task 1.4: Refactor MusicPlayer Core Logic**
    *   **Description:** Modify the `MusicPlayer` class to use an in-process message bus for handling commands and state, decoupling it from the API handlers.
    *   **Acceptance Criteria:** API handlers now enqueue commands instead of directly calling `MusicPlayer` methods.

*   **[x] Task 1.5: Configure CORS and Environment Variables**
    *   **Description:** Implement CORS (Cross-Origin Resource Sharing) middleware and configure the application to use a `.env` file for settings like `PORT`, `HOST`, and `STATIC_DIR`.
    *   **Acceptance Criteria:** The API can be called from a different domain (the frontend application), and server configuration is managed through environment variables.

*   **[x] Task 1.6: Add API Endpoint Tests**
    *   **Description:** Write unit tests for each API endpoint using `httpx` and `pytest`.
    *   **Acceptance Criteria:** Tests for all endpoints are implemented and passing, covering success and error cases.

---

### **[x] Phase 2: Next.js/React Front-end Scaffold**
*   **Milestone:** A basic, non-functional frontend application with the core component structure in place.

*   **[x] Task 2.1: Initialize Next.js Application**
    *   **Description:** Use `npx create-next-app` to scaffold a new TypeScript-based Next.js project.
    *   **Acceptance Criteria:** A new Next.js application is created and runnable.

*   **[x] Task 2.2: Define Directory and Component Structure**
    *   **Description:** Create the following directories and empty component files:
        *   `app/`: For pages like `/` (player) and `/search`.
        *   `components/`: `Timeline.tsx`, `SearchBox.tsx`, `AlbumArt.tsx`, `VolumeSlider.tsx`, `Controls.tsx`.
        *   `hooks/`: `usePlayerSocket.ts`, `useKeyboardShortcuts.ts`.
    *   **Acceptance Criteria:** The specified directory and file structure is present in the frontend repository.

*   **[x] Task 2.3: Choose and Configure a Styling Solution**
    *   **Description:** Set up either Tailwind CSS or a CSS-in-JS library like `styled-components`.
    *   **Acceptance Criteria:** The chosen styling solution is configured, and a simple styled element is visible in the application.

---

### **[ ] Phase 3: UI Feature Parity**
*   **Milestone:** A fully functional web UI that can control the backend and accurately reflects its state.

*   **[ ] Task 3.1: Implement the Timeline Component**
    *   **Description:** Build a progress bar that displays `currentTime` and `duration`. It should allow seeking by clicking or dragging.
    *   **Acceptance Criteria:** The timeline visually represents the current track progress and sends a `seek` command to the backend on user interaction.

*   **[ ] Task 3.2: Implement the Search Field Component**
    *   **Description:** Create a search input that queries the `/tracks?search=` endpoint and displays auto-complete results. Pressing Enter on a result should select the track.
    *   **Acceptance Criteria:** The search box fetches and displays results as the user types, and a track can be selected for playback.

*   **[ ] Task 3.3: Implement the Album Art Component**
    *   **Description:** Display the album artwork for the current track.
    *   **Acceptance Criteria:** The `AlbumArt.tsx` component correctly fetches and displays the artwork image.

*   **[ ] Task 3.4: Implement the Volume Slider Component**
    *   **Description:** Create a volume slider that sends a `volume set` command to the backend.
    *   **Acceptance Criteria:** The slider's position is synchronized with the player's volume, and adjustments are sent to the backend.

*   **[ ] Task 3.5: Implement Playback Controls and Keyboard Shortcuts**
    *   **Description:** Build the UI buttons for play/pause, next, previous, mute, and shuffle. Implement keyboard shortcuts using the `useKeyboardShortcuts` hook to trigger the same commands.
    *   **Acceptance Criteria:** All control buttons correctly send commands to the backend. Keyboard shortcuts mirror the functionality of the buttons.

*   **[ ] Task 3.6: Implement Real-time State Synchronization**
    *   **Description:** Use the `usePlayerSocket` hook to connect to the WebSocket and update the React context, ensuring all components re-render with the latest state.
    *   **Acceptance Criteria:** The entire UI (timeline, track info, controls) updates in real-time when the player state changes on the backend.

---

### **[ ] Phase 4: Packaging & Deployment**
*   **Milestone:** The application is containerized and ready for deployment.

*   **[ ] Task 4.1: Set up a Monorepo or Separate Repositories**
    *   **Description:** Decide on a repository structure (monorepo or separate `/backend` and `/frontend` repos) and organize the code accordingly.
    *   **Acceptance Criteria:** The chosen repository structure is implemented.

*   **[ ] Task 4.2: Create Docker Compose Configuration**
    *   **Description:** Write a `docker-compose.yml` file to define two services: `api` (the Python backend) and `web` (the Next.js frontend).
    *   **Acceptance Criteria:** The application can be started with a single `docker-compose up` command, with both services running and communicating.

*   **[ ] Task 4.3: Implement a CI Pipeline**
    *   **Description:** Create a GitHub Actions workflow to run tests, build Docker images, and (optionally) deploy to a hosting provider (e.g., Netlify/Vercel for the web UI, and Fly.io/Render for the API).
    *   **Acceptance Criteria:** The CI pipeline is triggered on pushes to the main branch, and it successfully runs all tests and builds the production Docker images.

---

### **[ ] Phase 5: Stretch Goals & Polish**
*   **Milestone:** Additional features that enhance the user experience and functionality.

*   **[ ] Task 5.1: Implement PWA Features**
    *   **Description:** Add a service worker to enable offline caching of artwork and potentially some track metadata.
    *   **Acceptance Criteria:** The web application can be "installed" on a device and retains some functionality when offline.

*   **[ ] Task 5.2: Add User Authentication**
    *   **Description:** Implement OAuth for user login to enable features like saving favorite tracks.
    *   **Acceptance Criteria:** Users can log in via an OAuth provider.

*   **[ ] Task 5.3: Implement Playlist Management**
    *   **Description:** Allow users to create, save, and share playlists.
    *   **Acceptance Criteria:** Users can create and manage named playlists of tracks.

*   **[ ] Task 5.4: Add UI Themes**
    *   **Description:** Implement dark and light themes for the web UI.
    *   **Acceptance Criteria:** Users can toggle between a light and dark theme.

*   **[ ] Task 5.5: Ensure Graceful CLI Fallback**
    *   **Description:** Verify that the original command-line interface (`musicplayer.cli`) remains functional for headless usage.
    *   **Acceptance Criteria:** The CLI can still be used to control the player.