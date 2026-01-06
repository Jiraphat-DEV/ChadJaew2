// Telescope Camera Control Application
const API_BASE = '/api';
let ws = null;
let isRecording = false;
let recordingTimer = null;
let recordingSeconds = 0;

// DOM Elements
const elements = {
  status: document.getElementById('status'),
  stream: document.getElementById('stream'),
  streamOverlay: document.getElementById('stream-overlay'),
  exposure: document.getElementById('exposure'),
  exposureValue: document.getElementById('exposure-value'),
  gain: document.getElementById('gain'),
  gainValue: document.getElementById('gain-value'),
  brightness: document.getElementById('brightness'),
  brightnessValue: document.getElementById('brightness-value'),
  contrast: document.getElementById('contrast'),
  contrastValue: document.getElementById('contrast-value'),
  btnPhoto: document.getElementById('btn-photo'),
  btnVideo: document.getElementById('btn-video'),
  btnReset: document.getElementById('btn-reset'),
  recordingStatus: document.getElementById('recording-status'),
  recordingTime: document.getElementById('recording-time'),
  gallery: document.getElementById('gallery')
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  initWebSocket();
  loadControls();
  loadCaptures();
  setupEventListeners();
});

// WebSocket
function initWebSocket() {
  const wsUrl = `ws://${window.location.host}/ws`;
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    elements.status.textContent = 'Connected';
    elements.status.classList.add('connected');
    elements.status.classList.remove('error');
  };

  ws.onclose = () => {
    elements.status.textContent = 'Disconnected';
    elements.status.classList.remove('connected');
    elements.status.classList.add('error');
    // Reconnect after 3 seconds
    setTimeout(initWebSocket, 3000);
  };

  ws.onerror = () => {
    elements.status.textContent = 'Connection Error';
    elements.status.classList.add('error');
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    handleWebSocketMessage(msg);
  };
}

function handleWebSocketMessage(msg) {
  switch (msg.type) {
    case 'controlChanged':
      updateControlUI(msg.data.control, msg.data.value);
      break;
    case 'captureComplete':
      loadCaptures();
      break;
    case 'streamError':
      elements.streamOverlay.classList.remove('hidden');
      break;
    case 'streamStopped':
      elements.streamOverlay.classList.remove('hidden');
      break;
  }
}

// API Calls
async function api(endpoint, method = 'GET', body = null) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(`${API_BASE}${endpoint}`, options);
  return res.json();
}

// Load Controls
async function loadControls() {
  try {
    const data = await api('/camera/controls');
    if (data.success && data.controls) {
      const controls = data.controls;

      if (controls.exposure_time_absolute) {
        elements.exposure.min = controls.exposure_time_absolute.min;
        elements.exposure.max = controls.exposure_time_absolute.max;
        elements.exposure.value = controls.exposure_time_absolute.value;
        elements.exposureValue.textContent = controls.exposure_time_absolute.value;
      }

      if (controls.gain) {
        elements.gain.min = controls.gain.min;
        elements.gain.max = controls.gain.max;
        elements.gain.value = controls.gain.value;
        elements.gainValue.textContent = controls.gain.value;
      }

      if (controls.brightness) {
        elements.brightness.min = controls.brightness.min;
        elements.brightness.max = controls.brightness.max;
        elements.brightness.value = controls.brightness.value;
        elements.brightnessValue.textContent = controls.brightness.value;
      }

      if (controls.contrast) {
        elements.contrast.min = controls.contrast.min;
        elements.contrast.max = controls.contrast.max;
        elements.contrast.value = controls.contrast.value;
        elements.contrastValue.textContent = controls.contrast.value;
      }
    }
  } catch (err) {
    console.error('Failed to load controls:', err);
  }
}

// Update Control
async function setControl(name, value) {
  try {
    await api(`/camera/control/${name}`, 'PUT', { value });
  } catch (err) {
    console.error(`Failed to set ${name}:`, err);
  }
}

function updateControlUI(name, value) {
  switch (name) {
    case 'exposure_time_absolute':
      elements.exposure.value = value;
      elements.exposureValue.textContent = value;
      break;
    case 'gain':
      elements.gain.value = value;
      elements.gainValue.textContent = value;
      break;
    case 'brightness':
      elements.brightness.value = value;
      elements.brightnessValue.textContent = value;
      break;
    case 'contrast':
      elements.contrast.value = value;
      elements.contrastValue.textContent = value;
      break;
  }
}

// Apply Preset
async function applyPreset(name) {
  try {
    document.querySelectorAll('.preset-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');

    await api(`/camera/preset/${name}`, 'POST');
    await loadControls();
  } catch (err) {
    console.error('Failed to apply preset:', err);
  }
}

// Capture Photo
async function capturePhoto() {
  elements.btnPhoto.disabled = true;
  elements.btnPhoto.textContent = 'Capturing...';

  try {
    const data = await api('/capture/photo', 'POST');
    if (data.success) {
      loadCaptures();
    } else {
      alert('Photo capture failed: ' + data.error);
    }
  } catch (err) {
    alert('Photo capture error: ' + err.message);
  } finally {
    elements.btnPhoto.disabled = false;
    elements.btnPhoto.textContent = 'Take Photo';
  }
}

// Video Recording
async function toggleRecording() {
  if (isRecording) {
    await stopRecording();
  } else {
    await startRecording();
  }
}

async function startRecording() {
  try {
    const data = await api('/capture/video/start', 'POST');
    if (data.success) {
      isRecording = true;
      recordingSeconds = 0;
      elements.btnVideo.textContent = 'Stop Recording';
      elements.btnVideo.classList.add('recording');
      elements.recordingStatus.classList.remove('hidden');
      updateRecordingTime();
      recordingTimer = setInterval(updateRecordingTime, 1000);
    } else {
      alert('Recording failed: ' + data.error);
    }
  } catch (err) {
    alert('Recording error: ' + err.message);
  }
}

async function stopRecording() {
  try {
    const data = await api('/capture/video/stop', 'POST');
    isRecording = false;
    clearInterval(recordingTimer);
    elements.btnVideo.textContent = 'Start Recording';
    elements.btnVideo.classList.remove('recording');
    elements.recordingStatus.classList.add('hidden');

    if (data.success) {
      loadCaptures();
    }
  } catch (err) {
    alert('Stop recording error: ' + err.message);
  }
}

function updateRecordingTime() {
  recordingSeconds++;
  const mins = Math.floor(recordingSeconds / 60).toString().padStart(2, '0');
  const secs = (recordingSeconds % 60).toString().padStart(2, '0');
  elements.recordingTime.textContent = `${mins}:${secs}`;
}

// Load Captures
async function loadCaptures() {
  try {
    const data = await api('/capture/list');
    if (data.success) {
      renderGallery(data.photos, data.videos);
    }
  } catch (err) {
    console.error('Failed to load captures:', err);
  }
}

function renderGallery(photos, videos) {
  const items = [
    ...photos.map(p => ({ ...p, type: 'photo' })),
    ...videos.map(v => ({ ...v, type: 'video' }))
  ].sort((a, b) => new Date(b.created) - new Date(a.created));

  if (items.length === 0) {
    elements.gallery.innerHTML = '<p class="gallery-empty">No captures yet</p>';
    return;
  }

  elements.gallery.innerHTML = items.map(item => `
    <div class="gallery-item" data-filename="${item.filename}">
      ${item.type === 'video' ? '<span class="video-badge">VIDEO</span>' : ''}
      <img src="${item.type === 'photo' ? `/api/capture/${item.filename}` : '/api/capture/' + item.filename.replace('.mp4', '.jpg')}"
           alt="${item.filename}"
           onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 75%22><rect fill=%22%232d2d2d%22 width=%22100%22 height=%2275%22/><text x=%2250%22 y=%2240%22 text-anchor=%22middle%22 fill=%22%23888%22 font-size=%2210%22>${item.type.toUpperCase()}</text></svg>'">
      <button class="delete-btn" onclick="deleteCapture('${item.filename}', event)">X</button>
    </div>
  `).join('');

  // Add click handlers for viewing
  document.querySelectorAll('.gallery-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('delete-btn')) return;
      const filename = item.dataset.filename;
      window.open(`/api/capture/${filename}`, '_blank');
    });
  });
}

async function deleteCapture(filename, event) {
  event.stopPropagation();
  if (!confirm('Delete this capture?')) return;

  try {
    await api(`/capture/${filename}`, 'DELETE');
    loadCaptures();
  } catch (err) {
    alert('Delete failed: ' + err.message);
  }
}

// Reset to Defaults
async function resetDefaults() {
  if (!confirm('Reset all camera settings to defaults?')) return;

  try {
    await api('/camera/reset', 'POST');
    await loadControls();
    document.querySelectorAll('.preset-btn').forEach(btn => btn.classList.remove('active'));
  } catch (err) {
    alert('Reset failed: ' + err.message);
  }
}

// Event Listeners
function setupEventListeners() {
  // Sliders with debounce
  let debounceTimer;
  const debounce = (fn, delay) => {
    return (...args) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => fn(...args), delay);
    };
  };

  elements.exposure.addEventListener('input', (e) => {
    elements.exposureValue.textContent = e.target.value;
    debounce(() => setControl('exposure_time_absolute', e.target.value), 100)();
  });

  elements.gain.addEventListener('input', (e) => {
    elements.gainValue.textContent = e.target.value;
    debounce(() => setControl('gain', e.target.value), 100)();
  });

  elements.brightness.addEventListener('input', (e) => {
    elements.brightnessValue.textContent = e.target.value;
    debounce(() => setControl('brightness', e.target.value), 100)();
  });

  elements.contrast.addEventListener('input', (e) => {
    elements.contrastValue.textContent = e.target.value;
    debounce(() => setControl('contrast', e.target.value), 100)();
  });

  // Preset buttons
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
  });

  // Capture buttons
  elements.btnPhoto.addEventListener('click', capturePhoto);
  elements.btnVideo.addEventListener('click', toggleRecording);

  // Reset button
  elements.btnReset.addEventListener('click', resetDefaults);
}
