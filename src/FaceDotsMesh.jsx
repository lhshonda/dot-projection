import React, { useRef, useEffect, useState } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as faceDetection from '@tensorflow-models/face-detection';

const FaceDetectionTest = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  
  const [model, setModel] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [detectionInfo, setDetectionInfo] = useState('Waiting...');

  const loadModel = async () => {
    try {
      console.log('Loading face detection model...');
      await tf.ready();
      console.log('TensorFlow ready! Backend:', tf.getBackend());
      
      // Use simpler face detection model first to test
      const loadedModel = await faceDetection.createDetector(
        faceDetection.SupportedModels.MediaPipeFaceDetector,
        {
          runtime: 'tfjs',
        }
      );
      
      console.log('Face detection model loaded!');
      setModel(loadedModel);
      setIsLoading(false);
    } catch (err) {
      console.error('Model loading error:', err);
      setError('Failed to load model: ' + err.message);
      setIsLoading(false);
    }
  };

  const startCamera = async () => {
    try {
      console.log('Requesting camera...');
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: 640,
          height: 480,
          facingMode: 'user'
        },
        audio: false,
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await new Promise((resolve) => {
          videoRef.current.onloadedmetadata = () => {
            videoRef.current.play();
            console.log('Camera ready!');
            resolve();
          };
        });
      }
    } catch (err) {
      console.error('Camera error:', err);
      setError('Camera failed: ' + err.message);
    }
  };

  const detect = async () => {
    if (
      model &&
      videoRef.current &&
      videoRef.current.readyState === 4 &&
      canvasRef.current
    ) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      if (canvas.width !== video.videoWidth) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      try {
        // Draw video frame first
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Detect faces
        const faces = await model.estimateFaces(video);

        console.log('Faces detected:', faces.length);

        if (faces.length > 0) {
          setDetectionInfo(`✓ DETECTED ${faces.length} face(s)!`);
          
          // Draw bounding box around face
          faces.forEach(face => {
            const box = face.box;
            
            // Draw green rectangle
            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 3;
            ctx.strokeRect(box.xMin, box.yMin, box.width, box.height);
            
            // Draw confidence score
            ctx.fillStyle = '#00ff00';
            ctx.font = '16px Arial';
            ctx.fillText(
              `Confidence: ${Math.round(face.score * 100)}%`,
              box.xMin,
              box.yMin - 10
            );

            console.log('Face detected at:', box, 'Confidence:', face.score);
          });
        } else {
          setDetectionInfo('✗ No face detected');
          
          // Draw message on canvas
          ctx.fillStyle = '#ff4444';
          ctx.font = '24px Arial';
          ctx.textAlign = 'center';
          ctx.fillText('NO FACE DETECTED', canvas.width / 2, canvas.height / 2);
        }

      } catch (error) {
        console.error('Detection error:', error);
        setDetectionInfo('Error: ' + error.message);
      }
    }

    animationRef.current = requestAnimationFrame(detect);
  };

  useEffect(() => {
    const init = async () => {
      await startCamera();
      await loadModel();
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
    if (model && !isLoading) {
      console.log('Starting detection...');
      detect();
    }
  }, [model, isLoading]);

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      backgroundColor: '#0a0a0a',
      padding: '20px'
    }}>
      <h1 style={{ color: '#ffffff', marginBottom: '10px' }}>
        Face Detection Test
      </h1>
      
      <div style={{ 
        marginBottom: '20px',
        padding: '15px 30px',
        backgroundColor: '#1a1a1a',
        borderRadius: '8px',
        border: '2px solid #333',
        fontSize: '18px',
        fontWeight: 'bold',
        color: detectionInfo.includes('✓') ? '#00ff00' : '#ff4444'
      }}>
        {detectionInfo}
      </div>

      {isLoading && (
        <div style={{ color: '#ffffff', marginBottom: '20px' }}>
          Loading model...
        </div>
      )}

      {error && (
        <div style={{ 
          color: '#ff4444', 
          marginBottom: '20px',
          padding: '10px',
          border: '1px solid #ff4444',
          borderRadius: '4px'
        }}>
          Error: {error}
        </div>
      )}

      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ display: 'none' }}
      />
      
      <canvas
        ref={canvasRef}
        style={{
          maxWidth: '90vw',
          border: '2px solid #333',
          borderRadius: '8px'
        }}
      />

      <div style={{ 
        color: '#888', 
        marginTop: '20px',
        textAlign: 'center',
        fontSize: '14px'
      }}>
        <p>This uses a simpler face detection model.</p>
        <p>If your face is detected, a green box will appear around it.</p>
        <p><strong>Check the browser console for logs!</strong></p>
      </div>
    </div>
  );
};

export default FaceDetectionTest;