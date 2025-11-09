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

  const generateSphereVertices = (subdivisions) => {
    // Start with icosahedron (20-sided die) vertices
    const t = (1 + Math.sqrt(5)) / 2;
    let vertices = [
      [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
      [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
      [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]
    ];
    
    let faces = [
      [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
      [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
      [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
    ];
    
    // Subdivide faces to increase poly count
    for (let sub = 0; sub < subdivisions; sub++) {
      const newFaces = [];
      faces.forEach(([a, b, c]) => {
        const ab = vertices.length;
        const bc = vertices.length + 1;
        const ca = vertices.length + 2;
        
        // Midpoints
        vertices.push([
          (vertices[a][0] + vertices[b][0]) / 2,
          (vertices[a][1] + vertices[b][1]) / 2,
          (vertices[a][2] + vertices[b][2]) / 2
        ]);
        vertices.push([
          (vertices[b][0] + vertices[c][0]) / 2,
          (vertices[b][1] + vertices[c][1]) / 2,
          (vertices[b][2] + vertices[c][2]) / 2
        ]);
        vertices.push([
          (vertices[c][0] + vertices[a][0]) / 2,
          (vertices[c][1] + vertices[a][1]) / 2,
          (vertices[c][2] + vertices[a][2]) / 2
        ]);
        
        // Create 4 new triangles
        newFaces.push([a, ab, ca]);
        newFaces.push([b, bc, ab]);
        newFaces.push([c, ca, bc]);
        newFaces.push([ab, bc, ca]);
      });
      faces = newFaces;
    }
    
    // Normalize to sphere
    vertices = vertices.map(([x, y, z]) => {
      const len = Math.sqrt(x * x + y * y + z * z);
      return [x / len, y / len, z / len];
    });
    
    return { vertices, faces };
  };

    const checkPinch = (hand) => {
      const keypoints = hand.keypoints;
      const thumb = keypoints[4];
      const index = keypoints[8];
      
      const distance = Math.sqrt(
        Math.pow(thumb.x - index.x, 2) +
        Math.pow(thumb.y - index.y, 2)
    );


  const draw3DShape = (ctx, point1, point2) => {
    const centerX = (point1.x + point2.x) / 2;
    const centerY = (point1.y + point2.y) / 2;
    
    const distance = Math.sqrt(
      Math.pow(point2.x - point1.x, 2) +
      Math.pow(point2.y - point1.y, 2)
    );
    
    // Map distance to subdivision level (poly count)
    // Small distance = low poly (tetrahedron/icosahedron)
    // Large distance = high poly sphere
    const minDistance = 100;
    const maxDistance = 500;
    const normalizedDist = Math.max(0, Math.min(1, (distance - minDistance) / (maxDistance - minDistance)));
    
    // 0 subdivisions = 20 faces (icosahedron)
    // 1 subdivision = 80 faces
    // 2 subdivisions = 320 faces
    // 3 subdivisions = 1280 faces
    const subdivisions = Math.floor(normalizedDist * 1);
    
    const size = Math.max(3, distance * 0.25);
    const rotation = performance.now() * 0.01;
    
    // Generate sphere with appropriate poly count
    const { vertices: vertices3D, faces } = generateSphereVertices(subdivisions);
    
    // Project to 2D with rotation
    const vertices2D = vertices3D.map(([x, y, z]) => {
      // Rotate around Y and X axes
      const cosY = Math.cos(rotation);
      const sinY = Math.sin(rotation);
      const cosX = Math.cos(rotation * 0.7);
      const sinX = Math.sin(rotation * 0.7);
      
      // Y-axis rotation
      let rotX = x * cosY - z * sinY;
      let rotZ = x * sinY + z * cosY;
      let rotY = y;
      
      // X-axis rotation
      const finalY = rotY * cosX - rotZ * sinX;
      const finalZ = rotY * sinX + rotZ * cosX;
      
      // Isometric projection
      const projX = centerX + rotX * size;
      const projY = centerY + (finalY * 0.866 + finalZ * 0.5) * size;
      
      return { x: projX, y: projY, z: finalZ };
    });
    
    // Calculate face depths for sorting
    const faceDepths = faces.map(face => {
      const avgZ = face.reduce((sum, i) => sum + vertices2D[i].z, 0) / face.length;
      return { face, avgZ };
    });
    
    // Sort back to front
    faceDepths.sort((a, b) => a.avgZ - b.avgZ);
    
    // Color gradient based on poly count
    const colorMix = normalizedDist;
    const lowPolyColor = { r: 255, g: 100, b: 100 }; // Red for low poly
    const highPolyColor = { r: 100, g: 200, b: 255 }; // Blue for high poly
    
    // Draw faces
    ctx.globalAlpha = 0.4;
    faceDepths.forEach(({ face, avgZ }) => {
      ctx.beginPath();
      ctx.moveTo(vertices2D[face[0]].x, vertices2D[face[0]].y);
      face.forEach(i => {
        ctx.lineTo(vertices2D[i].x, vertices2D[i].y);
      });
      ctx.closePath();
      
      // Gradient color based on poly level and depth
      const r = Math.floor(lowPolyColor.r + (highPolyColor.r - lowPolyColor.r) * colorMix);
      const g = Math.floor(lowPolyColor.g + (highPolyColor.g - lowPolyColor.g) * colorMix);
      const b = Math.floor(lowPolyColor.b + (highPolyColor.b - lowPolyColor.b) * colorMix);
      
      // Lighting based on z-depth
      const brightness = 0.5 + (avgZ + 1) * 0.25;
      ctx.fillStyle = `rgb(${r * brightness}, ${g * brightness}, ${b * brightness})`;
      ctx.fill();
    });
    
    // Draw wireframe edges (only for low poly)
    if (subdivisions <= 1) {
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      
      faceDepths.forEach(({ face }) => {
        ctx.beginPath();
        ctx.moveTo(vertices2D[face[0]].x, vertices2D[face[0]].y);
        face.forEach(i => {
          ctx.lineTo(vertices2D[i].x, vertices2D[i].y);
        });
        ctx.closePath();
        ctx.stroke();
      });
    }
    
    ctx.globalAlpha = 1;
    
    // Draw poly count indicator
    const polyCount = faces.length;
    ctx.fillStyle = '#00ff88';
    ctx.font = '14px monospace';
    ctx.fillText(`${polyCount} faces`, centerX - 40, centerY - size - 20);
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
    //thumb
    [5,1],[1,2],[2,3],[3,4],
    //index
    [0,5],[5,6],[6,7],[7,8],
    //middle
    [0,9],[9,10],[10,11],[11,12],
    //ring
    [0,13],[13,14],[14,15],[15,16],
    //pinky
    [0,17],[17,18],[18,19],[19,20],
    //palm
    [5,9],[9,13],[13,17],[0,5],[0,17]
  ];

  const fingerTips = new Set([4,8,12,16,20]);

  


  const isPinching = checkPinch(hand);
      
  if (isPinching) {
    const thumb = keypoints[4];
    const index = keypoints[8];
    const pinchPoint = {
      x: (thumb.x + index.x) / 2,
      y: (thumb.y + index.y) / 2
    };
    pinchData.push({ handIndex, pinchPoint });
  }


  ctx.strokeStyle = isPinching ? '#00ff00' : handColor;
  ctx.lineWidth = isPinching ? 3 : 2;
  ctx.globalAlpha = isPinching ? 0.4 : 0.2;
  

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
        if (fingerTips.has(i)) continue;
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
        if (!fingerTips.has(i)) continue;
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
