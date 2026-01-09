const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const DEVICE = '/dev/video0';

// Telescope-specific presets
const PRESETS = {
  planetary: {
    auto_exposure: 1,
    exposure_time_absolute: 100,
    gain: 200,
    gamma: 100,
    sharpness: 5,
    white_balance_automatic: 0,
    white_balance_temperature: 4600,
    focus_automatic_continuous: 0,
    focus_absolute: 512
  },
  lunar: {
    auto_exposure: 1,
    exposure_time_absolute: 50,
    gain: 100,
    gamma: 90,
    sharpness: 3,
    white_balance_automatic: 0,
    white_balance_temperature: 5000,
    focus_automatic_continuous: 0,
    focus_absolute: 512
  },
  dso: {
    auto_exposure: 1,
    exposure_time_absolute: 5000,
    gain: 800,
    gamma: 150,
    sharpness: 0,
    white_balance_automatic: 0,
    white_balance_temperature: 5500,
    focus_automatic_continuous: 0,
    focus_absolute: 512
  },
  focusing: {
    auto_exposure: 1,
    exposure_time_absolute: 500,
    gain: 400,
    gamma: 110,
    sharpness: 7,
    white_balance_automatic: 1,
    focus_automatic_continuous: 1
  }
};

class V4L2Controller {
  constructor(device = DEVICE) {
    this.device = device;
  }

  async runCommand(cmd) {
    try {
      const { stdout, stderr } = await execAsync(cmd);
      return { stdout: stdout.trim(), stderr: stderr.trim() };
    } catch (error) {
      throw new Error(`Command failed: ${error.message}`);
    }
  }

  async getControls() {
    const { stdout } = await this.runCommand(`v4l2-ctl -d ${this.device} -l`);
    const controls = {};

    const lines = stdout.split('\n');
    for (const line of lines) {
      // Parse lines like: "exposure_time_absolute 0x009a0902 (int)    : min=1 max=10000 step=1 default=156 value=156"
      const match = line.match(/^\s*(\w+)\s+0x[0-9a-f]+\s+\((\w+)\)\s*:\s*(.+)/i);
      if (match) {
        const [, name, type, rest] = match;
        const control = { name, type };

        // Parse attributes
        const minMatch = rest.match(/min=(-?\d+)/);
        const maxMatch = rest.match(/max=(-?\d+)/);
        const stepMatch = rest.match(/step=(\d+)/);
        const defaultMatch = rest.match(/default=(-?\d+)/);
        const valueMatch = rest.match(/value=(-?\d+)/);

        if (minMatch) control.min = parseInt(minMatch[1]);
        if (maxMatch) control.max = parseInt(maxMatch[1]);
        if (stepMatch) control.step = parseInt(stepMatch[1]);
        if (defaultMatch) control.default = parseInt(defaultMatch[1]);
        if (valueMatch) control.value = parseInt(valueMatch[1]);

        controls[name] = control;
      }
    }

    return controls;
  }

  async getControl(name) {
    const { stdout } = await this.runCommand(`v4l2-ctl -d ${this.device} -C ${name}`);
    const match = stdout.match(/(\d+)/);
    return match ? parseInt(match[1]) : null;
  }

  async setControl(name, value) {
    // For exposure, ensure manual mode first
    if (name === 'exposure_time_absolute') {
      await this.runCommand(`v4l2-ctl -d ${this.device} -c auto_exposure=1`);
    }

    // For white balance temperature, ensure manual WB mode first
    if (name === 'white_balance_temperature') {
      await this.runCommand(`v4l2-ctl -d ${this.device} -c white_balance_automatic=0`);
    }

    // For focus absolute, ensure manual focus mode first
    if (name === 'focus_absolute') {
      await this.runCommand(`v4l2-ctl -d ${this.device} -c focus_automatic_continuous=0`);
    }

    await this.runCommand(`v4l2-ctl -d ${this.device} -c ${name}=${value}`);
    return { name, value };
  }

  async applyPreset(presetName) {
    const preset = PRESETS[presetName];
    if (!preset) {
      throw new Error(`Unknown preset: ${presetName}`);
    }

    const results = [];
    for (const [control, value] of Object.entries(preset)) {
      try {
        await this.setControl(control, value);
        results.push({ control, value, success: true });
      } catch (error) {
        results.push({ control, value, success: false, error: error.message });
      }
    }

    return { preset: presetName, results };
  }

  async resetToDefaults() {
    const controls = await this.getControls();
    const results = [];

    for (const [name, control] of Object.entries(controls)) {
      if (control.default !== undefined) {
        try {
          await this.setControl(name, control.default);
          results.push({ name, value: control.default, success: true });
        } catch (error) {
          results.push({ name, success: false, error: error.message });
        }
      }
    }

    return results;
  }

  getPresets() {
    return Object.keys(PRESETS);
  }
}

module.exports = V4L2Controller;
