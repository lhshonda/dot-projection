import React, { useRef, useEffect, useState } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as faceLandmarksDetection from '@tensorflow-models/face-landmarks-detection';

const ModelTest = () => {
  // Camera state
  const videoRef = useRef(null);
  const [error, setError] = useState(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  
  // Model state
  const [model, setModel] = useState(null);
  const [isModelLoading, setIsModelLoading] = useState(true);

  // Load the AI model
  const loadModel = async () => {
    try {
      console.log('Loading TensorFlow model...');
      
      // 1. Make sure TensorFlow is ready
      await tf.ready();
      console.log('TensorFlow ready!');
      
      // 2. Create the face mesh detector
      const loadedModel = await faceLandmarksDetection.createDetector(
        faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
        {
          runtime: 'tfjs',
          refineLandmarks: true,
        }
      );
      
      console.log('Face mesh model loaded!');
      
      // 3. Save it to state
      setModel(loadedModel);
      setIsModelLoading(false);
    } catch (err) {
      console.error('Model loading error:', err);
      setError('Failed to load AI model: ' + err.message);
      setIsModelLoading(false);
    }
  };

  // Start camera
  const startCamera = async () => {
    try {
      console.log('Requesting camera access...');
      
      // Request camera access
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: 640, 
          height: 480 
        },
        audio: false,
      });
      
      // Connect stream to video element
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
        // Wait for video to be ready
        videoRef.current.onloadedmetadata = () => {
          setIsCameraReady(true);
          console.log('Camera is ready!');
        };
      }
    } catch (err) {
      console.error('Camera error:', err);
      setError('Camera access failed: ' + err.message);
    }
  };

  // Initialize on mount
  useEffect(() => {
    // Start both camera and model loading
    startCamera();
    loadModel();

    // Cleanup: stop camera when component unmounts
    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = videoRef.current.srcObject.getTracks();
        tracks.forEach(track => track.stop());
        console.log('Camera stopped');
      }
    };
  }, []);

  return (
    <div style={{ 
      padding: '20px', 
      backgroundColor: '#0a0a0a', 
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <h1 style={{ color: '#fff', marginBottom: '20px' }}>
        Model Loading Test
      </h1>

      {/* Error display */}
      {error && (
        <div style={{ 
          color: '#ff4444', 
          marginBottom: '20px',
          padding: '10px',
          border: '1px solid #ff4444',
          borderRadius: '4px',
          maxWidth: '500px'
        }}>
          Error: {error}
        </div>
      )}

      {/* Status indicators */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ 
          color: isCameraReady ? '#4CAF50' : '#888',
          marginBottom: '10px',
          fontWeight: isCameraReady ? 'bold' : 'normal'
        }}>
          {isCameraReady ? '✓' : '○'} Camera: {isCameraReady ? 'Ready' : 'Loading...'}
        </div>
        
        <div style={{ 
          color: !isModelLoading && model ? '#4CAF50' : '#888',
          fontWeight: !isModelLoading && model ? 'bold' : 'normal'
        }}>
          {!isModelLoading && model ? '✓' : '○'} AI Model: {
            isModelLoading ? 'Loading...' : 
            model ? 'Ready' : 'Failed'
          }
        </div>
      </div>

      {/* Success message when both ready */}
      {isCameraReady && model && (
        <div style={{ 
          color: '#4CAF50', 
          marginBottom: '20px',
          padding: '15px',
          border: '2px solid #4CAF50',
          borderRadius: '8px',
          fontWeight: 'bold',
          fontSize: '18px'
        }}>
          🎉 Everything is ready! Camera + AI Model loaded successfully!
        </div>
      )}

      {/* Camera feed */}
      <video 
        ref={videoRef} 
        autoPlay 
        playsInline
        style={{ 
          width: '640px',
          maxWidth: '90vw',
          border: '2px solid #333',
          borderRadius: '8px',
          backgroundColor: '#000'
        }}
      />

      <div style={{ 
        color: '#888', 
        marginTop: '20px',
        textAlign: 'center',
        fontSize: '14px',
        maxWidth: '500px'
      }}>
        <p>Both the camera and AI face detection model need to load.</p>
        <p>Check the browser console for detailed logs.</p>
        {isCameraReady && model && (
          <p style={{ color: '#4CAF50', marginTop: '10px' }}>
            Ready for face detection in the next step!
          </p>
        )}
      </div>
    </div>
  );
};

export default ModelTest;