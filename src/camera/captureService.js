const { spawn, exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;
const http = require('http');

const execAsync = promisify(exec);

const CAPTURES_DIR = path.join(__dirname, '../../captures');
const PHOTOS_DIR = path.join(CAPTURES_DIR, 'photos');
const VIDEOS_DIR = path.join(CAPTURES_DIR, 'videos');
const RTSP_URL = 'rtsp://localhost:8554/telescope';
const MEDIAMTX_API = 'http://127.0.0.1:9997/v3/paths/list';
const MIN_DISK_SPACE_MB = 500;

class CaptureService {
  constructor() {
    this.recordingProcess = null;
    this.isRecording = false;
    this.currentVideoFile = null;
    this.recordingStartTime = null;
  }

  async initialize() {
    await fsPromises.mkdir(PHOTOS_DIR, { recursive: true });
    await fsPromises.mkdir(VIDEOS_DIR, { recursive: true });
    console.log('CaptureService initialized - directories ready');
  }

  generateFilename(type, extension) {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return `${type}_${timestamp}.${extension}`;
  }

  async checkStreamHealth(retries = 3, delayMs = 1000) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const ready = await new Promise((resolve, reject) => {
          const req = http.get(MEDIAMTX_API, { timeout: 3000 }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
              try {
                const json = JSON.parse(data);
                const telescopePath = json.items?.find(p => p.name === 'telescope');
                if (telescopePath && telescopePath.ready) {
                  resolve(true);
                } else {
                  resolve(false);
                }
              } catch (e) {
                resolve(false);
              }
            });
          });
          req.on('error', () => resolve(false));
          req.on('timeout', () => {
            req.destroy();
            resolve(false);
          });
        });

        if (ready) {
          return true;
        }

        if (attempt < retries) {
          await new Promise(r => setTimeout(r, delayMs));
        }
      } catch (err) {
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, delayMs));
        }
      }
    }
    return false;
  }

  async checkDiskSpace() {
    try {
      const { stdout } = await execAsync(`df -BM "${CAPTURES_DIR}" | tail -1 | awk '{print $4}'`);
      const availableMB = parseInt(stdout.replace('M', ''), 10);
      return {
        available: availableMB,
        sufficient: availableMB >= MIN_DISK_SPACE_MB
      };
    } catch (err) {
      console.error('Disk space check failed:', err.message);
      return { available: 0, sufficient: false };
    }
  }

  async capturePhoto() {
    const filename = this.generateFilename('photo', 'jpg');
    const filepath = path.join(PHOTOS_DIR, filename);

    const streamReady = await this.checkStreamHealth();
    if (!streamReady) {
      throw new Error('Stream not ready - MediaMTX may be starting up');
    }

    try {
      const { stderr } = await execAsync(
        `ffmpeg -y -rtsp_transport tcp -timeout 6000000 -i "${RTSP_URL}" -frames:v 1 -update 1 -q:v 2 "${filepath}" 2>&1`,
        { timeout: 10000 }
      );

      const stats = await fsPromises.stat(filepath);
      return {
        success: true,
        filename,
        path: filepath,
        size: stats.size,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      // Extract stderr from error if available
      const errorOutput = error.stderr || error.stdout || error.message;
      console.error('Photo capture error:', errorOutput);

      try {
        await fsPromises.unlink(filepath);
      } catch (e) {
        // File may not exist
      }
      throw new Error(`Photo capture failed: ${errorOutput.slice(-200)}`);
    }
  }

  async startRecording() {
    if (this.isRecording) {
      throw new Error('Already recording');
    }

    const streamReady = await this.checkStreamHealth();
    if (!streamReady) {
      throw new Error('Stream not ready - MediaMTX may be starting up');
    }

    const diskSpace = await this.checkDiskSpace();
    if (!diskSpace.sufficient) {
      throw new Error(`Insufficient disk space: ${diskSpace.available}MB available, need ${MIN_DISK_SPACE_MB}MB`);
    }

    const filename = this.generateFilename('video', 'mp4');
    const filepath = path.join(VIDEOS_DIR, filename);

    this.recordingProcess = spawn('ffmpeg', [
      '-rtsp_transport', 'tcp',
      '-timeout', '6000000',
      '-i', RTSP_URL,
      '-c:v', 'copy',
      '-f', 'mp4',
      filepath
    ], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.isRecording = true;
    this.currentVideoFile = filepath;
    this.recordingStartTime = Date.now();

    this.recordingProcess.once('error', (err) => {
      console.error('Recording error:', err);
      this.isRecording = false;
      this.recordingProcess = null;
    });

    this.recordingProcess.once('exit', (code) => {
      if (this.isRecording) {
        console.log(`Recording process exited with code ${code}`);
        this.isRecording = false;
        this.recordingProcess = null;
      }
    });

    this.recordingProcess.stderr.on('data', (data) => {
      const msg = data.toString();
      if (msg.includes('error') || msg.includes('Error')) {
        console.error('FFmpeg stderr:', msg);
      }
    });

    return {
      success: true,
      filename,
      path: filepath,
      startTime: new Date().toISOString(),
      diskSpaceAvailable: diskSpace.available
    };
  }

  async stopRecording() {
    if (!this.isRecording || !this.recordingProcess) {
      throw new Error('Not currently recording');
    }

    return new Promise((resolve, reject) => {
      const filepath = this.currentVideoFile;
      const duration = Math.floor((Date.now() - this.recordingStartTime) / 1000);

      const timeout = setTimeout(() => {
        console.log('Graceful stop timed out, sending SIGTERM');
        if (this.recordingProcess) {
          this.recordingProcess.kill('SIGTERM');
        }
      }, 5000);

      this.recordingProcess.once('exit', async (code, signal) => {
        clearTimeout(timeout);
        this.isRecording = false;
        this.recordingProcess = null;

        console.log(`Recording stopped (code: ${code}, signal: ${signal})`);

        // Wait a moment for file system to sync
        await new Promise(r => setTimeout(r, 500));

        // Retry file stat a few times
        for (let i = 0; i < 3; i++) {
          try {
            const stats = await fsPromises.stat(filepath);
            if (stats.size > 0) {
              resolve({
                success: true,
                filename: path.basename(filepath),
                path: filepath,
                size: stats.size,
                duration,
                endTime: new Date().toISOString()
              });
              return;
            }
          } catch (err) {
            // File not ready yet
          }
          await new Promise(r => setTimeout(r, 300));
        }
        reject(new Error('Video file not found or empty after recording'));
      });

      try {
        if (this.recordingProcess.stdin && this.recordingProcess.stdin.writable) {
          this.recordingProcess.stdin.write('q');
          this.recordingProcess.stdin.end();
        } else {
          console.log('stdin not writable, sending SIGTERM');
          this.recordingProcess.kill('SIGTERM');
        }
      } catch (e) {
        console.error('Error stopping recording gracefully:', e.message);
        this.recordingProcess.kill('SIGTERM');
      }
    });
  }

  getRecordingStatus() {
    if (!this.isRecording) {
      return { isRecording: false };
    }

    return {
      isRecording: true,
      filename: path.basename(this.currentVideoFile),
      duration: Math.floor((Date.now() - this.recordingStartTime) / 1000),
      startTime: new Date(this.recordingStartTime).toISOString()
    };
  }

  async listCaptures(type = 'all') {
    const result = { photos: [], videos: [] };

    if (type === 'all' || type === 'photos') {
      try {
        const photos = await fsPromises.readdir(PHOTOS_DIR);
        const photoStats = await Promise.all(
          photos
            .filter(f => f.endsWith('.jpg'))
            .map(async (filename) => {
              const filepath = path.join(PHOTOS_DIR, filename);
              try {
                const stats = await fsPromises.stat(filepath);
                return {
                  filename,
                  size: stats.size,
                  created: stats.birthtime.toISOString()
                };
              } catch (e) {
                return null;
              }
            })
        );
        result.photos = photoStats
          .filter(p => p !== null)
          .sort((a, b) => new Date(b.created) - new Date(a.created));
      } catch (err) {
        // Directory might not exist yet
      }
    }

    if (type === 'all' || type === 'videos') {
      try {
        const videos = await fsPromises.readdir(VIDEOS_DIR);
        const videoStats = await Promise.all(
          videos
            .filter(f => f.endsWith('.mp4'))
            .map(async (filename) => {
              const filepath = path.join(VIDEOS_DIR, filename);
              try {
                const stats = await fsPromises.stat(filepath);
                return {
                  filename,
                  size: stats.size,
                  created: stats.birthtime.toISOString()
                };
              } catch (e) {
                return null;
              }
            })
        );
        result.videos = videoStats
          .filter(v => v !== null)
          .sort((a, b) => new Date(b.created) - new Date(a.created));
      } catch (err) {
        // Directory might not exist yet
      }
    }

    return result;
  }

  getFilePath(filename) {
    if (filename.startsWith('photo_')) {
      return path.join(PHOTOS_DIR, filename);
    } else if (filename.startsWith('video_')) {
      return path.join(VIDEOS_DIR, filename);
    }
    return null;
  }

  async deleteCapture(filename) {
    const filepath = this.getFilePath(filename);
    if (!filepath) {
      throw new Error('Invalid filename');
    }

    try {
      await fsPromises.access(filepath);
    } catch (e) {
      throw new Error('File not found');
    }

    await fsPromises.unlink(filepath);
    return { success: true, filename };
  }
}

module.exports = CaptureService;
