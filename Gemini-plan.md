# Prompt for Coding Agent: Lightweight Wikimedia Commons Bulk Downloader SPA


Build a robust, lightweight, single-page web application (SPA) to stream media files and metadata from a massive Wikimedia Commons category (up to 500,000+ files) directly to the user's local file system with automatic crash recovery.

Using Wikimedia Commons API's `categorymembers` and its pagination, from a `highapilimit` bot or Oauth consumer, to stream those files into the user's local disk. Assuming disk space is not an issue. If download crash, how to ensure resilience and resumption of downloads at the right pagination ? Assume a SPA front, streaming to the Oauth logged in contributor. 

- Techs: Vue3, Tailwind, Vite, Wikimedia Codex
- Wikimedia API: Wikimedia OAuth2-authentication



## Core Architectural Requirements

1. **Lightweight In-Browser Memory Management (Crucial for 500k files):**
   - **Zero RAM Accumulation:** Do not store file blobs, array buffers, or full JSON responses in global variables or component state arrays. 
   - **Streaming Processing Loop:** Process items one-by-one or in tight, small sequential batches (e.g., concurrency pool of max 3-5 concurrent downloads). Once a file is fetched and written to disk, immediately release its reference for Garbage Collection.

## UI design
   - Setup section :
     - Category management : 
     - Top right: add toggle button "Bot speed : off/on"
   - Downloads sections: 
     - **DOM Virtualization / Lightweight Logging:** Do not render a list of 500k elements in the DOM. Use a rolling text log with filename previous 50 download and next 50, together with a simple text counter display (`Downloaded X of ~500,000 files`) to prevent browser DOM memory exhaustion.
     - Show previous 50 and 50 filenames


2. **API & Paging Strategy:**
   - Use the Wikimedia Action API (`https://commons.wikimedia.org/w/api.php`) via CORS.
   - Query using `action=query`, `generator=categorymembers`, `gcmtype=file`, with `gcmlimit=500` and `prop=imageinfo` (`iiprop=url|size|mime|metadata|user`).
   - Support OAuth 2.0 token injection in request headers for high-limit access.

3. **Local File System Streaming:**
   - Use the modern browser **File System Access API** (`window.showDirectoryPicker()`) to obtain a directory handle.
   - Stream fetched file blobs directly to local files via `FileSystemFileHandle.createWritable()` to bypass browser RAM limits entirely.

4. **Crash Resilience & State Checkpointing:**
   - Every API batch response returns a `continue` object (e.g., `cmcontinue`). 
   - Store the latest `continue` token and processing stats immediately inside **IndexedDB** after every successful batch write.
   - On app startup, automatically check IndexedDB for an active checkpoint. If found, display a "Resume previous download session?" prompt so the user can pick up right where they left off.

## Technical Implementation Details & Hints

- **Rate Limiting / Courtesy Delays:** Implement a configurable delay (e.g., 200–500ms) between file requests to prevent hitting Wikimedia CDN/API rate limits (HTTP 429) or triggering abuse filters.
- **Error Handling & Retries:** Wrap individual file fetch and disk-write operations in `try/catch` blocks with exponential backoff (up to 3 retries) so that a single network drop or corrupt file response does not abort the entire 500k-item job.
- **Metadata Sidecar Option:** Optionally save a small JSON sidecar file alongside each media file containing its author, license, and page description if requested by the user.