import React, { useRef, useEffect, useState } from 'react';

const CameraTest = () => {
  const videoRef = useRef(null);
  const [error, setError] = useState(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const startCamera = async () => {
      try {
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
            setIsReady(true);
            console.log('Camera is ready!');
          };
        }
      } catch (err) {
        console.error('Camera error:', err);
        setError(err.message);
      }
    };

    startCamera();

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
        Camera Test
      </h1>

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

      {!isReady && !error && (
        <div style={{ color: '#fff', marginBottom: '20px' }}>
          Requesting camera access...
        </div>
      )}

      {isReady && (
        <div style={{ 
          color: '#4CAF50', 
          marginBottom: '20px',
          fontWeight: 'bold'
        }}>
          ✓ Camera is working!
        </div>
      )}

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
        fontSize: '14px'
      }}>
        <p>If you see yourself, the camera is working correctly.</p>
        <p>Check the browser console for logs.</p>
      </div>
    </div>
  );
};

export default CameraTest;