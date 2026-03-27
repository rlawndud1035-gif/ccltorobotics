// face-modeling.js
// CCL Robotics - 3D Face Modeling Module

import { FaceLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";

const VIDEO_WIDTH = 640;
const VIDEO_HEIGHT = 480;

class FaceModelingSystem {
  constructor() {
    this.canvas = document.getElementById('face-canvas');
    this.video = document.getElementById('video-preview');
    this.bgImage = document.getElementById('bg-image');
    this.heatmapCanvas = document.getElementById('heatmap-canvas');
    this.statusText = document.getElementById('status-text');
    this.startBtn = document.getElementById('start-btn');
    this.stopBtn = document.getElementById('stop-btn');
    
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.faceMesh = null;
    this.leftPupil = null;
    this.rightPupil = null;
    this.faceLandmarker = null;
    this.isActive = false;
    this.lastVideoTime = -1;
    
    this.heatmapCtx = this.heatmapCanvas.getContext('2d');

    this.init();
  }

  async init() {
    this.initThree();
    this.startBtn.addEventListener('click', () => this.start());
    this.stopBtn.addEventListener('click', () => this.stop());
    window.addEventListener('resize', () => this.onResize());
    this.onResize(); // Set initial heatmap canvas size
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

    // Create Pupils (Red Spheres)
    const pupilGeom = new THREE.SphereGeometry(0.015, 16, 16);
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    this.leftPupil = new THREE.Mesh(pupilGeom, pupilMat);
    this.rightPupil = new THREE.Mesh(pupilGeom, pupilMat);
    this.leftPupil.visible = false;
    this.rightPupil.visible = false;
    this.scene.add(this.leftPupil);
    this.scene.add(this.rightPupil);

    this.animate();
  }

  onResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    
    // Resize heatmap canvas
    this.heatmapCanvas.width = width;
    this.heatmapCanvas.height = height;
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
        this.bgImage.style.display = 'block';
        this.heatmapCanvas.style.display = 'block';
        this.leftPupil.visible = true;
        this.rightPupil.visible = true;
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
    this.bgImage.style.display = 'none';
    this.heatmapCanvas.style.display = 'none';
    this.leftPupil.visible = false;
    this.rightPupil.visible = false;
    this.stopBtn.style.display = 'none';
    this.startBtn.style.display = 'inline-block';
    this.startBtn.disabled = false;
    this.statusText.innerText = "System Standby";
    this.statusText.style.color = "#00d2ff";
    
    // Clear heatmap
    this.heatmapCtx.clearRect(0, 0, this.heatmapCanvas.width, this.heatmapCanvas.height);
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    if (this.isActive && this.video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = this.video.currentTime;
      const results = this.faceLandmarker.detectForVideo(this.video, performance.now());
      
      if (results.faceLandmarks && results.faceLandmarks.length > 0) {
        const landmarks = results.faceLandmarks[0];
        this.updateMesh(landmarks);
        this.updatePupils(landmarks);
        this.drawHeatmap(landmarks);
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

  updatePupils(landmarks) {
    const leftIris = landmarks[468];
    const rightIris = landmarks[473];
    this.leftPupil.position.set((0.5 - leftIris.x) * 2.5, (0.5 - leftIris.y) * 2.5, -leftIris.z * 2.5 + 0.01);
    this.rightPupil.position.set((0.5 - rightIris.x) * 2.5, (0.5 - rightIris.y) * 2.5, -rightIris.z * 2.5 + 0.01);
  }

  drawHeatmap(landmarks) {
    const leftIris = landmarks[468];
    const rightIris = landmarks[473];
    
    const avgX = (leftIris.x + rightIris.x) / 2;
    const avgY = (leftIris.y + rightIris.y) / 2;
    
    // Map to canvas coordinates
    const x = avgX * this.heatmapCanvas.width;
    const y = avgY * this.heatmapCanvas.height;
    
    // Subtle fade effect for heatmap
    this.heatmapCtx.fillStyle = 'rgba(0, 0, 0, 0.05)';
    this.heatmapCtx.fillRect(0, 0, this.heatmapCanvas.width, this.heatmapCanvas.height);
    
    // Draw red heat point
    const gradient = this.heatmapCtx.createRadialGradient(x, y, 0, x, y, 60);
    gradient.addColorStop(0, 'rgba(255, 0, 0, 0.6)');
    gradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
    
    this.heatmapCtx.fillStyle = gradient;
    this.heatmapCtx.beginPath();
    this.heatmapCtx.arc(x, y, 60, 0, Math.PI * 2);
    this.heatmapCtx.fill();
  }
}

new FaceModelingSystem();
