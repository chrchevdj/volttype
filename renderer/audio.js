/**
 * Audio capture module with Voice Activity Detection (VAD).
 *
 * Features:
 *  - Mic retry if another app has it locked
 *  - Race-condition-safe start/stop via promise queue
 *  - VAD: auto-detect silence and stop recording when user stops talking
 *  - Live audio level reporting for waveform visualization
 */

class AudioCapture {
  constructor() {
    this._mediaRecorder = null;
    this._chunks = [];
    this._stream = null;
    this._isRecording = false;
    this._deviceId = 'default';
    this._startPromise = null;
    this._warmStream = null;    // pre-warmed mic stream for instant start

    // VAD state
    this._audioContext = null;
    this._analyser = null;
    this._vadInterval = null;
    this._silenceStart = 0;
    this._silenceThreshold = 12;     // RMS below this = silence (0-128 scale)
    this._silenceDuration = 1500;    // ms of silence before auto-stop
    this._onSilenceStop = null;      // callback when VAD triggers stop
    this._onAudioLevel = null;       // callback with live audio level (0-100)
    this._hasSpoken = false;         // has the user actually spoken yet?
  }

  async init() {
    try {
      const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      tempStream.getTracks().forEach(t => t.stop());
      return true;
    } catch (err) {
      console.error('[AUDIO] Microphone permission denied:', err);
      return false;
    }
  }

  async getDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices
        .filter(d => d.kind === 'audioinput')
        .map(d => ({
          id: d.deviceId,
          label: d.label || `Microphone ${d.deviceId.slice(0, 8)}`,
        }));
    } catch {
      return [];
    }
  }

  setDevice(deviceId) {
    this._deviceId = deviceId || 'default';
  }

  /**
   * Pre-warm the microphone: acquire a stream and keep it ready.
   * This eliminates the 200-500ms getUserMedia delay on first recording.
   */
  async preWarm() {
    try {
      const constraints = {
        audio: {
          deviceId: this._deviceId !== 'default' ? { exact: this._deviceId } : undefined,
          channelCount: 1,
          sampleRate: 48000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      };
      this._warmStream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('[AUDIO] Mic pre-warmed — ready for instant start');
    } catch (err) {
      console.log('[AUDIO] Pre-warm failed (will acquire on first use):', err.message);
      this._warmStream = null;
    }
  }

  /**
   * Set callbacks for VAD events.
   * @param {Function} onSilenceStop - Called when silence is detected (auto-stop)
   * @param {Function} onAudioLevel - Called with audio level 0-100 for visualization
   */
  setVADCallbacks(onSilenceStop, onAudioLevel) {
    this._onSilenceStop = onSilenceStop;
    this._onAudioLevel = onAudioLevel;
  }

  /**
   * Enable/disable VAD auto-stop.
   */
  setVADEnabled(enabled) {
    this._vadEnabled = enabled;
  }

  async startRecording() {
    if (this._isRecording) return;
    this._startPromise = this._doStart();
    await this._startPromise;
  }

  async _doStart() {
    try {
      const constraints = {
        audio: {
          deviceId: this._deviceId !== 'default' ? { exact: this._deviceId } : undefined,
          channelCount: 1,
          sampleRate: 48000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      };

      // Use pre-warmed stream if available (instant start)
      if (this._warmStream && this._warmStream.active) {
        this._stream = this._warmStream;
        this._warmStream = null;
        console.log('[AUDIO] Using pre-warmed mic stream (instant)');
      } else {
        // Acquire mic fresh — retry if busy
        let retries = 2;
        while (retries > 0) {
          try {
            this._stream = await navigator.mediaDevices.getUserMedia(constraints);
            break;
          } catch (micErr) {
            retries--;
            if (retries > 0) {
              console.log('[AUDIO] Mic busy, retrying in 500ms...');
              await new Promise(r => setTimeout(r, 500));
            } else {
              throw micErr;
            }
          }
        }
      }

      this._chunks = [];

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      this._mediaRecorder = new MediaRecorder(this._stream, {
        mimeType,
        audioBitsPerSecond: 192000,
      });

      this._mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          this._chunks.push(e.data);
        }
      };

      await new Promise((resolve, reject) => {
        this._mediaRecorder.onstart = () => {
          console.log('[AUDIO] MediaRecorder started');
          resolve();
        };
        this._mediaRecorder.onerror = (e) => {
          console.error('[AUDIO] MediaRecorder error:', e);
          reject(new Error('MediaRecorder failed to start'));
        };
        this._mediaRecorder.start(200);
      });

      this._isRecording = true;
      this._hasSpoken = false;
      this._silenceStart = 0;

      // Start VAD — analyze audio levels in real-time
      this._startVAD();

      console.log('[AUDIO] Recording active with VAD');
    } catch (err) {
      console.error('[AUDIO] Failed to start recording:', err);
      this._cleanup();
      throw err;
    }
  }

  /**
   * Start Voice Activity Detection using Web Audio AnalyserNode.
   * Monitors audio levels and auto-stops after sustained silence.
   */
  _startVAD() {
    try {
      this._audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = this._audioContext.createMediaStreamSource(this._stream);
      this._analyser = this._audioContext.createAnalyser();
      this._analyser.fftSize = 512;
      this._analyser.smoothingTimeConstant = 0.3;
      source.connect(this._analyser);

      const dataArray = new Uint8Array(this._analyser.fftSize);

      this._vadInterval = setInterval(() => {
        if (!this._analyser || !this._isRecording) return;

        this._analyser.getByteTimeDomainData(dataArray);

        // Calculate RMS (root mean square) for audio level
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const val = (dataArray[i] - 128); // center around 0
          sum += val * val;
        }
        const rms = Math.sqrt(sum / dataArray.length);

        // Report audio level (0-100 scale) for visualization
        const level = Math.min(100, Math.round(rms * 2.5));
        if (this._onAudioLevel) this._onAudioLevel(level);

        // VAD logic: detect silence
        if (rms < this._silenceThreshold) {
          // Silence detected
          if (this._silenceStart === 0) {
            this._silenceStart = Date.now();
          }
          const silentMs = Date.now() - this._silenceStart;

          // Only auto-stop if user has actually spoken first
          if (this._hasSpoken && silentMs >= this._silenceDuration && this._vadEnabled) {
            console.log(`[VAD] Silence for ${silentMs}ms — auto-stopping`);
            this._stopVAD();
            if (this._onSilenceStop) this._onSilenceStop();
          }
        } else {
          // Sound detected
          this._silenceStart = 0;
          if (rms > 20) this._hasSpoken = true; // Confirm actual speech (not just noise)
        }
      }, 50); // Check every 50ms

    } catch (err) {
      console.error('[VAD] Failed to start:', err);
    }
  }

  _stopVAD() {
    if (this._vadInterval) {
      clearInterval(this._vadInterval);
      this._vadInterval = null;
    }
    if (this._audioContext) {
      try { this._audioContext.close(); } catch {}
      this._audioContext = null;
    }
    this._analyser = null;
  }

  async stopRecording() {
    if (this._startPromise) {
      try {
        await this._startPromise;
      } catch {
        console.log('[AUDIO] Start had failed, nothing to stop');
        this._startPromise = null;
        return null;
      }
      this._startPromise = null;
    }

    if (!this._isRecording || !this._mediaRecorder) {
      console.log('[AUDIO] Not recording, nothing to stop');
      return null;
    }

    this._stopVAD();

    if (this._mediaRecorder.state !== 'recording') {
      console.log('[AUDIO] MediaRecorder not in recording state:', this._mediaRecorder.state);
      this._cleanup();
      return null;
    }

    const hasSpoken = this._hasSpoken;
    return new Promise((resolve) => {
      this._mediaRecorder.onstop = async () => {
        const mimeType = this._mediaRecorder.mimeType;
        const blob = new Blob(this._chunks, { type: mimeType });
        const arrayBuffer = await blob.arrayBuffer();

        console.log(`[AUDIO] Stopped. Captured ${Math.round(arrayBuffer.byteLength / 1024)}KB, ${this._chunks.length} chunks, spoke=${hasSpoken}`);

        this._cleanup();

        // VAD gate: if VAD never saw real speech during the clip, don't send it
        // to Whisper — silent clips cause hallucinations (invented phrases).
        if (!hasSpoken) {
          console.log('[AUDIO] VAD gate: no speech detected, returning empty buffer');
          resolve({ blob, mimeType, arrayBuffer: new ArrayBuffer(0) });
          return;
        }

        resolve({ blob, mimeType, arrayBuffer });
      };

      try { this._mediaRecorder.requestData(); } catch {}
      this._mediaRecorder.stop();
    });
  }

  _cleanup() {
    this._stopVAD();
    if (this._stream) {
      this._stream.getTracks().forEach(t => t.stop());
      this._stream = null;
    }
    this._chunks = [];
    this._isRecording = false;
    this._mediaRecorder = null;

    // Re-warm mic for next recording (non-blocking)
    this.preWarm();
  }

  get isRecording() {
    return this._isRecording;
  }
}

window.audioCapture = new AudioCapture();
