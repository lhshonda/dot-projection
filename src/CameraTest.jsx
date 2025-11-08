import React, { useRef, useEffect, useState } from 'react';

const CameraTest = () => {
  const videoRef = useRef(null);
  const [error, setError] = useState(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
          audio: false,
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
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

    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = videoRef.current.srcObject.getTracks();
        tracks.forEach(track => track.stop());
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
      <h1 style={{ color: '#fff' }}>Camera Test</h1>
      
      {error && <div style={{ color: '#ff4444' }}>Error: {error}</div>}
      {!isReady && !error && <div style={{ color: '#fff' }}>Loading camera...</div>}
      {isReady && <div style={{ color: '#4CAF50' }}>✓ Camera working!</div>}
      
      <video 
        ref={videoRef} 
        autoPlay 
        playsInline
        style={{ width: '640px', border: '2px solid #333' }}
      />
    </div>
  );
};

export default CameraTest;