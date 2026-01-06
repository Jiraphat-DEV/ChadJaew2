const express = require('express');
const path = require('path');
const fs = require('fs');
const V4L2Controller = require('../camera/v4l2Controller');
const CaptureService = require('../camera/captureService');

const router = express.Router();
const camera = new V4L2Controller();
const capture = new CaptureService();

// Initialize capture service directories
capture.initialize().catch(err => {
  console.error('Failed to initialize CaptureService in routes:', err.message);
});

// Camera Controls
router.get('/camera/controls', async (req, res) => {
  try {
    const controls = await camera.getControls();
    res.json({ success: true, controls });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/camera/control/:name', async (req, res) => {
  try {
    const value = await camera.getControl(req.params.name);
    res.json({ success: true, name: req.params.name, value });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/camera/control/:name', async (req, res) => {
  try {
    const { value } = req.body;
    if (value === undefined) {
      return res.status(400).json({ success: false, error: 'Value required' });
    }
    const result = await camera.setControl(req.params.name, parseInt(value));
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/camera/presets', (req, res) => {
  res.json({ success: true, presets: camera.getPresets() });
});

router.post('/camera/preset/:name', async (req, res) => {
  try {
    const result = await camera.applyPreset(req.params.name);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/camera/reset', async (req, res) => {
  try {
    const results = await camera.resetToDefaults();
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Capture
router.post('/capture/photo', async (req, res) => {
  try {
    const result = await capture.capturePhoto();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/capture/video/start', async (req, res) => {
  try {
    const result = await capture.startRecording();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/capture/video/stop', async (req, res) => {
  try {
    const result = await capture.stopRecording();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/capture/video/status', (req, res) => {
  res.json(capture.getRecordingStatus());
});

router.get('/capture/list', async (req, res) => {
  try {
    const type = req.query.type || 'all';
    const result = await capture.listCaptures(type);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/capture/:filename', (req, res) => {
  const filepath = capture.getFilePath(req.params.filename);
  if (!filepath || !fs.existsSync(filepath)) {
    return res.status(404).json({ success: false, error: 'File not found' });
  }
  res.sendFile(filepath);
});

router.delete('/capture/:filename', async (req, res) => {
  try {
    const result = await capture.deleteCapture(req.params.filename);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Stream status
router.get('/stream/status', async (req, res) => {
  try {
    const response = await fetch('http://127.0.0.1:9997/v3/paths/list');
    const data = await response.json();
    res.json({ success: true, paths: data.items });
  } catch (error) {
    res.json({ success: false, error: 'MediaMTX not responding' });
  }
});

module.exports = router;
