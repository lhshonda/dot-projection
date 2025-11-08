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
          modelType: 'full',
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
    const canvas = ctx.canvas;
    // const centerX = canvas.width / 2;
    // const centerY = canvas.height / 2;
    
    keypoints.forEach((point, index) => {
      const { x, y, z } = point;
      
      const depth = z ? Math.max(0, Math.min(1, (-z + 50) / 100)) : 0.5;
      const dotSize = 1.1 + depth * 0.2;
      const opacity = 0.7 + depth * 0.3;
      
      let color = '#ffffff';
      
      // // Lips
      // if ((index >= 61 && index <= 80) || (index >= 308 && index <= 324) || (index >= 402 && index <= 415)) {
      //   color = '#ff6b6b';
      // } 
      // // Eyes
      // else if ([33, 133, 159, 145, 263, 362, 386, 374].includes(index)) {
      //   color = '#4ecdc4';
      // } 
      // // Eyebrows
      // else if ([46, 52, 65, 55, 276, 282, 295, 285].includes(index)) {
      //   color = '#ffe66d';
      // }
      
      ctx.globalAlpha = opacity;
      ctx.fillStyle = color;
      // ctx.shadowBlur = 3;
      ctx.shadowColor = color;
      ctx.beginPath();
      ctx.arc(x, y, dotSize, 0, Math.PI * 2);
      ctx.fill();
    });
    
    // ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    
    return true;
  };

  const drawHandDots = (predictions, ctx) => {
    if (!predictions || predictions.length === 0) {
      return false;
    }

    predictions.forEach((hand, handIndex) => {
      const keypoints = hand.keypoints;
      
      // Define hand colors (different for left/right)
      // const handColor = handIndex === 0 ? '#00ff88' : '#ff00ff';
      const handColor = handIndex === 0 ? '#ffffff' : '#ffffff';
      const fingerTipColor = handIndex === 0 ? '#00ffff' : '#ffff00';
      
      // Finger tip indices: Thumb=4, Index=8, Middle=12, Ring=16, Pinky=20
      const fingerTips = [4, 8, 12, 16, 20];
      
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
        [5, 9], [9, 13], [13, 17], [0, 5], [0, 17]
      ];
      
      // Draw skeleton lines
      ctx.strokeStyle = handColor;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.2;
      
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
        
        // Finger tips are larger and different color
        const isFingerTip = fingerTips.includes(index);
        const dotSize = isFingerTip ? 5 : 3;
        const color = isFingerTip ? fingerTipColor : handColor;
        // const color = handColor;
        
        ctx.fillStyle = color;
        // ctx.shadowBlur = isFingerTip ? 5 : 3;
        // ctx.shadowColor = color;
        ctx.beginPath();
        ctx.arc(x, y, dotSize, 0, Math.PI * 2);
        ctx.fill();
      });
      
      // ctx.shadowBlur = 8;
    });
    
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
      ctx.fillStyle = '#0a0a0a';
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

      // Update status
      if (trackingMode === 'face') {
        setStatus(faceDetected ? '✓ Tracking face (468 points)' : '✗ No face detected');
      } else if (trackingMode === 'hands') {
        setStatus(handsDetected ? `✓ Tracking ${handCount} hand(s) (21 points each)` : '✗ No hands detected');
      } else if (trackingMode === 'both') {
        const faceStatus = faceDetected ? 'Face ✓' : 'Face ✗';
        const handStatus = handsDetected ? `Hands ✓ (${handCount})` : 'Hands ✗';
        setStatus(`${faceStatus} | ${handStatus}`);
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
      <h1 style={{ 
        color: '#ffffff', 
        marginBottom: '20px',
        fontSize: '32px',
        fontWeight: '300',
        letterSpacing: '2px'
      }}>

      </h1>
      
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
        <div style={{ display: 'flex', gap: '40px', justifyContent: 'center', marginBottom: '15px' }}>
          <div>
            <strong style={{ color: '#4CAF50' }}>Face Mode:</strong>
            <div style={{ fontSize: '12px', marginTop: '5px' }}>
              468 facial landmarks
              <br />
              <span style={{ color: '#ff6b6b' }}>Red</span> = Lips | 
              <span style={{ color: '#4ecdc4' }}> Cyan</span> = Eyes | 
              <span style={{ color: '#ffe66d' }}> Yellow</span> = Eyebrows
            </div>
          </div>
          <div>
            <strong style={{ color: '#00ff88' }}>Hand Mode:</strong>
            <div style={{ fontSize: '12px', marginTop: '5px' }}>
              21 landmarks per hand (max 2)
              <br />
              <span style={{ color: '#00ffff' }}>Cyan</span> / <span style={{ color: '#ffff00' }}>Yellow</span> = Finger tips
            </div>
          </div>
        </div>
        <p style={{ fontSize: '12px', color: '#555' }}>
          Using MediaPipe Face Mesh + MediaPipe Hands with WebGL backend
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