// face-tracking.js
// Specialized module for Face Tracking and 3D Model Mapping using MediaPipe Tasks Vision and Three.js

class FaceTrackingCanvas extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.animationRef = null;
    this.faceData = null;
  }

  connectedCallback() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          width: 100%;
          height: 600px;
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
    this.initThree();
  }

  disconnectedCallback() {
    cancelAnimationFrame(this.animationRef);
    if (this.renderer) {
      this.renderer.dispose();
    }
  }

  initThree() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    this.camera.position.z = 1.5;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Create a face mesh group
    this.faceGroup = new THREE.Group();
    this.scene.add(this.faceGroup);

    // Initial placeholder: A point cloud
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(478 * 3);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // We use a white wireframe material for high visibility as requested
    this.material = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      emissive: 0x666666,
      wireframe: true,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide
    });

    this.faceMesh = new THREE.Mesh(geometry, this.material);
    this.faceGroup.add(this.faceMesh);

    // Add lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
    mainLight.position.set(0, 0, 5);
    this.scene.add(mainLight);

    const blueLight = new THREE.PointLight(0x00d2ff, 1, 10);
    blueLight.position.set(-2, 1, 2);
    this.scene.add(blueLight);

    const purpleLight = new THREE.PointLight(0x7a28ff, 1, 10);
    purpleLight.position.set(2, -1, 2);
    this.scene.add(purpleLight);

    this.render();
    
    window.addEventListener('resize', () => this.onResize());
  }

  onResize() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  updateFace(landmarks) {
    if (!landmarks || landmarks.length === 0) return;
    this.faceData = landmarks[0];
  }

  render = () => {
    if (this.faceData) {
      const positions = this.faceMesh.geometry.attributes.position.array;
      
      for (let i = 0; i < this.faceData.length; i++) {
        const landmark = this.faceData[i];
        // Normalize and scale
        positions[i * 3] = (0.5 - landmark.x) * 2.5; 
        positions[i * 3 + 1] = (0.5 - landmark.y) * 2.5;
        positions[i * 3 + 2] = -landmark.z * 2.5;
      }
      this.faceMesh.geometry.attributes.position.needsUpdate = true;
      
      // Subtle automatic rotation for depth
      this.faceGroup.rotation.y = Math.sin(Date.now() * 0.001) * 0.1;
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
    this.statusText.innerText = 'Loading AI models...';

    try {
      // Access MediaPipe via the global namespace provided by the CDN bundle
      const vision = window.mediapipe && window.mediapipe.tasks && window.mediapipe.tasks.vision;
      const FaceLandmarker = vision ? vision.FaceLandmarker : window.FaceLandmarker;
      const FilesetResolver = vision ? vision.FilesetResolver : window.FilesetResolver;

      if (!FaceLandmarker || !FilesetResolver) {
        throw new Error('MediaPipe Face Landmarker classes not found.');
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

      this.statusText.innerText = 'Initializing camera...';

      const videoElement = document.createElement('video');
      videoElement.style.display = 'none';
      videoElement.autoplay = true;
      videoElement.playsInline = true;
      document.body.appendChild(videoElement);
      this.video = videoElement;

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 }
      });
      videoElement.srcObject = stream;

      videoElement.addEventListener('loadeddata', () => {
        this.isActive = true;
        this.enableBtn.style.display = 'none';
        this.disableBtn.style.display = 'inline-block';
        this.statusText.innerText = 'Face Tracking Active';
        this.statusOverlay.classList.add('active');
        this.predictWebcam();
      });

    } catch (err) {
      console.error('Face tracking initialization failed:', err);
      this.enableBtn.disabled = false;
      this.enableBtn.innerText = 'Enable Face Tracking';
      this.statusText.innerText = 'Error initializing camera.';
      alert('Failed to access camera for face tracking.');
    }
  }

  async predictWebcam() {
    if (!this.isActive || !this.faceLandmarker || !this.video) return;

    let startTimeMs = performance.now();
    if (this.lastVideoTime !== this.video.currentTime) {
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
        this.statusText.innerText = 'No face detected. Look at the camera.';
      }
    }

    if (this.isActive) {
      window.requestAnimationFrame(() => this.predictWebcam());
    }
  }

  stop() {
    this.isActive = false;
    if (this.video && this.video.srcObject) {
      this.video.srcObject.getTracks().forEach(track => track.stop());
      this.video.remove();
      this.video = null;
    }
    this.disableBtn.style.display = 'none';
    this.enableBtn.style.display = 'inline-block';
    this.enableBtn.disabled = false;
    this.enableBtn.innerText = 'Enable Face Tracking';
    this.statusOverlay.classList.remove('active', 'detected');
    this.statusText.innerText = 'Waiting for camera...';
  }
}
