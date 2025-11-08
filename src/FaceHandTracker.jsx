import React, { useRef, useEffect, useState } from 'react';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';
import * as faceLandmarksDetection from '@tensorflow-models/face-landmarks-detection';

const FaceHandTracker = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  
  const [faceModel, setFaceModel] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fps, setFps] = useState(0);
  const [status, setStatus] = useState('Initializing...');
  const [trackingMode, setTrackingMode] = useState('face'); // 'face', 'hands', 'both'

  // FPS calculation
  const fpsRef = useRef({ frames: 0, lastTime: performance.now() });

  const loadModels = async () => {
    try {
      setStatus('Loading TensorFlow...');
      
      // Force WebGL backend for better performance
      await tf.setBackend('webgl');
      await tf.ready();
      
      console.log('TensorFlow ready!');
      console.log('Backend:', tf.getBackend());
      console.log('WebGL version:', tf.env().get('WEBGL_VERSION'));
      
      setStatus('Loading face mesh model...');
      
      // Load MediaPipe FaceMesh with optimized settings
      const face = await faceLandmarksDetection.createDetector(
        faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
        {
          runtime: 'mediapipe',
          solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh',
          maxFaces: 1,
          refineLandmarks: true,
        }
      );
      
      console.log('Face mesh loaded successfully!');
      setFaceModel(face);
      setStatus('Models loaded!');
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
            console.log('Camera started:', {
              width: videoRef.current.videoWidth,
              height: videoRef.current.videoHeight
            });
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

  const drawFaceDots = (predictions, ctx, canvas) => {
    if (!predictions || predictions.length === 0) {
      return false;
    }

    const keypoints = predictions[0].keypoints;
    
    // Draw face landmarks
    keypoints.forEach((point, index) => {
      const { x, y, z } = point;
      
      // Use z-depth for visual depth effect
      const depth = z ? Math.max(0, Math.min(1, (-z + 50) / 100)) : 0.5;
      const dotSize = 1.5 + depth * 2; // 1.5-3.5px based on depth
      const opacity = 0.7 + depth * 0.3; // 0.7-1.0 opacity
      
      // Different colors for different facial regions
      let color = '#ffffff';
      
      // Lips (61-80, 308-324, 402-415)
      if ((index >= 61 && index <= 80) || (index >= 308 && index <= 324) || (index >= 402 && index <= 415)) {
        color = '#ff6b6b';
      }
      // Eyes (33, 133, 159, 145, 263, 362, 386, 374)
      else if ([33, 133, 159, 145, 263, 362, 386, 374].includes(index)) {
        color = '#4ecdc4';
      }
      // Eyebrows (46, 52, 65, 55, 276, 282, 295, 285)
      else if ([46, 52, 65, 55, 276, 282, 295, 285].includes(index)) {
        color = '#ffe66d';
      }
      
      ctx.globalAlpha = opacity;
      ctx.fillStyle = color;
      ctx.shadowBlur = 3;
      ctx.shadowColor = color;
      ctx.beginPath();
      ctx.arc(x, y, dotSize, 0, Math.PI * 2);
      ctx.fill();
    });
    
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    
    return true;
  };

  const drawHandDots = (predictions, ctx, canvas) => {
    // Placeholder for future hand tracking
    // Will be implemented when hand tracking is added
    return false;
  };

  const detect = async () => {
    if (!faceModel || !videoRef.current || videoRef.current.readyState !== 4 || !canvasRef.current) {
      animationRef.current = requestAnimationFrame(detect);
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    // Set canvas size to match video
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    try {
      // Clear canvas
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      let detectionMade = false;

      // Face detection
      if (trackingMode === 'face' || trackingMode === 'both') {
        const facePredictions = await faceModel.estimateFaces(video, {
          flipHorizontal: false,
        });

        if (facePredictions && facePredictions.length > 0) {
          detectionMade = drawFaceDots(facePredictions, ctx, canvas);
          setStatus(`✓ Tracking face (${facePredictions[0].keypoints.length} points)`);
        }
      }

      // Hand detection (placeholder for future)
      if (trackingMode === 'hands' || trackingMode === 'both') {
        // Will implement hand tracking here
      }

      if (!detectionMade) {
        setStatus('✗ No face detected');
        ctx.fillStyle = '#ff4444';
        ctx.font = '24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Move closer to camera', canvas.width / 2, canvas.height / 2);
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
      // Cleanup
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (faceModel && !isLoading) {
      console.log('Starting detection loop...');
      detect();
    }
  }, [faceModel, isLoading, trackingMode]);

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
        Face & Hand Tracker
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
            disabled={mode !== 'face'} // Only face works for now
            style={{
              padding: '10px 20px',
              backgroundColor: trackingMode === mode ? '#4CAF50' : '#333',
              color: mode === 'face' ? '#fff' : '#666',
              border: 'none',
              borderRadius: '6px',
              cursor: mode === 'face' ? 'pointer' : 'not-allowed',
              fontSize: '14px',
              fontWeight: '500',
              transition: 'all 0.2s',
              opacity: mode === 'face' ? 1 : 0.5
            }}
          >
            {mode.charAt(0).toUpperCase() + mode.slice(1)}
            {mode !== 'face' && ' (Coming Soon)'}
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
          Loading models... This may take 10-20 seconds
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
        <p style={{ marginBottom: '10px' }}>
          <strong style={{ color: '#4CAF50' }}>Face Tracking:</strong> 468 facial landmarks with depth-based visualization
        </p>
        <p style={{ marginBottom: '10px' }}>
          <strong style={{ color: '#888' }}>Hand Tracking:</strong> Coming soon - will track 21 hand landmarks per hand
        </p>
        <p style={{ fontSize: '12px', color: '#555', marginTop: '15px' }}>
          Using MediaPipe FaceMesh with WebGL backend for optimal performance
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