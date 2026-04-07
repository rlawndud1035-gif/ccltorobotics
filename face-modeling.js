// face-modeling.js
// CCL Robotics - 3D Face Modeling Module

import { FaceLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";

const VIDEO_WIDTH = 640;
const VIDEO_HEIGHT = 480;

class FaceModelingSystem {
  constructor() {
    this.container = document.querySelector('.modeling-container');
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
    
    // Gaze Data Tracking
    this.gridRows = 15;
    this.gridCols = 20;
    this.gazeGrid = [];
    this.totalGazeCount = 0;
    this.isDataMode = false;

    this.init();
  }

  async init() {
    this.initThree();
    this.resetGazeData();
    // Ensure bgImage is visible from the start
    if (this.bgImage) this.bgImage.style.display = 'block';
    
    this.startBtn.addEventListener('click', () => this.start());
    this.stopBtn.addEventListener('click', () => this.stop());
    window.addEventListener('resize', () => this.onResize());
    this.onResize(); // Set initial heatmap canvas size
  }

  resetGazeData() {
    this.gazeGrid = Array.from({ length: this.gridRows }, () => new Array(this.gridCols).fill(0));
    this.totalGazeCount = 0;
    this.isDataMode = false;
    if (this.container) this.container.classList.remove('modeling-active');
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
      alpha: true // Crucial for showing the background image
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0); // Set clear alpha to 0 (transparent)

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

    if (this.isDataMode) {
      this.renderGazeReport();
    }
  }

  async start() {
    this.startBtn.disabled = true;
    this.statusText.innerText = "Initializing Neural Engine...";
    this.resetGazeData();
    this.heatmapCtx.clearRect(0, 0, this.heatmapCanvas.width, this.heatmapCanvas.height);
    
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
        this.heatmapCanvas.style.display = 'block';
        this.leftPupil.visible = true;
        this.rightPupil.visible = true;
        this.faceMesh.visible = true;
        this.isActive = true;
        this.startBtn.style.display = 'none';
        this.stopBtn.style.display = 'inline-block';
        this.statusText.innerText = "Neural Link Active";
        this.statusText.style.color = "#00ff88";
        
        // Activate Stealth Mode
        if (this.container) this.container.classList.add('modeling-active');
      };
    } catch (err) {
      console.error(err);
      this.statusText.innerText = "Initialization Failed";
      this.startBtn.disabled = false;
    }
  }

  stop() {
    this.isActive = false;
    this.isDataMode = true;
    if (this.container) this.container.classList.remove('modeling-active');

    if (this.video.srcObject) {
      this.video.srcObject.getTracks().forEach(track => track.stop());
    }
    this.video.pause();
    
    // Keep heatmap canvas visible but change to static data mode
    this.leftPupil.visible = false;
    this.rightPupil.visible = false;
    this.faceMesh.visible = false;
    
    this.stopBtn.style.display = 'none';
    this.startBtn.style.display = 'inline-block';
    this.startBtn.innerText = "Restart Measurement";
    this.startBtn.disabled = false;
    
    this.statusText.innerText = "Neural Analysis Complete";
    this.statusText.style.color = "#ff3d00";

    this.renderGazeReport();
  }

  renderGazeReport() {
    const ctx = this.heatmapCtx;
    const w = this.heatmapCanvas.width;
    const h = this.heatmapCanvas.height;
    const cellW = w / this.gridCols;
    const cellH = h / this.gridRows;

    ctx.clearRect(0, 0, w, h);
    
    // Draw semi-transparent overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, w, h);

    if (this.totalGazeCount === 0) return;

    // Find max value for normalization
    let maxCount = 0;
    for (let r = 0; r < this.gridRows; r++) {
      for (let c = 0; c < this.gridCols; c++) {
        if (this.gazeGrid[r][c] > maxCount) maxCount = this.gazeGrid[r][c];
      }
    }

    // Draw Grid and Heatmap
    for (let r = 0; r < this.gridRows; r++) {
      for (let c = 0; c < this.gridCols; c++) {
        const count = this.gazeGrid[r][c];
        if (count === 0) continue;

        const ratio = count / maxCount;
        const percentage = ((count / this.totalGazeCount) * 100).toFixed(1);

        // Color based on intensity
        const hue = 260 - (ratio * 260); // 260 is blue, 0 is red
        ctx.fillStyle = `hsla(${hue}, 100%, 50%, ${0.3 + ratio * 0.5})`;
        ctx.fillRect(c * cellW, r * cellH, cellW, cellH);

        // Draw percentage text for high intensity cells
        if (ratio > 0.2) {
          ctx.fillStyle = '#fff';
          ctx.font = `${Math.max(10, cellH * 0.3)}px Geist`;
          ctx.textAlign = 'center';
          ctx.fillText(`${percentage}%`, c * cellW + cellW / 2, r * cellH + cellH / 2 + 5);
        }
      }
    }

    // Draw Grid Lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    for (let r = 0; r <= this.gridRows; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * cellH);
      ctx.lineTo(w, r * cellH);
      ctx.stroke();
    }
    for (let c = 0; c <= this.gridCols; c++) {
      ctx.beginPath();
      ctx.moveTo(c * cellW, 0);
      ctx.lineTo(c * cellW, h);
      ctx.stroke();
    }

    // Draw Title and Summary
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px Geist';
    ctx.textAlign = 'left';
    ctx.fillText('Neural Gaze Distribution Report', 40, 60);
    
    ctx.font = '16px Geist';
    ctx.fillText(`Total Gaze Samples: ${this.totalGazeCount}`, 40, 90);
    ctx.fillText(`Peak Focus Concentration: ${((maxCount / this.totalGazeCount) * 100).toFixed(1)}%`, 40, 115);
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    if (this.isActive && this.video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = this.video.currentTime;
      const results = this.faceLandmarker.detectForVideo(this.video, performance.now());
      
      if (results.faceLandmarks && results.faceLandmarks.length > 0) {
        const landmarks = results.faceLandmarks[0];
        const blendshapes = results.faceBlendshapes ? results.faceBlendshapes[0] : null;
        
        this.updateMesh(landmarks);
        this.updatePupils(landmarks);
        this.drawHeatmap(landmarks, blendshapes);
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  updateMesh(landmarks) {
    if (this.isDataMode) return;
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
    if (!this.leftPupil || !this.rightPupil || this.isDataMode) return;
    const leftIris = landmarks[468];
    const rightIris = landmarks[473];
    this.leftPupil.position.set((0.5 - leftIris.x) * 2.5, (0.5 - leftIris.y) * 2.5, -leftIris.z * 2.5 + 0.01);
    this.rightPupil.position.set((0.5 - rightIris.x) * 2.5, (0.5 - rightIris.y) * 2.5, -rightIris.z * 2.5 + 0.01);
  }

  drawHeatmap(landmarks, blendshapes) {
    if (!blendshapes) return;

    const categories = blendshapes.categories;
    const findScore = (name) => categories.find(c => c.categoryName === name)?.score || 0;

    // Correcting Gaze Calculation for Top-Center Camera
    const gazeXOffset = (findScore('eyeLookInRight') - findScore('eyeLookOutRight') + 
                         findScore('eyeLookOutLeft') - findScore('eyeLookInLeft')) / 2;
    
    const gazeYOffset = (findScore('eyeLookUpLeft') + findScore('eyeLookUpRight') - 
                         findScore('eyeLookDownLeft') - findScore('eyeLookDownRight')) / 2;

    const faceX = landmarks[1].x; 
    const faceY = landmarks[1].y;

    const sensitivityX = 2.5;
    const sensitivityY = 3.0; 
    
    const verticalBias = -0.15; 

    const targetX = faceX - (gazeXOffset * sensitivityX);
    const targetY = faceY - (gazeYOffset * sensitivityY) - verticalBias;

    const normX = Math.max(0, Math.min(1, targetX));
    const normY = Math.max(0, Math.min(1, targetY));

    const x = normX * this.heatmapCanvas.width;
    const y = normY * this.heatmapCanvas.height;

    // Record Data
    const gridX = Math.floor(normX * this.gridCols);
    const gridY = Math.floor(normY * this.gridRows);
    if (gridX >= 0 && gridX < this.gridCols && gridY >= 0 && gridY < this.gridRows) {
        this.gazeGrid[gridY][gridX]++;
        this.totalGazeCount++;
    }
    
    this.heatmapCtx.fillStyle = 'rgba(0, 0, 0, 0.05)';
    this.heatmapCtx.fillRect(0, 0, this.heatmapCanvas.width, this.heatmapCanvas.height);
    
    const gradient = this.heatmapCtx.createRadialGradient(x, y, 0, x, y, 85);
    gradient.addColorStop(0, 'rgba(255, 0, 0, 0.85)');
    gradient.addColorStop(0.5, 'rgba(255, 0, 0, 0.4)');
    gradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
    
    this.heatmapCtx.fillStyle = gradient;
    this.heatmapCtx.beginPath();
    this.heatmapCtx.arc(x, y, 85, 0, Math.PI * 2);
    this.heatmapCtx.fill();
  }
}

new FaceModelingSystem();
