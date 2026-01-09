const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');

const execAsync = promisify(exec);

const MEDIAMTX_CONFIG = path.join(__dirname, '../../mediamtx.yml');

// FFmpeg command templates
const FFMPEG_BASE = `ffmpeg -f v4l2 -input_format mjpeg`;
const FFMPEG_FLAGS = `-fflags nobuffer+discardcorrupt+flush_packets -flags low_delay -avioflags direct -thread_queue_size 32 -probesize 32 -analyzeduration 0 -i /dev/video0 -an -c:v h264_v4l2m2m -pix_fmt yuv420p -b:v 1200k -g 5 -keyint_min 5 -bf 0 -f rtsp -rtsp_transport tcp rtsp://localhost:$RTSP_PORT/$MTX_PATH`;

const STREAM_CONFIGS = {
  normal: {
    videoSize: '640x480',
    framerate: 30,
    scale: null
  },
  binned: {
    videoSize: '1280x960',
    framerate: 30,
    scale: '640:480:flags=area'  // 2x2 binning via area scaling
  }
};

class StreamService {
  constructor() {
    this.currentMode = 'normal';
  }

  generateFFmpegCommand(mode) {
    const config = STREAM_CONFIGS[mode];
    let cmd = `${FFMPEG_BASE} -video_size ${config.videoSize} -framerate ${config.framerate} ${FFMPEG_FLAGS}`;

    if (config.scale) {
      // Insert scale filter before encoder
      cmd = cmd.replace('-c:v h264_v4l2m2m', `-vf "scale=${config.scale}" -c:v h264_v4l2m2m`);
    }

    return cmd;
  }

  generateConfig(mode) {
    const ffmpegCmd = this.generateFFmpegCommand(mode);

    return `# MediaMTX Configuration for Telescope Camera
# Ultra Low-latency WebRTC streaming - Optimized for Pi 3
# Mode: ${mode}

# Logging
logLevel: warn
logDestinations: [stdout]

# API (for health checks)
api: yes
apiAddress: 127.0.0.1:9997

# WebRTC - Primary streaming protocol (ultra low latency)
webrtc: yes
webrtcAddress: :8889
webrtcAllowOrigins: ['*']
webrtcICEServers2: []

# RTSP - Used internally for capture
rtsp: yes
rtspAddress: :8554

# Minimal buffer settings for lowest latency
readBufferCount: 256
writeQueueSize: 128

# Disable unused protocols
hls: no
srt: no
rtmp: no

# Stream paths
paths:
  telescope:
    runOnInit: >
      ${ffmpegCmd}
    runOnInitRestart: yes
`;
  }

  async setBinning(enabled) {
    const mode = enabled ? 'binned' : 'normal';

    if (mode === this.currentMode) {
      return { success: true, mode, message: 'Already in this mode' };
    }

    try {
      // Generate and write new config
      const config = this.generateConfig(mode);
      fs.writeFileSync(MEDIAMTX_CONFIG, config);

      // Kill current FFmpeg process (mediamtx will restart it with new config)
      try {
        await execAsync('pkill -f "ffmpeg.*video0.*rtsp"');
      } catch (e) {
        // Process might not exist, ignore
      }

      // Brief delay for clean restart
      await new Promise(resolve => setTimeout(resolve, 500));

      this.currentMode = mode;
      return {
        success: true,
        mode,
        binning: enabled,
        message: enabled ? '2x2 binning enabled (4x brighter)' : 'Binning disabled (full resolution)'
      };
    } catch (error) {
      throw new Error(`Failed to set binning: ${error.message}`);
    }
  }

  async getBinningStatus() {
    // Read current config to determine mode
    try {
      const config = fs.readFileSync(MEDIAMTX_CONFIG, 'utf8');
      const isBinned = config.includes('1280x960') && config.includes('scale=');
      this.currentMode = isBinned ? 'binned' : 'normal';

      return {
        success: true,
        binning: isBinned,
        mode: this.currentMode
      };
    } catch (error) {
      return {
        success: false,
        binning: false,
        mode: 'normal',
        error: error.message
      };
    }
  }
}

module.exports = StreamService;
