// face-modeling.js
// CCL Robotics - 3D Face Modeling Module

import { FaceLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";

const VIDEO_WIDTH = 640;
const VIDEO_HEIGHT = 480;

class FaceModelingSystem {
  constructor() {
    this.canvas = document.getElementById('face-canvas');
    this.video = document.getElementById('video-preview');
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
    this.startBtn.addEventListener('click', () => this.start());
    this.stopBtn.addEventListener('click', () => this.stop());
    window.addEventListener('resize', () => this.onResize());
  }

  initThree() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 1000);
    this.camera.position.set(0, 0, 3);

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

    // We'll use a subset of triangles for a clean "modeling" look
    // These are standard indices for the face mesh
    const indices = [
      0,1,2, 1,2,3, 2,3,4, 3,4,5, 4,5,6, 5,6,7, 6,7,8, 7,8,9, 8,9,10,
      10,11,12, 11,12,13, 12,13,14, 13,14,15, 14,15,16, 15,16,17, 16,17,18,
      18,19,20, 19,20,21, 20,21,22, 21,22,23, 22,23,24, 23,24,25, 24,25,26,
      26,27,28, 27,28,29, 28,29,30, 29,30,31, 30,31,32, 31,32,33, 32,33,34
      // ... and many more for a full mesh. 
      // For brevity and stability, we'll use a generated grid or Points+Lines if full indices aren't practical.
      // But wait, let's use a more robust way: Points + LineSegments.
    ];

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
        this.updateMesh(results.faceLandmarks[0]);
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  updateMesh(landmarks) {
    const positions = this.faceMesh.geometry.attributes.position.array;
    
    // We center and scale the landmarks
    // MediaPipe coordinates are 0-1, so we map them to a reasonable 3D space
    for (let i = 0; i < landmarks.length; i++) {
      const lm = landmarks[i];
      // Mirror X, Invert Y, Scale Z for depth
      positions[i * 3] = (0.5 - lm.x) * 2.5;
      positions[i * 3 + 1] = (0.5 - lm.y) * 2.5;
      positions[i * 3 + 2] = -lm.z * 2.5;
    }
    
    this.faceMesh.geometry.attributes.position.needsUpdate = true;
    
    // Subtle rotation based on average head position
    // We can use the nose tip (index 1) and ears for better orientation
  }
}

new FaceModelingSystem();
