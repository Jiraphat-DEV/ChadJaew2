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
  // Sliders
  exposure: document.getElementById('exposure'),
  gain: document.getElementById('gain'),
  brightness: document.getElementById('brightness'),
  contrast: document.getElementById('contrast'),
  // Number inputs
  exposureInput: document.getElementById('exposure-input'),
  gainInput: document.getElementById('gain-input'),
  brightnessInput: document.getElementById('brightness-input'),
  contrastInput: document.getElementById('contrast-input'),
  // White Balance
  autoWhiteBalance: document.getElementById('autoWhiteBalance'),
  whiteBalanceTemp: document.getElementById('whiteBalanceTemp'),
  whiteBalanceTempInput: document.getElementById('whiteBalanceTemp-input'),
  wbTempContainer: document.getElementById('wbTempContainer'),
  // Focus
  autoFocus: document.getElementById('autoFocus'),
  focus: document.getElementById('focus'),
  focusInput: document.getElementById('focus-input'),
  focusContainer: document.getElementById('focusContainer'),
  // Binning
  binningToggle: document.getElementById('binningToggle'),
  binningStatus: document.getElementById('binning-status'),
  // Buttons
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
  loadBinningStatus();
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
        const val = controls.exposure_time_absolute.value;
        elements.exposure.min = controls.exposure_time_absolute.min;
        elements.exposure.max = controls.exposure_time_absolute.max;
        elements.exposure.value = val;
        elements.exposureInput.min = controls.exposure_time_absolute.min;
        elements.exposureInput.max = controls.exposure_time_absolute.max;
        elements.exposureInput.value = val;
      }

      if (controls.gain) {
        const val = controls.gain.value;
        elements.gain.min = controls.gain.min;
        elements.gain.max = controls.gain.max;
        elements.gain.value = val;
        elements.gainInput.min = controls.gain.min;
        elements.gainInput.max = controls.gain.max;
        elements.gainInput.value = val;
      }

      if (controls.brightness) {
        const val = controls.brightness.value;
        elements.brightness.min = controls.brightness.min;
        elements.brightness.max = controls.brightness.max;
        elements.brightness.value = val;
        elements.brightnessInput.min = controls.brightness.min;
        elements.brightnessInput.max = controls.brightness.max;
        elements.brightnessInput.value = val;
      }

      if (controls.contrast) {
        const val = controls.contrast.value;
        elements.contrast.min = controls.contrast.min;
        elements.contrast.max = controls.contrast.max;
        elements.contrast.value = val;
        elements.contrastInput.min = controls.contrast.min;
        elements.contrastInput.max = controls.contrast.max;
        elements.contrastInput.value = val;
      }

      // White Balance Controls
      if (controls.white_balance_automatic) {
        const isAuto = controls.white_balance_automatic.value === 1;
        elements.autoWhiteBalance.checked = isAuto;
        elements.wbTempContainer.classList.toggle('disabled', isAuto);
      }

      if (controls.white_balance_temperature) {
        const val = controls.white_balance_temperature.value;
        elements.whiteBalanceTemp.min = controls.white_balance_temperature.min;
        elements.whiteBalanceTemp.max = controls.white_balance_temperature.max;
        elements.whiteBalanceTemp.value = val;
        elements.whiteBalanceTempInput.min = controls.white_balance_temperature.min;
        elements.whiteBalanceTempInput.max = controls.white_balance_temperature.max;
        elements.whiteBalanceTempInput.value = val;
      }

      // Focus Controls
      if (controls.focus_automatic_continuous) {
        const isAuto = controls.focus_automatic_continuous.value === 1;
        elements.autoFocus.checked = isAuto;
        elements.focusContainer.classList.toggle('disabled', isAuto);
      }

      if (controls.focus_absolute) {
        const val = controls.focus_absolute.value;
        elements.focus.min = controls.focus_absolute.min;
        elements.focus.max = controls.focus_absolute.max;
        elements.focus.value = val;
        elements.focusInput.min = controls.focus_absolute.min;
        elements.focusInput.max = controls.focus_absolute.max;
        elements.focusInput.value = val;
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
      elements.exposureInput.value = value;
      break;
    case 'gain':
      elements.gain.value = value;
      elements.gainInput.value = value;
      break;
    case 'brightness':
      elements.brightness.value = value;
      elements.brightnessInput.value = value;
      break;
    case 'contrast':
      elements.contrast.value = value;
      elements.contrastInput.value = value;
      break;
    case 'white_balance_automatic':
      const isAuto = value === 1;
      elements.autoWhiteBalance.checked = isAuto;
      elements.wbTempContainer.classList.toggle('disabled', isAuto);
      break;
    case 'white_balance_temperature':
      elements.whiteBalanceTemp.value = value;
      elements.whiteBalanceTempInput.value = value;
      break;
    case 'focus_automatic_continuous':
      const isAutoFocus = value === 1;
      elements.autoFocus.checked = isAutoFocus;
      elements.focusContainer.classList.toggle('disabled', isAutoFocus);
      break;
    case 'focus_absolute':
      elements.focus.value = value;
      elements.focusInput.value = value;
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

// Binning Control
async function loadBinningStatus() {
  try {
    const data = await api('/stream/binning');
    if (data.success) {
      elements.binningToggle.checked = data.binning;
      updateBinningStatus(data.binning);
    }
  } catch (err) {
    console.error('Failed to load binning status:', err);
  }
}

async function setBinning(enabled) {
  elements.binningToggle.disabled = true;
  elements.binningStatus.textContent = 'Restarting stream...';
  elements.binningStatus.classList.remove('active');

  try {
    const data = await api('/stream/binning', 'POST', { enabled });
    if (data.success) {
      updateBinningStatus(data.binning);
    } else {
      alert('Failed to change binning: ' + data.error);
      elements.binningToggle.checked = !enabled;
    }
  } catch (err) {
    alert('Binning error: ' + err.message);
    elements.binningToggle.checked = !enabled;
  } finally {
    elements.binningToggle.disabled = false;
  }
}

function updateBinningStatus(enabled) {
  if (enabled) {
    elements.binningStatus.textContent = '4x brighter';
    elements.binningStatus.classList.add('active');
  } else {
    elements.binningStatus.textContent = '';
    elements.binningStatus.classList.remove('active');
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
  // Debounce helper
  let debounceTimer;
  const debounce = (fn, delay) => {
    return (...args) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => fn(...args), delay);
    };
  };

  // Control name mapping
  const controlMap = {
    exposure: 'exposure_time_absolute',
    gain: 'gain',
    brightness: 'brightness',
    contrast: 'contrast',
    whiteBalanceTemp: 'white_balance_temperature'
  };

  // Slider event listeners (sync to number input)
  elements.exposure.addEventListener('input', (e) => {
    elements.exposureInput.value = e.target.value;
    debounce(() => setControl('exposure_time_absolute', e.target.value), 100)();
  });

  elements.gain.addEventListener('input', (e) => {
    elements.gainInput.value = e.target.value;
    debounce(() => setControl('gain', e.target.value), 100)();
  });

  elements.brightness.addEventListener('input', (e) => {
    elements.brightnessInput.value = e.target.value;
    debounce(() => setControl('brightness', e.target.value), 100)();
  });

  elements.contrast.addEventListener('input', (e) => {
    elements.contrastInput.value = e.target.value;
    debounce(() => setControl('contrast', e.target.value), 100)();
  });

  elements.whiteBalanceTemp.addEventListener('input', (e) => {
    elements.whiteBalanceTempInput.value = e.target.value;
    debounce(() => setControl('white_balance_temperature', e.target.value), 100)();
  });

  // Number input event listeners (sync to slider)
  elements.exposureInput.addEventListener('change', (e) => {
    const min = parseInt(e.target.min);
    const max = parseInt(e.target.max);
    const value = Math.min(Math.max(parseInt(e.target.value) || min, min), max);
    e.target.value = value;
    elements.exposure.value = value;
    setControl('exposure_time_absolute', value);
  });

  elements.gainInput.addEventListener('change', (e) => {
    const min = parseInt(e.target.min);
    const max = parseInt(e.target.max);
    const value = Math.min(Math.max(parseInt(e.target.value) || min, min), max);
    e.target.value = value;
    elements.gain.value = value;
    setControl('gain', value);
  });

  elements.brightnessInput.addEventListener('change', (e) => {
    const min = parseInt(e.target.min);
    const max = parseInt(e.target.max);
    const value = Math.min(Math.max(parseInt(e.target.value) || 0, min), max);
    e.target.value = value;
    elements.brightness.value = value;
    setControl('brightness', value);
  });

  elements.contrastInput.addEventListener('change', (e) => {
    const min = parseInt(e.target.min);
    const max = parseInt(e.target.max);
    const value = Math.min(Math.max(parseInt(e.target.value) || min, min), max);
    e.target.value = value;
    elements.contrast.value = value;
    setControl('contrast', value);
  });

  elements.whiteBalanceTempInput.addEventListener('change', (e) => {
    const min = parseInt(e.target.min);
    const max = parseInt(e.target.max);
    const value = Math.min(Math.max(parseInt(e.target.value) || min, min), max);
    e.target.value = value;
    elements.whiteBalanceTemp.value = value;
    setControl('white_balance_temperature', value);
  });

  // Quick buttons
  document.querySelectorAll('.quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const control = btn.dataset.control;
      const value = parseInt(btn.dataset.value);

      // Update slider and input
      switch (control) {
        case 'exposure':
          elements.exposure.value = value;
          elements.exposureInput.value = value;
          setControl('exposure_time_absolute', value);
          break;
        case 'gain':
          elements.gain.value = value;
          elements.gainInput.value = value;
          setControl('gain', value);
          break;
        case 'brightness':
          elements.brightness.value = value;
          elements.brightnessInput.value = value;
          setControl('brightness', value);
          break;
        case 'contrast':
          elements.contrast.value = value;
          elements.contrastInput.value = value;
          setControl('contrast', value);
          break;
        case 'whiteBalanceTemp':
          elements.whiteBalanceTemp.value = value;
          elements.whiteBalanceTempInput.value = value;
          setControl('white_balance_temperature', value);
          break;
        case 'focus':
          elements.focus.value = value;
          elements.focusInput.value = value;
          setControl('focus_absolute', value);
          break;
      }
    });
  });

  // White Balance Auto toggle
  elements.autoWhiteBalance.addEventListener('change', async (e) => {
    const isAuto = e.target.checked ? 1 : 0;
    await setControl('white_balance_automatic', isAuto);
    elements.wbTempContainer.classList.toggle('disabled', e.target.checked);
  });

  // Focus Auto toggle
  elements.autoFocus.addEventListener('change', async (e) => {
    const isAuto = e.target.checked ? 1 : 0;
    await setControl('focus_automatic_continuous', isAuto);
    elements.focusContainer.classList.toggle('disabled', e.target.checked);
  });

  // Focus slider
  elements.focus.addEventListener('input', (e) => {
    elements.focusInput.value = e.target.value;
    debounce(() => setControl('focus_absolute', e.target.value), 100)();
  });

  // Focus number input
  elements.focusInput.addEventListener('change', (e) => {
    const min = parseInt(e.target.min);
    const max = parseInt(e.target.max);
    const value = Math.min(Math.max(parseInt(e.target.value) || min, min), max);
    e.target.value = value;
    elements.focus.value = value;
    setControl('focus_absolute', value);
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

  // Binning toggle
  elements.binningToggle.addEventListener('change', (e) => {
    setBinning(e.target.checked);
  });
}
