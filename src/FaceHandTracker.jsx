import React, { useRef, useEffect, useState } from 'react';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';
import * as handPoseDetection from '@tensorflow-models/hand-pose-detection';

const FaceHandTracker = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const procCanvasRef = useRef(null);
  const procCtxRef = useRef(null);
  const ctxRef = useRef(null);
  
  // Filters for hand points
  const handFiltersRef = useRef({});

  // Aggressive performance settings
  const toProcSize = { w: 192, h: 108 }; // Reduced further for performance

  const [handModel, setHandModel] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fps, setFps] = useState(0);
  const [status, setStatus] = useState('Initializing...');

  const fpsRef = useRef({ frames: 0, lastTime: performance.now() });
  const lastDetectionRef = useRef(0);
  const TARGET_DETECTION_FPS = 80;
  const detectionInterval = 1000 / TARGET_DETECTION_FPS;

  const loadModels = async () => {
    try {
      setStatus('Loading TensorFlow...');

      await tf.setBackend('webgl');
      await tf.ready();

      console.log('TensorFlow ready! Backend:', tf.getBackend());

      setStatus('Loading hand tracking model...');
      const hand = await handPoseDetection.createDetector(
        handPoseDetection.SupportedModels.MediaPipeHands,
        {
          runtime: 'mediapipe',
          solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/hands',
          modelType: 'full',
          maxHands: 2,
        }
      );
      console.log('Hand tracking loaded!');
      setHandModel(hand);

      setStatus('Model loaded!');
      setIsLoading(false);
    } catch (err) {
      console.error('Model loading error:', err);
      setError(`Failed to load model: ${err.message}`);
      setIsLoading(false);
    }
  };

  const startCamera = async () => {
    try {
      setStatus('Starting camera...');

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1440 },
          height: { ideal: 1080 },
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

      if (!procCanvasRef.current) {
        const c = document.createElement('canvas');
        c.width = toProcSize.w;
        c.height = toProcSize.h;
        procCanvasRef.current = c;
        procCtxRef.current = c.getContext('2d', { 
          alpha: false, 
          willReadFrequently: true 
        });
      }
    } catch (err) {
      console.error('Camera error:', err);
      setError(`Camera access denied: ${err.message}`);
    }
  };

  // Optimized sphere generation with caching
  const sphereCache = useRef({});
  
  const generateSphereVertices = (subdivisions) => {
    // Check cache first
    if (sphereCache.current[subdivisions]) {
      return sphereCache.current[subdivisions];
    }

    // Start with icosahedron
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
    
    // Subdivide faces
    for (let sub = 0; sub < subdivisions; sub++) {
      const newFaces = [];
      faces.forEach(([a, b, c]) => {
        const ab = vertices.length;
        const bc = vertices.length + 1;
        const ca = vertices.length + 2;
        
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
    
    const result = { vertices, faces };
    sphereCache.current[subdivisions] = result;
    return result;
  };

  const checkPinch = (hand) => {
    if (!hand || !hand.keypoints) return false;
    
    const keypoints = hand.keypoints;
    const thumb = keypoints[4];
    const index = keypoints[8];
    
    if (!thumb || !index) return false;
    
    const distance = Math.sqrt(
      Math.pow(thumb.x - index.x, 2) +
      Math.pow(thumb.y - index.y, 2)
    );
    
    // Pinch threshold - adjust as needed
    return distance < 10; // pixels in processing canvas space
  };

  const draw3DShape = (ctx, point1, point2) => {
    const centerX = (point1.x + point2.x) / 2;
    const centerY = (point1.y + point2.y) / 2;
    
    const distance = Math.sqrt(
      Math.pow(point2.x - point1.x, 2) +
      Math.pow(point2.y - point1.y, 2)
    );
    
    // Map distance to subdivision level (limited to 2 max for performance)
    const minDistance = 10;
    const maxDistance = 400;
    const normalizedDist = Math.max(0, Math.min(1, (distance - minDistance) / (maxDistance - minDistance)));
    

    const subdivisions = normalizedDist + 1;
    
    const size = Math.max(20, distance * 0.3);
    const rotation = performance.now() * 0.002;
    
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
    const lowPolyColor = { r: 0, g: 0, b: 0 };
    const highPolyColor = { r: 155, g: 100, b: 255 };
    
    // Draw faces
    ctx.globalAlpha = 1;
    faceDepths.forEach(({ face, avgZ }) => {
      ctx.beginPath();
      ctx.moveTo(vertices2D[face[0]].x, vertices2D[face[0]].y);
      face.forEach(i => {
        ctx.lineTo(vertices2D[i].x, vertices2D[i].y);
      });
      ctx.closePath();
      
      // Gradient color
      const r = Math.floor(lowPolyColor.r + (highPolyColor.r - lowPolyColor.r) * colorMix);
      const g = Math.floor(lowPolyColor.g + (highPolyColor.g - lowPolyColor.g) * colorMix);
      const b = Math.floor(lowPolyColor.b + (highPolyColor.b - lowPolyColor.b) * colorMix);
      
      // Lighting based on z-depth
      const brightness = 0.8 + (avgZ + 1) * 0.25;
      ctx.fillStyle = `rgb(${r * brightness}, ${g * brightness}, ${b * brightness})`;
      ctx.fill();
    });
    
    // Draw wireframe only for low poly
    if (subdivisions <= 1) {
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.1;
      
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
    
    // Draw info
    const polyCount = faces.length;
    ctx.fillStyle = '#ffffff';
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${polyCount} faces`, centerX, centerY - size - 40);
    ctx.fillText(`${Math.round(distance)}px apart`, centerX, centerY + size + 40);
  };

  const CONNECTIONS = [
    [0,1],[1,2],[2,3],[3,4],      // thumb
    [0,5],[5,6],[6,7],[7,8],      // index
    [0,9],[9,10],[10,11],[11,12], // middle
    [0,13],[13,14],[14,15],[15,16], // ring
    [0,17],[17,18],[18,19],[19,20], // pinky
    [5,9],[9,13],[13,17]          // palm
  ];

  const fingerTips = new Set([4, 8, 12, 16, 20]);

  const drawHandDots = (predictions, ctx) => {
    if (!predictions || predictions.length === 0) return { detected: false };

    const scaleX = ctx.canvas.width / toProcSize.w;
    const scaleY = ctx.canvas.height / toProcSize.h;

    const pinchData = [];

    for (let h = 0; h < predictions.length; h++) {
      const hand = predictions[h];
      const kps = hand.keypoints;
      const isPinching = checkPinch(hand);

      // If pinching, record pinch point
      if (isPinching) {
        const thumb = kps[4];
        const index = kps[8];
        const pinchPoint = {
          x: ((thumb.x + index.x) / 2) * scaleX,
          y: ((thumb.y + index.y) / 2) * scaleY
        };
        pinchData.push({ handIndex: h, pinchPoint });
      }

      // Draw connections
      ctx.globalAlpha = isPinching ? 0.5 : 0.3;
      ctx.lineWidth = isPinching ? 3 : 2;
      // ctx.strokeStyle = isPinching ? '#00ff00' : '#ffffff';
      ctx.beginPath();
      // for (let i = 0; i < CONNECTIONS.length; i++) {
      //   const [a, b] = CONNECTIONS[i];
      //   const p1 = kps[a];
      //   const p2 = kps[b];
      //   ctx.moveTo(p1.x * scaleX, p1.y * scaleY);
      //   ctx.lineTo(p2.x * scaleX, p2.y * scaleY);
      // }
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Draw joint points
      ctx.fillStyle = isPinching ? '#00ff00' : '#ffffff';
      ctx.beginPath();
      for (let i = 0; i < kps.length; i++) {
        if (fingerTips.has(i)) continue;
        const x = kps[i].x * scaleX;
        const y = kps[i].y * scaleY;
        const r = isPinching ? 2 : 1;
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, Math.PI * 2);
      }
      ctx.fill();

      // Draw fingertips
      const tipColor = isPinching ? '#ffffff' : (h === 0 ? '#ffffff' : '#ffffff');
      ctx.fillStyle = tipColor;
      // ctx.beginPath();
      for (let i = 0; i < kps.length; i++) {
        if (!fingerTips.has(i)) continue;
        const x = kps[i].x * scaleX;
        const y = kps[i].y * scaleY;
        const r = isPinching ? 7 : 5;
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, Math.PI * 2);
      }
      ctx.fill();
    }

    return { detected: true, pinchData };
  };

  // One Euro Filter for smoothing
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

  function ensureHandFilters(handFiltersRef, handIndex, length, params) {
    if (!handFiltersRef.current[handIndex] || handFiltersRef.current[handIndex].length !== length) {
      const arr = new Array(length);
      for (let i = 0; i < length; i++) {
        arr[i] = [new OneEuroFilter(params), new OneEuroFilter(params)];
      }
      handFiltersRef.current[handIndex] = arr;
    }
  }

  const euroParams = { minCutoff: 1.5, beta: 0.01, dCutoff: 1.0 };

  const detect = async () => {
    if (
      !videoRef.current ||
      videoRef.current.readyState !== 4 ||
      !canvasRef.current
    ) {
      animationRef.current = requestAnimationFrame(detect);
      return;
    }

    const now = performance.now();
    
    // Throttle detection
    if (now - lastDetectionRef.current < detectionInterval) {
      animationRef.current = requestAnimationFrame(detect);
      return;
    }
    lastDetectionRef.current = now;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    if (!ctxRef.current) {
      ctxRef.current = canvas.getContext('2d', { 
        alpha: false, 
        desynchronized: true 
      });
    }
    const ctx = ctxRef.current;

    // Draw video into processing canvas
    const pctx = procCtxRef.current;
    const pcvs = procCanvasRef.current;
    if (pctx && pcvs) {
      pctx.drawImage(video, 0, 0, toProcSize.w, toProcSize.h);
    }

    // Resize canvas if needed
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    try {
      // Clear canvas
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      let pinchData = [];
      
      if (handModel) {
        const handPredictions = await handModel.estimateHands(pcvs, { 
          flipHorizontal: true 
        });
        
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

          const result = drawHandDots(smoothed, ctx);
          if (result.detected) {
            pinchData = result.pinchData;
          }
        }
      }

      // Draw 3D shape if both hands are pinching
      if (pinchData.length === 2) {
        draw3DShape(ctx, pinchData[0].pinchPoint, pinchData[1].pinchPoint);
        
        // Draw connecting line
        // ctx.strokeStyle = '#00ff8880';
        // ctx.lineWidth = 40;
        // ctx.setLineDash([5, 20]);
        // ctx.beginPath();
        // ctx.moveTo(pinchData[0].pinchPoint.x, pinchData[0].pinchPoint.y);
        // ctx.lineTo(pinchData[1].pinchPoint.x, pinchData[1].pinchPoint.y);
        // ctx.stroke();
        // ctx.setLineDash([]);
      }

      // Calculate FPS

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
      handModel?.dispose?.();
      tf.disposeVariables();
    };    
  }, []);

  useEffect(() => {
    if (handModel && !isLoading) {
      console.log('Starting detection...');
      detect();
    }
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [handModel, isLoading]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: '#000',
        padding: '20px',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {/* FPS Counter */}
      <div
        style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          color:'#ffffff',
          fontSize: '8px',
          fontWeight: 'bold',
          backgroundColor: '#00000090',

          borderRadius: '4px',
        }}
      >
        {fps} FPS
      </div>

      {/* Instructions */}
      <div
        style={{
          position: 'absolute',
          top: '10px',
          color: '#ffffff',
          fontSize: '28px',
          fontWeight: 'bold',
          backgroundColor: '#00000090',
        }}
      >
      PINCH  
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
          maxWidth: '100%',
          maxHeight: '100vh',
          objectFit: 'contain',
          borderRadius: '4px',
        }}
      />
    </div>
  );
};

export default FaceHandTracker;