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
  // Filters for face and hand points
  const faceFiltersRef = useRef(null);     
  const handFiltersRef = useRef({});
  const ctxRef = useRef(null);


  
  // rVFC control
  const frameCallbackRef = useRef(null);
  const isRunningRef = useRef(false);
  const lastInferTimeRef = useRef(0);
  const targetFPS = 30;

  const toProcSize = { w: 320, h: 180 }; // processing resolution

  const [faceModel, setFaceModel] = useState(null);
  const [handModel, setHandModel] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fps, setFps] = useState(0);
  const [status, setStatus] = useState('Initializing...');
  const [trackingMode, setTrackingMode] = useState('face');

  const fpsRef = useRef({ frames: 0, lastTime: performance.now() });

  const loadModels = async () => {
    try {
      setStatus('Loading TensorFlow...');

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

  function ensureFilterPairs(filterArrRef, length, params) {
    if (!filterArrRef.current || filterArrRef.current.length !== length) {
      const arr = new Array(length);
      for (let i = 0; i < length; i++) {
        arr[i] = [new OneEuroFilter(params), new OneEuroFilter(params)];
      }
      filterArrRef.current = arr;
    }
  }

  function ensureHandFilters(handFiltersRef, handIndex, length, params) {
    if (!handFiltersRef.current[handIndex] || handFiltersRef.current[handIndex].length !== length) {
      const arr = new Array(length);
      for (let i = 0; i < length; i++) {
        arr[i] = [new OneEuroFilter(params), new OneEuroFilter(params)];
      }
      handFiltersRef.current[handIndex] = arr;
    }
  }

  const euroParams = { minCutoff: 1.2, beta: 0.02, dCutoff: 1.5 };

  const detect = async () => {
    if (
      !videoRef.current ||
      videoRef.current.readyState !== 4 ||
      !canvasRef.current
    ) {
      animationRef.current = requestAnimationFrame(detect);
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!ctxRef.current) {
      ctxRef.current = canvas.getContext('2d', { alpha: false, desynchronized: true });
    }
    const ctx = ctxRef.current;

    // draw video into the small processing canvas
    const pctx = procCtxRef.current;
    const pcvs = procCanvasRef.current;
    if (pctx && pcvs) {
      pctx.drawImage(video, 0, 0, toProcSize.w, toProcSize.h);
    }

    if (
      canvas.width !== video.videoWidth ||
      canvas.height !== video.videoHeight
    ) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    try {
      const now = performance.now();
      // clear canvas
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      let faceDetected = false;
      let handsDetected = false;
      let handCount = 0;
      
      if (faceModel && (trackingMode === 'face' || trackingMode === 'both')) {
        const facePredictions = await faceModel.estimateFaces(pcvs, { flipHorizontal: true });
        if (facePredictions && facePredictions.length > 0) {
          const raw = facePredictions[0].keypoints;

          ensureFilterPairs(faceFiltersRef, raw.length, euroParams);

          const filtered = raw.map((pt, i) => {
            const [fx, fy] = faceFiltersRef.current[i];
            return {
              x: fx.filter(pt.x, performance.now()),
              y: fy.filter(pt.y, performance.now()),
              z: pt.z,
              score: pt.score,
            };
          });

          faceDetected = drawFaceDots([{ keypoints: filtered }], ctx);
        }
      }


      if (handModel && (trackingMode === 'hands' || trackingMode === 'both')) {
        const handPredictions = await handModel.estimateHands(pcvs, { flipHorizontal: true });
        if (handPredictions && handPredictions.length > 0) {
          const smoothed = handPredictions.map((hand, idx) => {
            ensureHandFilters(handFiltersRef, idx, hand.keypoints.length, euroParams);
            const filtered = hand.keypoints.map((pt, i) => {
              const [fx, fy] = handFiltersRef.current[idx][i];
              return {
                x: fx.filter(pt.x, now),
                y: fy.filter(pt.y, now),
                z: pt.z,
                score: pt.score,
              };
            });
            return { ...hand, keypoints: filtered };
          });

          handsDetected = drawHandDots(smoothed, ctx);
          handCount = smoothed.length;
        }
      }



      // calc fps
      fpsRef.current.frames++;
      if (now >= fpsRef.current.lastTime + 1000) {
        setFps(
          Math.round(
            (fpsRef.current.frames * 1000) / (now - fpsRef.current.lastTime)
          )
        );
        fpsRef.current.frames = 0;
        fpsRef.current.lastTime = now;
      }
    } catch (err) {
      console.error('Detection error:', err);
      setStatus('Detection error');
    }

    animationRef.current = requestAnimationFrame(detect);
  };

  useEffect(() => {
    const init = async () => {
      await startCamera();
      await loadModels();
    };

    init();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      videoRef.current?.srcObject?.getTracks()?.forEach(t => t.stop());
      faceModel?.dispose?.();
      handModel?.dispose?.();
    };    
  }, []);

  useEffect(() => {
    if ((faceModel || handModel) && !isLoading) {
      console.log('Starting detection...');
      detect();
    }
  }, [faceModel, handModel, isLoading, trackingMode]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',

        padding: '20px',
        fontFamily: 'Geo-Regular, sans-serif',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          color: '#ffffff30',
          fontSize: '6px',
        }}
      >
        {fps} FPS
      </div>

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
      <canvas
        ref={canvasRef}
        style={{
          maxWidth: '100vw',
          maxHeight: '100vh',
        }}
      />

      {/* CSS Animation */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default FaceHandTracker;
