// face-tracking.js
// Specialized module for Face Tracking and 3D Model Mapping using MediaPipe Tasks Vision and Three.js

class FaceTrackingCanvas extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.animationRef = null;
    this.faceData = null;
    this.isInitialized = false;
  }

  connectedCallback() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          width: 100%;
          height: 100%;
          position: relative;
          background: radial-gradient(circle at center, rgba(255, 255, 255, 0.05) 0%, transparent 70%);
          border-radius: 2rem;
          overflow: hidden;
        }
        canvas {
          width: 100%;
          height: 100%;
          display: block;
        }
      </style>
      <canvas id="face-canvas"></canvas>
    `;
    this.canvas = this.shadowRoot.querySelector('#face-canvas');
    
    // Ensure THREE is available before initializing
    if (window.THREE) {
      this.initThree();
    } else {
      console.error('Three.js not found. Face tracking 3D view will not initialize.');
    }
  }

  disconnectedCallback() {
    cancelAnimationFrame(this.animationRef);
    if (this.renderer) {
      this.renderer.dispose();
    }
  }

  initThree() {
    const THREE = window.THREE;
    const width = this.canvas.clientWidth || 800;
    const height = this.canvas.clientHeight || 600;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    // Move camera back to see the whole face
    this.camera.position.set(0, 0, 4);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Create a face group
    this.faceGroup = new THREE.Group();
    this.scene.add(this.faceGroup);

    // Use Points instead of Mesh for 478 landmarks (no triangulation needed)
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(478 * 3);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // Neural-style point material
    this.material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.035,
      transparent: false,
      opacity: 1.0,
      blending: THREE.AdditiveBlending
    });

    this.facePoints = new THREE.Points(geometry, this.material);
    this.faceGroup.add(this.facePoints);

    // Add lighting to help with any future mesh implementation
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    this.scene.add(ambientLight);

    const mainLight = new THREE.PointLight(0x7a28ff, 2, 20);
    mainLight.position.set(0, 0, 5);
    this.scene.add(mainLight);

    const blueLight = new THREE.PointLight(0x00d2ff, 1.5, 10);
    blueLight.position.set(-3, 2, 2);
    this.scene.add(blueLight);

    this.isInitialized = true;
    this.render();
    
    window.addEventListener('resize', () => this.onResize());
  }

  onResize() {
    if (!this.isInitialized) return;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  updateFace(landmarks) {
    if (!landmarks || landmarks.length === 0) return;
    // landmarks[0] contains the array of 478 landmark points
    this.faceData = landmarks[0];
  }

  render = () => {
    if (!this.isInitialized) return;

    if (this.faceData) {
      const positions = this.facePoints.geometry.attributes.position.array;
      
      for (let i = 0; i < this.faceData.length; i++) {
        const landmark = this.faceData[i];
        // Flip X for mirror effect, scale Z for depth perception
        positions[i * 3] = (0.5 - landmark.x) * 4.0; 
        positions[i * 3 + 1] = (0.5 - landmark.y) * 4.0;
        positions[i * 3 + 2] = -landmark.z * 5.0; 
      }
      this.facePoints.geometry.attributes.position.needsUpdate = true;
      
      // Dynamic rotation based on time
      this.faceGroup.rotation.y = Math.sin(Date.now() * 0.0005) * 0.1;
    }

    this.renderer.render(this.scene, this.camera);
    this.animationRef = requestAnimationFrame(this.render);
  };
}

customElements.define('face-tracking-canvas', FaceTrackingCanvas);

export class FaceTrackingManager {
  constructor() {
    this.canvasComp = document.getElementById('face-tracking-canvas');
    this.enableBtn = document.getElementById('enable-face-btn');
    this.disableBtn = document.getElementById('disable-face-btn');
    this.statusText = document.getElementById('face-status-text');
    this.statusOverlay = document.getElementById('face-status-overlay');
    
    this.faceLandmarker = null;
    this.video = null;
    this.isActive = false;
    this.lastVideoTime = -1;

    if (this.enableBtn) this.init();
  }

  init() {
    this.enableBtn.addEventListener('click', () => this.start());
    this.disableBtn.addEventListener('click', () => this.stop());
  }

  async start() {
    if (this.isActive) return;
    
    this.enableBtn.disabled = true;
    this.enableBtn.innerText = 'Initializing...';
    this.statusText.innerText = 'Connecting to Neural AI...';

    try {
      // Improved MediaPipe Tasks Vision object resolution
      const vision = window.tasksVision || (window.mediapipe && window.mediapipe.tasks && window.mediapipe.tasks.vision);
      
      if (!vision) {
        console.error('MediaPipe Tasks Vision bundle not found. Check script include.');
        throw new Error('Neural AI libraries not loaded.');
      }

      const FaceLandmarker = vision.FaceLandmarker;
      const FilesetResolver = vision.FilesetResolver;

      if (!FaceLandmarker || !FilesetResolver) {
        throw new Error('Face Landmarker modules not found in vision bundle.');
      }

      const filesetResolver = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@google/mediapipe_tasks_vision@0.10.3/wasm"
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

      this.statusText.innerText = 'Activating Optical Sensors...';

      const videoElement = document.createElement('video');
      videoElement.autoplay = true;
      videoElement.playsInline = true;
      videoElement.muted = true;
      videoElement.style.position = 'absolute';
      videoElement.style.top = '1.5rem';
      videoElement.style.left = '1.5rem';
      videoElement.style.width = '160px';
      videoElement.style.height = '120px';
      videoElement.style.borderRadius = '1rem';
      videoElement.style.border = '2px solid rgba(122, 40, 255, 0.4)';
      videoElement.style.objectFit = 'cover';
      videoElement.style.zIndex = '10';
      videoElement.style.boxShadow = '0 10px 40px rgba(0,0,0,0.6)';
      videoElement.style.transform = 'scaleX(-1)'; // Mirror for user intuition

      const container = document.querySelector('.face-canvas-wrapper');
      if (container) {
        container.appendChild(videoElement);
      } else {
        document.body.appendChild(videoElement);
      }
      
      this.video = videoElement;

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: { ideal: 640 }, 
          height: { ideal: 480 },
          facingMode: 'user'
        }
      });
      videoElement.srcObject = stream;

      videoElement.onloadedmetadata = () => {
        videoElement.play();
        this.isActive = true;
        this.enableBtn.style.display = 'none';
        this.disableBtn.style.display = 'inline-block';
        this.statusText.innerText = 'Neural Sync Active';
        this.statusOverlay.classList.add('active');
        this.predictWebcam();
      };

    } catch (err) {
      console.error('Face tracking start failure:', err);
      this.enableBtn.disabled = false;
      this.enableBtn.innerText = 'Enable Face Tracking';
      this.statusText.innerText = 'Neural Connection Failed.';
      alert(`Error: ${err.message || 'Camera access denied.'}`);
    }
  }

  async predictWebcam() {
    if (!this.isActive || !this.faceLandmarker || !this.video) return;

    let startTimeMs = performance.now();
    if (this.video.currentTime > 0 && this.lastVideoTime !== this.video.currentTime) {
      this.lastVideoTime = this.video.currentTime;
      const results = this.faceLandmarker.detectForVideo(this.video, startTimeMs);

      if (results.faceLandmarks && results.faceLandmarks.length > 0) {
        if (this.canvasComp) {
          this.canvasComp.updateFace(results.faceLandmarks);
        }
        this.statusOverlay.classList.add('detected');
        this.statusText.innerText = 'Face Detected - Tracking Active';
      } else {
        this.statusOverlay.classList.remove('detected');
        this.statusText.innerText = 'Scanning for Face...';
      }
    }

    if (this.isActive) {
      window.requestAnimationFrame(() => this.predictWebcam());
    }
  }

  stop() {
    this.isActive = false;
    if (this.video) {
      if (this.video.srcObject) {
        this.video.srcObject.getTracks().forEach(track => track.stop());
      }
      this.video.remove();
      this.video = null;
    }
    this.disableBtn.style.display = 'none';
    this.enableBtn.style.display = 'inline-block';
    this.enableBtn.disabled = false;
    this.enableBtn.innerText = 'Enable Face Tracking';
    this.statusOverlay.classList.remove('active', 'detected');
    this.statusText.innerText = 'Waiting for sensor input...';
  }
}
