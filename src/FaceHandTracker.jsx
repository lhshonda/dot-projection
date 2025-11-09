import React, { useRef, useEffect, useState } from 'react';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';
import * as faceLandmarksDetection from '@tensorflow-models/face-landmarks-detection';
import * as handPoseDetection from '@tensorflow-models/hand-pose-detection';

const FaceHandTracker = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const procCanvasRef = useRef(null);
  const procCtxRef = useRef(null);
  const ctxRef = useRef(null);

  const [faceModel, setFaceModel] = useState(null);
  const [handModel, setHandModel] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fps, setFps] = useState(0);
  const [status, setStatus] = useState('Initializing...');
<<<<<<< Updated upstream
  const [trackingMode, setTrackingMode] = useState('face');
=======
>>>>>>> Stashed changes

  const toProcSize = { w: 320, h: 240 };
  const targetFPS = 30;
  const lastInferTimeRef = useRef(0);
  const fpsRef = useRef({ frames: 0, lastTime: performance.now() });

  const faceFiltersRef = useRef(null);
  const tracksRef = useRef([]);
  const nextIdRef = useRef(1);

<<<<<<< Updated upstream
      await tf.setBackend('webgl');
      await tf.ready();

      console.log('TensorFlow ready! Backend:', tf.getBackend());

      // Load Face Mesh
      setStatus('Loading face mesh model...');
      const face = await faceLandmarksDetection.createDetector(
        faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
        {
          runtime: 'mediapipe',
          solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh',
          maxFaces: 1,
          refineLandmarks: false,
        }
      );
      console.log('Face mesh loaded!');
      setFaceModel(face);

      const hand = await handPoseDetection.createDetector(
        handPoseDetection.SupportedModels.MediaPipeHands,
        {
          runtime: 'mediapipe',
          solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/hands',
          modelType: 'lite',
          maxHands: 2,
        }
      );
      console.log('Hand tracking loaded!');
      setHandModel(hand);

      setStatus('All models loaded!');
      setIsLoading(false);
    } catch (err) {
      console.error('Model loading error:', err);
      setError(`Failed to load models: ${err.message}`);
      setIsLoading(false);
    }
  };

  const startCamera = async () => {
    try {
      setStatus('Starting camera...');

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 360 },
          frameRate: { ideal: 30, max: 30 },
          facingMode: 'user',
        },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;

        await new Promise((resolve) => {
          videoRef.current.onloadedmetadata = () => {
            videoRef.current.play();
            console.log('Camera started!');
            resolve();
          };
        });
      }

      setStatus('Camera ready!');

      // Create smaller processing canvas for inference
      if (!procCanvasRef.current) {
        const c = document.createElement('canvas');
        c.width = toProcSize.w;
        c.height = toProcSize.h;
        procCanvasRef.current = c;
        procCtxRef.current = c.getContext('2d');
      }
    } catch (err) {
      console.error('Camera error:', err);
      setError(`Camera access denied: ${err.message}`);
    }
  };

  const drawFaceDots = (predictions, ctx) => {
    if (!predictions || predictions.length === 0) return false;

    // scale from processing canvas → display canvas
    const scale = (p) => ({
      x: (p.x * ctx.canvas.width) / toProcSize.w,
      y: (p.y * ctx.canvas.height) / toProcSize.h,
      z: p.z,
    });

    const keypoints = predictions[0].keypoints;

    // Batch draw for performance
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();

    for (let i = 0; i < keypoints.length; i++) {
      const { x, y, z } = scale(keypoints[i]);
      const depth = z ? Math.max(0, Math.min(1, (-z + 50) / 100)) : 0.5;
      const r = 1.1 + depth * 0.2;

      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }

    ctx.fill();
    ctx.globalAlpha = 1;

    return true;
  };

  const CONNECTIONS = [
    [5,1],[1,2],[2,3],[3,4],
    [0,5],[5,6],[6,7],[7,8],
    [0,9],[9,10],[10,11],[11,12],
    [0,13],[13,14],[14,15],[15,16],
    [0,17],[17,18],[18,19],[19,20],
    [5,9],[9,13],[13,17],[0,5],[0,17]
  ];

  const FINGERTIPS = new Set([4,8,12,16,20]);
  

  const drawHandDots = (predictions, ctx) => {
    if (!predictions || predictions.length === 0) return false;

    // scale from processing canvas → display canvas
    const scale = (p) => ({
      x: (p.x * ctx.canvas.width) / toProcSize.w,
      y: (p.y * ctx.canvas.height) / toProcSize.h,
      z: p.z,
    });

    for (let h = 0; h < predictions.length; h++) {
      // scale once
      const kps = predictions[h].keypoints.map(scale);

      ctx.globalAlpha = 0.25;
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath();
      for (let i = 0; i < CONNECTIONS.length; i++) {
        const [a, b] = CONNECTIONS[i];
        const p1 = kps[a],
          p2 = kps[b];
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      for (let i = 0; i < kps.length; i++) {
        if (FINGERTIPS.has(i)) continue;
        const { x, y } = kps[i];
        const r = 3;
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, Math.PI * 2);
      }
      ctx.fill();

      const tipColor = h === 0 ? '#00ffff' : '#ffff00';
      ctx.fillStyle = tipColor;
      ctx.beginPath();
      for (let i = 0; i < kps.length; i++) {
        if (!FINGERTIPS.has(i)) continue;
        const { x, y } = kps[i];
        const r = 5;
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, Math.PI * 2);
      }
      ctx.fill();
    }

    return true;
  };

    // one euro filter
=======
  // One Euro Filter for smooth tracking
>>>>>>> Stashed changes
  class OneEuroFilter {
    constructor({ minCutoff = 1.0, beta = 0.02, dCutoff = 1.0 } = {}) {
      this.minCutoff = minCutoff;
      this.beta = beta;
      this.dCutoff = dCutoff;
      this.xPrev = null;
      this.dxPrev = 0;
      this.tPrev = null;
    }
    static alpha(cutoff, dt) {
      const tau = 1.0 / (2 * Math.PI * cutoff);
      return 1.0 / (1.0 + tau / dt);
    }
    filter(x, timestamp) {
      if (this.tPrev == null) {
        this.tPrev = timestamp;
        this.xPrev = x;
        return x;
      }
      const dt = Math.max(1e-3, (timestamp - this.tPrev) / 1000.0);
      const dx = (x - this.xPrev) / dt;
      const ad = OneEuroFilter.alpha(this.dCutoff, dt);
      const dxHat = ad * dx + (1 - ad) * this.dxPrev;
      const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
      const a = OneEuroFilter.alpha(cutoff, dt);
      const xHat = a * x + (1 - a) * this.xPrev;
      this.tPrev = timestamp;
      this.xPrev = xHat;
      this.dxPrev = dxHat;
      return xHat;
    }
  }

  const euroParams = { minCutoff: 1.1, beta: 0.01, dCutoff: 1.5 };

  function ensureFilterPairs(filterArrRef, length, params) {
    if (!filterArrRef.current || filterArrRef.current.length !== length) {
      const arr = new Array(length);
      for (let i = 0; i < length; i++) {
        arr[i] = [new OneEuroFilter(params), new OneEuroFilter(params)];
      }
      filterArrRef.current = arr;
    }
  }

  function palmCenter(hand) {
    const idxs = [0, 5, 9, 13, 17];
    let x = 0, y = 0;
    for (const i of idxs) { x += hand.keypoints[i].x; y += hand.keypoints[i].y; }
    x /= idxs.length; y /= idxs.length;
    return { x, y };
  }

  function assignPersistentIds(hands, now) {
    const canvas = canvasRef.current;
    if (!canvas) return [];

    const scale = (p) => ({
      x: (p.x * canvas.width) / toProcSize.w,
      y: (p.y * canvas.height) / toProcSize.h
    });
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const MAX_DIST = Math.max(canvas.width, canvas.height) * 0.08;
    const MAX_MISSES = 6;

    const bySide = { Left: [], Right: [] };
    hands.forEach((h, i) => {
      const side = h.handedness || 'Right';
      bySide[side].push({ i, hand: h });
    });

    const updatedIds = new Set();
    const createdIds = [];

    for (const side of ['Left', 'Right']) {
      const cands = bySide[side];
      if (!cands.length) continue;

      const usedC = new Set();
      const usedT = new Set();

      for (;;) {
        let best = null;
        for (let t = 0; t < tracksRef.current.length; t++) {
          const tr = tracksRef.current[t];
          if (usedT.has(t)) continue;
          if (tr.side !== side) continue;

          const tp = { x: tr.kp0[0], y: tr.kp0[1] };
          for (const cand of cands) {
            if (usedC.has(cand.i)) continue;
            const cp = scale(palmCenter(cand.hand));
            const d = dist(tp, cp);
            if (d <= MAX_DIST && (!best || d < best.d)) best = { t, cand, cp, d };
          }
        }
        if (!best) break;

        const tr = tracksRef.current[best.t];
        tr.idx = best.cand.i;
        tr.kp0 = [best.cp.x, best.cp.y];
        tr.lastSeen = now;
        updatedIds.add(tr.id);
        usedT.add(best.t);
        usedC.add(best.cand.i);
      }

      for (const cand of cands) {
        if (usedC.has(cand.i)) continue;
        const cp = scale(palmCenter(cand.hand));
        const id = nextIdRef.current++;
        tracksRef.current.push({
          id,
          side,
          lastSeen: now,
          kp0: [cp.x, cp.y],
          idx: cand.i,
          filters: new Array(21).fill(0).map(() => [new OneEuroFilter(euroParams), new OneEuroFilter(euroParams)])
        });
        createdIds.push(id);
      }
    }

    tracksRef.current = tracksRef.current.filter(tr => now - tr.lastSeen <= (1000 / targetFPS) * MAX_MISSES);

    const idsToEmit = new Set([...updatedIds, ...createdIds]);
    const out = [];
    for (const tr of tracksRef.current) {
      if (!idsToEmit.has(tr.id)) continue;
      const h = hands[tr.idx];
      if (h) out.push({ ...h, _trackId: tr.id });
    }
    out.sort((a, b) => a._trackId - b._trackId);
    return out;
  }

  // Drawing functions
  const CONNECTIONS = [
    [5,1],[1,2],[2,3],[3,4],
    [0,5],[5,6],[6,7],[7,8],
    [0,9],[9,10],[10,11],[11,12],
    [0,13],[13,14],[14,15],[15,16],
    [0,17],[17,18],[18,19],[19,20],
    [5,9],[9,13],[13,17],[0,5],[0,17]
  ];
  const FINGERTIPS = new Set([4,8,12,16,20]);

  const drawFaceDots = (predictions, ctx) => {
    if (!predictions || predictions.length === 0) return false;

    const scale = (p) => ({
      x: (p.x * ctx.canvas.width) / toProcSize.w,
      y: (p.y * ctx.canvas.height) / toProcSize.h,
      z: p.z,
    });

    const keypoints = predictions[0].keypoints;
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    for (let i = 0; i < keypoints.length; i++) {
      const { x, y, z } = scale(keypoints[i]);
      const depth = z ? Math.max(0, Math.min(1, (-z + 50) / 100)) : 0.5;
      const r = 1.1 + depth * 0.2;
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.globalAlpha = 1;
    return true;
  };

  const drawHandDots = (predictions, ctx) => {
    if (!predictions || predictions.length === 0) return false;
    const scale = (p) => ({
      x: (p.x * ctx.canvas.width) / toProcSize.w,
      y: (p.y * ctx.canvas.height) / toProcSize.h,
      z: p.z,
    });

    for (let h = 0; h < predictions.length; h++) {
      const kps = predictions[h].keypoints.map(scale);

      ctx.globalAlpha = 0.25;
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath();
      for (let i = 0; i < CONNECTIONS.length; i++) {
        const [a, b] = CONNECTIONS[i];
        const p1 = kps[a], p2 = kps[b];
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      for (let i = 0; i < kps.length; i++) {
        if (FINGERTIPS.has(i)) continue;
        const { x, y } = kps[i];
        const r = 3;
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, Math.PI * 2);
      }
      ctx.fill();

      const tipColor = h === 0 ? '#00ffff' : '#ffff00';
      ctx.fillStyle = tipColor;
      ctx.beginPath();
      for (let i = 0; i < kps.length; i++) {
        if (!FINGERTIPS.has(i)) continue;
        const { x, y } = kps[i];
        const r = 5;
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    return true;
  };

  // Main detection loop
  const detect = async () => {
    const now = performance.now();
    if (now - lastInferTimeRef.current < (1000 / targetFPS)) {
      animationRef.current = requestAnimationFrame(detect);
      return;
    }
    lastInferTimeRef.current = now;

    if (!videoRef.current || videoRef.current.readyState !== 4 || !canvasRef.current) {
      animationRef.current = requestAnimationFrame(detect);
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!ctxRef.current) {
      ctxRef.current = canvas.getContext('2d', { alpha: false, desynchronized: true });
      ctxRef.current.imageSmoothingEnabled = false;
    }
    const ctx = ctxRef.current;

<<<<<<< Updated upstream
    // draw video into the small processing canvas
=======
>>>>>>> Stashed changes
    const pctx = procCtxRef.current;
    const pcvs = procCanvasRef.current;
    if (pctx && pcvs) pctx.drawImage(video, 0, 0, toProcSize.w, toProcSize.h);

    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    try {
<<<<<<< Updated upstream
      const now = performance.now();
      // clear canvas
=======
>>>>>>> Stashed changes
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Run both face and hands detection every frame
      if (faceModel && procCanvasRef.current) {
        const facePredictions = await faceModel.estimateFaces(procCanvasRef.current);
        if (facePredictions && facePredictions.length > 0) {
          const raw = facePredictions[0].keypoints;
          ensureFilterPairs(faceFiltersRef, raw.length, euroParams);
          const filtered = raw.map((pt, i) => {
            const [fx, fy] = faceFiltersRef.current[i];
            return { x: fx.filter(pt.x, now), y: fy.filter(pt.y, now), z: pt.z, score: pt.score };
          });
<<<<<<< Updated upstream

          faceDetected = drawFaceDots([{ keypoints: filtered }], ctx);
=======
          drawFaceDots([{ keypoints: filtered }], ctx);
>>>>>>> Stashed changes
        }
      }

      if (handModel && procCanvasRef.current) {
        const handPredictions = await handModel.estimateHands(procCanvasRef.current);
        if (handPredictions && handPredictions.length > 0) {
          const ordered = assignPersistentIds(handPredictions, now);
          const toDraw = ordered.length ? ordered : handPredictions;

          const smoothed = toDraw.map((hand) => {
            const tr = tracksRef.current.find(t => t.id === hand._trackId);
            const filtered = hand.keypoints.map((pt, i) => {
              if (!tr) return pt;
              const [fx, fy] = tr.filters[i];
              return { x: fx.filter(pt.x, now), y: fy.filter(pt.y, now), z: pt.z, score: pt.score };
            });
            return { ...hand, keypoints: filtered };
          });

<<<<<<< Updated upstream
          handsDetected = drawHandDots(smoothed, ctx);
          handCount = smoothed.length;
        }
      }



      // calc fps
=======
          drawHandDots(smoothed, ctx);
        }
      }

      // FPS tracking
>>>>>>> Stashed changes
      fpsRef.current.frames++;
      if (now >= fpsRef.current.lastTime + 1000) {
        setFps(Math.round((fpsRef.current.frames * 1000) / (now - fpsRef.current.lastTime)));
        fpsRef.current.frames = 0;
        fpsRef.current.lastTime = now;
      }
    } catch (err) {
      console.error('Detection error:', err);
      setStatus('Detection error');
    }

    animationRef.current = requestAnimationFrame(detect);
  };

  const startCamera = async () => {
    try {
      setStatus('Starting camera...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 360 },
          frameRate: { ideal: 30, max: 30 },
          facingMode: 'user',
        },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await new Promise((resolve) => {
          videoRef.current.onloadedmetadata = () => { 
            videoRef.current.play(); 
            resolve(); 
          };
        });
      }
      setStatus('Camera ready!');
      if (!procCanvasRef.current) {
        const c = document.createElement('canvas');
        c.width = toProcSize.w;
        c.height = toProcSize.h;
        procCanvasRef.current = c;
        procCtxRef.current = c.getContext('2d');
      }
    } catch (err) {
      console.error('Camera error:', err);
      setError(`Camera access denied: ${err.message}`);
    }
  };

  const loadModels = async () => {
    try {
      setStatus('Loading TensorFlow...');
      await tf.setBackend('webgl');
      await tf.ready();

      setStatus('Loading face model...');
      const face = await faceLandmarksDetection.createDetector(
        faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
        {
          runtime: 'mediapipe',
          solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh',
          maxFaces: 1,
          refineLandmarks: false,
        }
      );
      setFaceModel(face);

      setStatus('Loading hand model...');
      const hand = await handPoseDetection.createDetector(
        handPoseDetection.SupportedModels.MediaPipeHands,
        {
          runtime: 'mediapipe',
          solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/hands',
          modelType: 'full',
          maxHands: 2,
        }
      );
      setHandModel(hand);

      setStatus('Models ready');
      setIsLoading(false);
    } catch (err) {
      console.error('Model loading error:', err);
      setError(`Failed to load models: ${err.message}`);
      setIsLoading(false);
    }
  };

  // Single initialization effect
  useEffect(() => {
    let mounted = true;

    (async () => {
      await startCamera();
      await loadModels();
    })();

    return () => {
      mounted = false;
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(t => t.stop());
      }
      try { faceModel?.dispose?.(); } catch {}
      try { handModel?.dispose?.(); } catch {}
    };
  }, []);

  // Start detection loop once models are loaded
  useEffect(() => {
    if (faceModel && handModel && !isLoading && !animationRef.current) {
      detect();
    }
<<<<<<< Updated upstream
  }, [faceModel, handModel, isLoading, trackingMode]);
=======
  }, [faceModel, handModel, isLoading]);
>>>>>>> Stashed changes

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '20px',
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
        color: '#fff',
        background: '#0a0a0a'
      }}
    >
      <div style={{ position: 'absolute', top: 8, right: 10, fontSize: 10, opacity: 0.6 }}>
        {fps} FPS {error ? ' • ' + error : ''}
      </div>

<<<<<<< Updated upstream
      {/* Mode Selector */}
      <div
        style={{
          marginBottom: '20px',
          display: 'flex',
          gap: '10px',
          backgroundColor: '#ffffff0',
          padding: '8px',
          borderRadius: '8px',
        }}
      >
        {['face', 'hands', 'both'].map((mode) => (
          <button
            key={mode}
            onClick={() => setTrackingMode(mode)}
            disabled={isLoading}
            style={{
              position: 'relative',
              padding: '8px 16px',
              backgroundColor: '#ffffff12',
              color: '#fff',
              border: 'none',
              borderRadius: '0px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              top: '10px',
              gap: '50px',

              fontSize: '12px',
              fontWeight: '500',
              transition: 'all 0.2s',
            }}
          >
            {mode.charAt(0).toUpperCase() + mode.slice(1)}
          </button>
        ))}
      </div>

      {/* Hidden Video Element */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ display: 'none' }}
      />

      {/* Canvas for Drawing */}
=======
      <video ref={videoRef} autoPlay playsInline muted style={{ display: 'none' }} />

>>>>>>> Stashed changes
      <canvas
        ref={canvasRef}
        style={{
          maxWidth: '100vw',
          maxHeight: '100vh',
          transform: 'scaleX(-1)',
          transformOrigin: 'center center',
          borderRadius: 8
        }}
      />
    </div>
  );
};

export default FaceHandTracker;