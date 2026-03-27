// face-modeling.js
// CCL Robotics - 3D Face Modeling Module

import { FaceLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";

const VIDEO_WIDTH = 640;
const VIDEO_HEIGHT = 480;

class FaceModelingSystem {
  constructor() {
    this.canvas = document.getElementById('face-canvas');
    this.video = document.getElementById('video-preview');
    this.testVideo = document.getElementById('test-video');
    this.gazeDot = document.getElementById('gaze-dot');
    this.statusText = document.getElementById('status-text');
    this.startBtn = document.getElementById('start-btn');
    this.stopBtn = document.getElementById('stop-btn');
    
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.faceMesh = null;
    this.faceLandmarker = null;
    this.isActive = false;
    this.lastVideoTime = -1;

    this.init();
  }

  async init() {
    this.initThree();
    this.testVideo.src = 'images/Test.mov'; // Use the relative path to images directory
    this.startBtn.addEventListener('click', () => this.start());
    this.stopBtn.addEventListener('click', () => this.stop());
    window.addEventListener('resize', () => this.onResize());
  }

  initThree() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 1000);
    this.camera.position.set(0, 0, 4);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0xffffff, 1.5);
    pointLight.position.set(5, 5, 5);
    this.scene.add(pointLight);

    const blueLight = new THREE.PointLight(0x00d2ff, 1);
    blueLight.position.set(-5, -5, 2);
    this.scene.add(blueLight);

    // Create Face Mesh Geometry
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(478 * 3);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // Material: White, slightly metallic for a "modeling" look
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      wireframe: true,
      transparent: true,
      opacity: 0.9,
      roughness: 0.1,
      metalness: 0.5,
      side: THREE.DoubleSide
    });

    this.faceMesh = new THREE.Mesh(geometry, material);
    
    // We'll also add points for detail
    const pointMaterial = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.008,
        transparent: true,
        opacity: 0.5
    });
    const points = new THREE.Points(geometry, pointMaterial);
    this.faceMesh.add(points);
    
    this.scene.add(this.faceMesh);

    this.animate();
  }

  onResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  async start() {
    this.startBtn.disabled = true;
    this.statusText.innerText = "Initializing Neural Engine...";
    
    try {
      const filesetResolver = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
      );
      
      this.faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
          delegate: "GPU"
        },
        outputFaceBlendshapes: true,
        runningMode: "VIDEO",
        numFaces: 1
      });

      this.statusText.innerText = "Accessing Camera...";
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: VIDEO_WIDTH, height: VIDEO_HEIGHT, facingMode: 'user' }
      });
      
      this.video.srcObject = stream;
      this.video.onloadedmetadata = () => {
        this.video.play();
        this.testVideo.style.display = 'block';
        this.testVideo.play();
        this.gazeDot.style.display = 'block';
        this.isActive = true;
        this.startBtn.style.display = 'none';
        this.stopBtn.style.display = 'inline-block';
        this.statusText.innerText = "Neural Link Active";
        this.statusText.style.color = "#00ff88";
      };
    } catch (err) {
      console.error(err);
      this.statusText.innerText = "Initialization Failed";
      this.startBtn.disabled = false;
    }
  }

  stop() {
    this.isActive = false;
    if (this.video.srcObject) {
      this.video.srcObject.getTracks().forEach(track => track.stop());
    }
    this.video.pause();
    this.testVideo.pause();
    this.testVideo.style.display = 'none';
    this.gazeDot.style.display = 'none';
    this.stopBtn.style.display = 'none';
    this.startBtn.style.display = 'inline-block';
    this.startBtn.disabled = false;
    this.statusText.innerText = "System Standby";
    this.statusText.style.color = "#00d2ff";
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    if (this.isActive && this.video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = this.video.currentTime;
      const results = this.faceLandmarker.detectForVideo(this.video, performance.now());
      
      if (results.faceLandmarks && results.faceLandmarks.length > 0) {
        const landmarks = results.faceLandmarks[0];
        this.updateMesh(landmarks);
        this.updateGaze(landmarks);
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  updateMesh(landmarks) {
    const positions = this.faceMesh.geometry.attributes.position.array;
    for (let i = 0; i < landmarks.length; i++) {
      const lm = landmarks[i];
      positions[i * 3] = (0.5 - lm.x) * 2.5;
      positions[i * 3 + 1] = (0.5 - lm.y) * 2.5;
      positions[i * 3 + 2] = -lm.z * 2.5;
    }
    this.faceMesh.geometry.attributes.position.needsUpdate = true;
  }

  updateGaze(landmarks) {
    // MediaPipe Iris Landmarks: 
    // Left eye iris center: 468
    // Right eye iris center: 473
    const leftIris = landmarks[468];
    const rightIris = landmarks[473];
    
    // Average iris position
    const avgIrisX = (leftIris.x + rightIris.x) / 2;
    const avgIrisY = (leftIris.y + rightIris.y) / 2;
    
    // Map to screen coordinates
    // We need to account for mirroring. MediaPipe X is 0 (left) to 1 (right) of the video frame.
    // If the video is mirrored for display, we might need to adjust.
    // However, the red dot is on the test video which is NOT mirrored.
    // But the user is looking at the screen. 
    // Usually, when you look left, the iris moves left in the frame.
    
    const screenX = avgIrisX * window.innerWidth;
    const screenY = avgIrisY * window.innerHeight;
    
    // Apply smoothing or sensitivity if needed
    this.gazeDot.style.left = `${screenX}px`;
    this.gazeDot.style.top = `${screenY}px`;
  }
}

new FaceModelingSystem();
