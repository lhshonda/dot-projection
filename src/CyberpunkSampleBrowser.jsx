import React, { useRef, useEffect, useState } from 'react';
import * as Tone from 'tone';

const CyberpunkSampleBrowser = () => {
  const playersRef = useRef({});
  const [isStarted, setIsStarted] = useState(false);
  const [manifest, setManifest] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedSamples, setSelectedSamples] = useState({
    kick: null,
    snare: null,
    hihat: null,
    openhat: null,
    crash: null,
  });
  const [volumes, setVolumes] = useState({
    kick: 1,
    snare: 0.8,
    hihat: 0.6,
    openhat: 0.6,
    crash: 0.7,
  });
  // Cache for dynamically loaded samples (loops, etc.)
  const sampleCacheRef = useRef({});
  // Track which samples are currently playing (for loops)
  const [playingSamples, setPlayingSamples] = useState(new Set());

  // URL encode path segments properly - handle special characters like #
  const encodeSamplePath = (path) => {
    // Split by / and encode each segment separately, but preserve /
    // This ensures #, spaces, and other special chars are properly encoded
    return path.split('/').map(segment => {
      // Only encode if segment is not empty
      if (!segment) return segment;
      // Encode the segment, then decode / to preserve path separators
      return encodeURIComponent(segment);
    }).join('/');
  };

  // Load manifest file
  useEffect(() => {
    const loadManifest = async () => {
      try {
        const response = await fetch('/samples-manifest.json');
        if (response.ok) {
          const data = await response.json();
          setManifest(data);
          
          // Auto-select first sample from each category
          const autoSelected = { ...selectedSamples };
          if (data.samples.kick && data.samples.kick.length > 0 && !autoSelected.kick) {
            autoSelected.kick = data.samples.kick[0].path;
          }
          if (data.samples.snare && data.samples.snare.length > 0 && !autoSelected.snare) {
            autoSelected.snare = data.samples.snare[0].path;
          }
          if (data.samples.hihat && data.samples.hihat.length > 0 && !autoSelected.hihat) {
            autoSelected.hihat = data.samples.hihat[0].path;
          }
          if (data.samples.openhat && data.samples.openhat.length > 0 && !autoSelected.openhat) {
            autoSelected.openhat = data.samples.openhat[0].path;
          }
          if (data.samples.crash && data.samples.crash.length > 0 && !autoSelected.crash) {
            autoSelected.crash = data.samples.crash[0].path;
          }
          setSelectedSamples(autoSelected);
        } else {
          console.error('Manifest file not found. Run: npm run scan-samples');
        }
      } catch (error) {
        console.error('Error loading manifest:', error);
      }
    };
    
    loadManifest();
  }, []);

  // Load a single sample using fetch + AudioBuffer (more reliable)
  const loadSample = async (url, name, volume = 1) => {
    try {
      const encodedUrl = encodeSamplePath(url);
      console.log(`Loading ${name} from: ${encodedUrl}`);
      
      // Fetch the audio file
      const response = await fetch(encodedUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      // Get the audio data as ArrayBuffer
      const arrayBuffer = await response.arrayBuffer();
      
      // Check if we got valid audio data (not HTML error page)
      if (arrayBuffer.byteLength === 0) {
        throw new Error('Empty response');
      }
      
      // Decode audio data
      const audioBuffer = await Tone.context.decodeAudioData(arrayBuffer);
      
      // Create ToneAudioBuffer and Player
      const buffer = new Tone.ToneAudioBuffer(audioBuffer);
      const player = new Tone.Player(buffer).toDestination();
      player.volume.value = Tone.gainToDb(volume);
      
      console.log(`✅ Loaded ${name}: ${encodedUrl}`);
      return player;
      
    } catch (error) {
      console.error(`❌ Error loading ${name} from ${url}:`, error);
      // Try with unencoded URL as last resort
      if (url !== encodeSamplePath(url)) {
        try {
          console.log(`Trying unencoded URL for ${name}...`);
          const response = await fetch(url);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const arrayBuffer = await response.arrayBuffer();
          const audioBuffer = await Tone.context.decodeAudioData(arrayBuffer);
          const buffer = new Tone.ToneAudioBuffer(audioBuffer);
          const player = new Tone.Player(buffer).toDestination();
          player.volume.value = Tone.gainToDb(volume);
          console.log(`✅ Loaded ${name} (unencoded): ${url}`);
          return player;
        } catch (fallbackError) {
          console.error(`❌ Fallback also failed for ${name}:`, fallbackError);
          return null;
        }
      }
      return null;
    }
  };

  // Initialize Tone.js players for selected samples
  const initializePlayers = async () => {
    if (!isStarted) return;
    
    setIsLoading(true);
    
    // Dispose old players
    Object.values(playersRef.current).forEach(player => {
      if (player && player.dispose) player.dispose();
    });
    playersRef.current = {};

    // Load all samples in parallel
    const loadPromises = Object.entries(selectedSamples).map(async ([name, url]) => {
      if (url) {
        const player = await loadSample(url, name, volumes[name] || 1);
        if (player) {
          playersRef.current[name] = player;
        }
      }
    });

    await Promise.all(loadPromises);
    setIsLoading(false);
  };

  useEffect(() => {
    if (isStarted && manifest) {
      initializePlayers();
    }
  }, [selectedSamples, isStarted]);

  useEffect(() => {
    Object.entries(volumes).forEach(([name, vol]) => {
      if (playersRef.current[name] && playersRef.current[name].volume) {
        playersRef.current[name].volume.value = Tone.gainToDb(vol);
      }
    });
  }, [volumes]);

  useEffect(() => {
    return () => {
      // Stop all playing samples
      Object.values(sampleCacheRef.current).forEach(player => {
        if (player && player.stop) player.stop();
      });
      // Dispose all players
      Object.values(playersRef.current).forEach(player => {
        if (player && player.dispose) player.dispose();
      });
      Object.values(sampleCacheRef.current).forEach(player => {
        if (player && player.dispose) player.dispose();
      });
      Tone.Transport.stop();
      Tone.Transport.cancel();
    };
  }, []);

  const startAudio = async () => {
    await Tone.start();
    setIsStarted(true);
  };

  const playSample = (name) => {
    if (playersRef.current[name]) {
      playersRef.current[name].start();
    }
  };

  // Play any sample on demand (for loops, etc.)
  const playSampleOnDemand = async (samplePath, sampleName) => {
    if (!isStarted) return;
    
    // Check if already playing - if so, stop it
    if (playingSamples.has(samplePath)) {
      stopSampleOnDemand(samplePath);
      return;
    }
    
    // Check cache first
    if (sampleCacheRef.current[samplePath]) {
      const cachedPlayer = sampleCacheRef.current[samplePath];
      cachedPlayer.loop = true; // Enable looping
      cachedPlayer.start();
      setPlayingSamples(prev => new Set(prev).add(samplePath));
      return;
    }
    
    // Load and play
    try {
      const player = await loadSample(samplePath, sampleName, 0.7); // Default volume for loops
      if (player) {
        // Enable looping for all samples (especially loops)
        player.loop = true;
        // Cache it for reuse
        sampleCacheRef.current[samplePath] = player;
        player.start();
        setPlayingSamples(prev => new Set(prev).add(samplePath));
      }
    } catch (error) {
      console.error(`Error playing sample ${sampleName}:`, error);
    }
  };

  // Stop a playing sample
  const stopSampleOnDemand = (samplePath) => {
    if (sampleCacheRef.current[samplePath]) {
      sampleCacheRef.current[samplePath].stop();
      setPlayingSamples(prev => {
        const newSet = new Set(prev);
        newSet.delete(samplePath);
        return newSet;
      });
    }
  };

  // Stop all playing samples
  const stopAllSamples = () => {
    playingSamples.forEach(path => {
      if (sampleCacheRef.current[path]) {
        sampleCacheRef.current[path].stop();
      }
    });
    setPlayingSamples(new Set());
  };

  const selectSample = (category, samplePath) => {
    setSelectedSamples(prev => ({
      ...prev,
      [category]: samplePath,
    }));
  };

  if (!manifest) {
    return (
      <div style={{ padding: '20px', backgroundColor: '#000080', color: '#fff', fontFamily: 'monospace', minHeight: '100vh' }}>
        <h1>CYBERPUNK SAMPLE BROWSER</h1>
        <div>Manifest not found. Run: <strong>npm run scan-samples</strong></div>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', backgroundColor: '#000080', color: '#fff', fontFamily: 'monospace', minHeight: '100vh' }}>
      <h1>CYBERPUNK SAMPLE BROWSER</h1>
      <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '20px' }}>
        Found {manifest.totalSamples} samples in {manifest.categories.length} categories
      </div>

      {!isStarted && (
        <button onClick={startAudio} style={{ padding: '10px 20px', backgroundColor: '#fff', color: '#000', border: '1px solid #fff', cursor: 'pointer' }}>
          START
        </button>
      )}

      {isLoading && <div>Loading samples...</div>}

      {isStarted && (
        <>
          {playingSamples.size > 0 && (
            <div style={{ marginBottom: '20px', border: '1px solid #ffff00', padding: '10px', backgroundColor: '#000040' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ color: '#ffff00' }}>▶ {playingSamples.size} sample(s) playing</span>
                <button
                  onClick={stopAllSamples}
                  style={{ padding: '5px 15px', backgroundColor: '#ff4444', color: '#fff', border: '1px solid #fff', cursor: 'pointer', fontSize: '12px' }}
                >
                  STOP ALL
                </button>
              </div>
            </div>
          )}

          <div style={{ marginBottom: '30px', border: '1px solid #fff', padding: '15px' }}>
            <h2>Selected Samples:</h2>
            {Object.entries(selectedSamples).map(([name, path]) => {
              const playerLoaded = playersRef.current[name] !== undefined;
              return (
                <div key={name} style={{ marginBottom: '15px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
                    <span style={{ width: '100px', textTransform: 'uppercase', fontWeight: 'bold' }}>{name}:</span>
                    <button
                      onClick={() => playSample(name)}
                      disabled={!playerLoaded}
                      style={{ padding: '5px 15px', backgroundColor: playerLoaded ? '#00ff00' : '#333', color: '#000', border: '1px solid #fff', cursor: playerLoaded ? 'pointer' : 'not-allowed' }}
                    >
                      {playerLoaded ? 'PLAY' : 'LOADING...'}
                    </button>
                    <span style={{ fontSize: '11px', color: '#aaa' }}>{path ? path.split('/').pop() : 'None selected'}</span>
                    {path && !playerLoaded && (
                      <span style={{ fontSize: '10px', color: '#ff4444' }}>❌ Failed to load</span>
                    )}
                  </div>
                  <div style={{ marginLeft: '110px' }}>
                    <div>Volume: {volumes[name].toFixed(2)}</div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={volumes[name]}
                      onChange={(e) => setVolumes(prev => ({ ...prev, [name]: Number(e.target.value) }))}
                      style={{ width: '300px' }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginBottom: '30px' }}>
            <h2>Sample Library:</h2>
            {manifest.categories.map((category) => {
              const samples = manifest.samples[category] || [];
              if (samples.length === 0) return null;
              
              const isSelected = (samplePath) => {
                return Object.values(selectedSamples).includes(samplePath);
              };
              
              const canSelect = ['kick', 'snare', 'hihat', 'openhat', 'crash'].includes(category);
              const canPlay = isStarted; // All samples can be played if audio is started
              
              return (
                <div key={category} style={{ marginBottom: '20px', border: '1px solid #fff', padding: '15px' }}>
                  <h3 style={{ textTransform: 'uppercase', marginBottom: '10px' }}>
                    {category} ({samples.length})
                  </h3>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', maxHeight: '200px', overflowY: 'auto' }}>
                    {samples.map((sample, idx) => {
                      const isPlaying = playingSamples.has(sample.path);
                      return (
                        <div key={idx} style={{ position: 'relative' }}>
                          <button
                            onClick={() => {
                              if (canSelect) {
                                selectSample(category, sample.path);
                              } else if (canPlay) {
                                playSampleOnDemand(sample.path, sample.name);
                              }
                            }}
                            disabled={!canSelect && !canPlay}
                            style={{
                              padding: '5px 10px',
                              backgroundColor: isPlaying ? '#ffff00' : isSelected(sample.path) ? '#00ff00' : (canSelect || canPlay) ? '#000080' : '#333',
                              color: isPlaying ? '#000' : isSelected(sample.path) ? '#000' : '#fff',
                              border: isPlaying ? '2px solid #ffff00' : '1px solid #fff',
                              cursor: (canSelect || canPlay) ? 'pointer' : 'not-allowed',
                              fontSize: '11px',
                              opacity: (canSelect || canPlay) ? 1 : 0.6,
                              fontWeight: isPlaying ? 'bold' : 'normal',
                            }}
                            title={isPlaying ? `Click to stop: ${sample.name}` : canSelect ? `Select as ${category}` : canPlay ? `Click to play loop: ${sample.name}` : sample.name}
                          >
                            {isPlaying ? '⏸ ' : !canSelect && canPlay ? '▶ ' : ''}
                            {sample.name.length > 25 ? sample.name.substring(0, 25) + '...' : sample.name}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default CyberpunkSampleBrowser;
