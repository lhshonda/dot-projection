# Dot Projection

Real-time hand gesture visualization using TensorFlow.js hand tracking. Displays your hands as dots on screen and generates dynamic 3D shapes when you pinch both hands together.

## Features

- **Real-time Hand Tracking**: Uses TensorFlow.js MediaPipe Hands model to detect and track up to 2 hands simultaneously
- **Dot-based Visualization**: Hand landmarks rendered as dots, with fingertips highlighted
- **Pinch Gesture Detection**: Detects when thumb and index finger come together
- **Dynamic 3D Morphing**: Pinch both hands to spawn a rotating 3D polyhedron that morphs based on hand distance
  - Closer hands = low-poly icosahedron (fewer faces)
  - Further hands = high-poly sphere (more subdivisions)
  - Real-time face count and distance display
- **Smooth Tracking**: One Euro Filter implementation for smoother hand movement 

## How It Works

1. Camera feed is processed through TensorFlow.js hand pose detection model
2. 21 hand landmarks per hand are tracked and smoothed using One Euro filters
3. Fingertips (keypoints 4, 8, 12, 16, 20) are rendered as larger dots
4. When both hands pinch (thumb-index distance < threshold), a 3D shape appears between them
5. The shape is an icosahedron that subdivides based on the distance between your hands
6. Uses isometric projection with real-time rotation and depth-sorted face rendering

## Tech Stack

- **TensorFlow.js** - Hand pose detection with MediaPipe Hands model
- **React** - UI framework
- **Canvas API** - 2D rendering for dots and 3D projection
- **WebGL Backend** - Hardware-accelerated tensor operations
- **One Euro Filter** - Smooth motion tracking

## Demo - [Live](https://www.visuare.tech)

Pinch both hands together and move them closer/farther apart to morph between low-poly and high-poly 3D shapes.

## Performance Notes

- Processes video at 192×108 resolution for fast inference
- Vertex/face caching for sphere generation
- Depth-sorted rendering with lighting effects

## Local Installation
```bash
# Read package.json for scripts & other commands

npm install
npm run dev
```

## Controls

- **Both hands visible**: See hand landmarks as dots
- **Pinch gesture**: Touch thumb to index finger
- **Both hands pinching**: 3D shape appears between pinch points
- **Move hands apart/together**: Morph shape complexity (displays face count)
