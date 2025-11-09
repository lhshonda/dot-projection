import React, { useRef, useEffect, useState } from 'react';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';
import * as faceLandmarksDetection from '@tensorflow-models/face-landmarks-detection';
import * as handPoseDetection from '@tensorflow-models/hand-pose-detection';

const FaceHandTracker = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  
  const [faceModel, setFaceModel] = useState(null);
  const [handModel, setHandModel] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fps, setFps] = useState(0);
  const [status, setStatus] = useState('Initializing...');
  const [trackingMode, setTrackingMode] = useState('hands');

  const fpsRef = useRef({ frames: 0, lastTime: performance.now() });
  const cubeStateRef = useRef({ visible: false, hand1: null, hand2: null });

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
          refineLandmarks: true,
        }
      );
      console.log('Face mesh loaded!');
      setFaceModel(face);
      
      // Load Hand Tracking
      setStatus('Loading hand tracking model...');
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
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
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
    } catch (err) {
      console.error('Camera error:', err);
      setError(`Camera access denied: ${err.message}`);
    }
  };

  const drawFaceDots = (predictions, ctx) => {
    if (!predictions || predictions.length === 0) {
      return false;
    }

    const keypoints = predictions[0].keypoints;
    
    keypoints.forEach((point, index) => {
      const { x, y, z } = point;
      
      const depth = z ? Math.max(0, Math.min(1, (-z + 50) / 100)) : 0.5;
      const dotSize = 1.1 + depth * 0.2;
      const opacity = 0.7 + depth * 0.3;
      
      let color = '#ffffff';
      
      ctx.globalAlpha = opacity;
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.beginPath();
      ctx.arc(x, y, dotSize, 0, Math.PI * 2);
      ctx.fill();
    });
    
    ctx.globalAlpha = 1;
    
    return true;
  };

  const estimateDepthFromSpread = (hand) => {
    const keypoints = hand.keypoints;
    const thumb = keypoints[4];
    const pinky = keypoints[20];
    
    const spread = Math.sqrt(
      Math.pow(thumb.x - pinky.x, 2) +
      Math.pow(thumb.y - pinky.y, 2)
    );
    
    return spread;
  };

  const checkPinch = (hand) => {
    const keypoints = hand.keypoints;
    const thumb = keypoints[4];
    const index = keypoints[8];
    
    const distance = Math.sqrt(
      Math.pow(thumb.x - index.x, 2) +
      Math.pow(thumb.y - index.y, 2)
    );
    
    const spread = estimateDepthFromSpread(hand);
    
    // Pinch detected if fingers are close and hand is in reasonable size range
    return distance < 40 && spread > 100 && spread < 400;
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
    const minDistance = 8;
    const maxDistance = 10;
    const normalizedDist = Math.max(0, Math.min(1, (distance - minDistance) / (maxDistance - minDistance)));
    
    // 0 subdivisions = 20 faces (icosahedron)
    // 1 subdivision = 80 faces
    // 2 subdivisions = 320 faces
    // 3 subdivisions = 1280 faces
    const subdivisions = Math.floor(normalizedDist * 1.1);
    
    const size = Math.max(3, distance * 0.3);
    const rotation = performance.now() * 0.001;
    
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

  const drawHandDots = (predictions, ctx) => {
    if (!predictions || predictions.length === 0) {
      cubeStateRef.current.visible = false;
      return false;
    }

    const pinchData = [];

    predictions.forEach((hand, handIndex) => {
      const keypoints = hand.keypoints;
      const handColor = '#ffffff';
      const fingerTipColor = handIndex === 0 ? '#00ffff' : '#ffff00';
      const fingerTips = [4, 8, 12, 16, 20];
      
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

      // Draw connections (skeleton)
            const connections = [
        // Thumb
        [5, 1], [1, 2], [2, 3], [3, 4],
        // Index finger
        [0, 5], [5, 6], [6, 7], [7, 8],
        // Middle finger
        [0, 9], [9, 10], [10, 11], [11, 12],
        // Ring finger
        [0, 13], [13, 14], [14, 15], [15, 16],
        // Pinky
        [0, 17], [17, 18], [18, 19], [19, 20],
        // Palm
        [5, 9], [9, 13], [13, 17], [0, 5], [0, 18]
      ];
      
      ctx.strokeStyle = isPinching ? '#00ff00' : handColor;
      ctx.lineWidth = isPinching ? 3 : 2;
      ctx.globalAlpha = isPinching ? 0.4 : 0.2;
      
      connections.forEach(([i, j]) => {
        const point1 = keypoints[i];
        const point2 = keypoints[j];
        
        ctx.beginPath();
        ctx.moveTo(point1.x, point1.y);
        ctx.lineTo(point2.x, point2.y);
        ctx.stroke();
      });
      
      ctx.globalAlpha = 1;
      
      // Draw keypoints
      keypoints.forEach((point, index) => {
        const { x, y } = point;
        const isFingerTip = fingerTips.includes(index);
        const dotSize = isFingerTip ? 6 : 3;
        const color = isFingerTip ? fingerTipColor : handColor;
        
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, dotSize, 0, Math.PI * 2);
        ctx.fill();
      });
      
      // Highlight pinch point
      if (isPinching) {
        const thumb = keypoints[4];
        const index = keypoints[8];
        const px = (thumb.x + index.x) / 2;
        const py = (thumb.y + index.y) / 2;
        
        ctx.fillStyle = '#00ff00';
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.arc(px, py, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    });
    
    // Check if both hands are pinching
    if (pinchData.length === 2) {
      cubeStateRef.current.visible = true;
      cubeStateRef.current.hand1 = pinchData[0].pinchPoint;
      cubeStateRef.current.hand2 = pinchData[1].pinchPoint;
    } else {
      cubeStateRef.current.visible = false;
    }
    
    return true;
  };

  const detect = async () => {
    if (!videoRef.current || videoRef.current.readyState !== 4 || !canvasRef.current) {
      animationRef.current = requestAnimationFrame(detect);
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    try {
      // Clear canvas
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      let faceDetected = false;
      let handsDetected = false;
      let handCount = 0;

      // Face detection
      if (faceModel && (trackingMode === 'face' || trackingMode === 'both')) {
        const facePredictions = await faceModel.estimateFaces(video, {
          flipHorizontal: true,
        });

        if (facePredictions && facePredictions.length > 0) {
          faceDetected = drawFaceDots(facePredictions, ctx);
        }
      }

      // Hand detection
      if (handModel && (trackingMode === 'hands' || trackingMode === 'both')) {
        const handPredictions = await handModel.estimateHands(video, {
          flipHorizontal: true,
        });

        if (handPredictions && handPredictions.length > 0) {
          handsDetected = drawHandDots(handPredictions, ctx);
          handCount = handPredictions.length;
        }
      }

      // Draw 3D shape if both hands are pinching
      if (cubeStateRef.current.visible && cubeStateRef.current.hand1 && cubeStateRef.current.hand2) {
        draw3DShape(ctx, cubeStateRef.current.hand1, cubeStateRef.current.hand2);
      }

      // Update status
      if (trackingMode === 'face') {
        setStatus(faceDetected ? '✓ Tracking face (468 points)' : '✗ No face detected');
      } else if (trackingMode === 'hands') {
        const cubeStatus = cubeStateRef.current.visible ? ' | 🔮 Shape Active' : '';
        setStatus(handsDetected ? `✓ Tracking ${handCount} hand(s)${cubeStatus}` : '✗ No hands detected');
      } else if (trackingMode === 'both') {
        const faceStatus = faceDetected ? 'Face ✓' : 'Face ✗';
        const handStatus = handsDetected ? `Hands ✓ (${handCount})` : 'Hands ✗';
        const cubeStatus = cubeStateRef.current.visible ? ' | 🔮' : '';
        setStatus(`${faceStatus} | ${handStatus}${cubeStatus}`);
      }

      // Show message if nothing detected
      if (!faceDetected && !handsDetected) {
        ctx.fillStyle = '#ff4444';
        ctx.font = '24px Arial';
        ctx.textAlign = 'center';
        
        if (trackingMode === 'face') {
          ctx.fillText('Show your face to camera', canvas.width / 2, canvas.height / 2);
        } else if (trackingMode === 'hands') {
          ctx.fillText('Show your hands to camera', canvas.width / 2, canvas.height / 2);
          ctx.font = '16px Arial';
          ctx.fillText('Pinch both hands to create a 3D shape!', canvas.width / 2, canvas.height / 2 + 30);
          ctx.fillText('Move hands apart to increase detail', canvas.width / 2, canvas.height / 2 + 50);
        } else {
          ctx.fillText('Show face and/or hands to camera', canvas.width / 2, canvas.height / 2);
        }
      }

      // Calculate FPS
      fpsRef.current.frames++;
      const now = performance.now();
      if (now >= fpsRef.current.lastTime + 1000) {
        setFps(Math.round(fpsRef.current.frames * 1000 / (now - fpsRef.current.lastTime)));
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
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    if ((faceModel || handModel) && !isLoading) {
      console.log('Starting detection...');
      detect();
    }
  }, [faceModel, handModel, isLoading, trackingMode]);

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      backgroundColor: '#0a0a0a',
      padding: '20px',
      fontFamily: 'Arial, sans-serif'
    }}>
      
      
      {/* Status Bar */}
      <div style={{ 
        marginBottom: '20px',
        padding: '16px 32px',
        backgroundColor: '#1a1a1a',
        borderRadius: '12px',
        border: `2px solid ${status.includes('✓') ? '#4CAF50' : status.includes('✗') ? '#ff4444' : '#888'}`,
        display: 'flex',
        gap: '30px',
        alignItems: 'center',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
      }}>
        <div style={{ 
          color: status.includes('✓') ? '#4CAF50' : status.includes('✗') ? '#ff4444' : '#888',
          fontWeight: 'bold',
          fontSize: '16px'
        }}>
          {status}
        </div>
        <div style={{ 
          color: '#888', 
          fontSize: '14px',
          borderLeft: '1px solid #333',
          paddingLeft: '30px'
        }}>
          {fps} FPS
        </div>
        <div style={{ 
          color: '#888', 
          fontSize: '14px',
          borderLeft: '1px solid #333',
          paddingLeft: '30px'
        }}>
          Backend: {tf.getBackend ? tf.getBackend() : 'loading'}
        </div>
      </div>

      {/* Mode Selector */}
      <div style={{
        marginBottom: '20px',
        display: 'flex',
        gap: '10px',
        backgroundColor: '#1a1a1a',
        padding: '8px',
        borderRadius: '8px'
      }}>
        {['face', 'hands', 'both'].map(mode => (
          <button
            key={mode}
            onClick={() => setTrackingMode(mode)}
            disabled={isLoading}
            style={{
              padding: '10px 20px',
              backgroundColor: trackingMode === mode ? '#4CAF50' : '#333',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              transition: 'all 0.2s',
              opacity: isLoading ? 0.5 : 1
            }}
          >
            {mode.charAt(0).toUpperCase() + mode.slice(1)}
          </button>
        ))}
      </div>

      {/* Loading State */}
      {isLoading && (
        <div style={{ 
          color: '#ffffff', 
          marginBottom: '20px',
          fontSize: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <div style={{
            width: '20px',
            height: '20px',
            border: '3px solid #333',
            borderTop: '3px solid #4CAF50',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }} />
          Loading models... This may take 20-30 seconds
        </div>
      )}

      {/* Error State */}
      {error && (
        <div style={{ 
          color: '#ff4444', 
          marginBottom: '20px',
          padding: '16px',
          border: '2px solid #ff4444',
          borderRadius: '8px',
          backgroundColor: '#1a0a0a',
          maxWidth: '500px'
        }}>
          <strong>Error:</strong> {error}
        </div>
      )}

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
          maxWidth: '90vw',
          maxHeight: '70vh',
          border: '2px solid #333',
          borderRadius: '12px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
        }}
      />

      {/* Info Panel */}
      <div style={{ 
        color: '#888', 
        marginTop: '30px',
        textAlign: 'center',
        fontSize: '14px',
        maxWidth: '600px',
        lineHeight: '1.6'
      }}>
        <div style={{ 
          backgroundColor: '#1a1a1a',
          padding: '20px',
          borderRadius: '12px',
          marginBottom: '15px',
          border: '2px solid #333'
        }}>
          <strong style={{ color: '#00ff88', fontSize: '16px' }}>🔮 How to use:</strong>
          <div style={{ fontSize: '13px', marginTop: '10px', color: '#aaa' }}>
            1. Show both hands to the camera
            <br />
            2. Make a pinch gesture with <strong>both hands</strong> (thumb + index finger)
            <br />
            3. A low-poly 3D shape will appear!
            <br />
            4. <strong>Move your hands apart</strong> to increase detail and poly count
            <br />
            5. Watch it morph from 20 faces → 1280+ faces
            <br />
            <span style={{ color: '#ff6464' }}>Red = Low poly</span> • <span style={{ color: '#64c8ff' }}>Blue = High poly</span>
          </div>
        </div>
        <p style={{ fontSize: '12px', color: '#555' }}>
          Using MediaPipe Hands with WebGL backend
        </p>
      </div>

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