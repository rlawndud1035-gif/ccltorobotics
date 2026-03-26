// face-tracking.js
// CCL Robotics - Specialized Neural Face Synthesis Module
// High-reliability initialization with massive scale 3D visualization

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
          background: #000;
          border-radius: 2rem;
          overflow: hidden;
        }
        canvas {
          width: 100%;
          height: 100%;
          display: block;
        }
        .vignette {
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at center, transparent 20%, #000 100%);
          pointer-events: none;
          z-index: 2;
        }
      </style>
      <canvas id="face-canvas"></canvas>
      <div class="vignette"></div>
    `;
    this.canvas = this.shadowRoot.querySelector('#face-canvas');
    if (window.THREE) this.initThree();
  }

  disconnectedCallback() {
    cancelAnimationFrame(this.animationRef);
    if (this.renderer) this.renderer.dispose();
  }

  initThree() {
    const THREE = window.THREE;
    const width = this.canvas.clientWidth || 800;
    const height = this.canvas.clientHeight || 600;

    this.scene = new THREE.Scene();
    
    // Wide field of view for dramatic impact
    this.camera = new THREE.PerspectiveCamera(65, width / height, 0.1, 1000);
    this.camera.position.set(0, 0, 2.2); // Closer for massive face

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.faceGroup = new THREE.Group();
    this.scene.add(this.faceGroup);

    // Neural Point Cloud Geometry
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(478 * 3);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // Neon Neural Material
    this.material = new THREE.PointsMaterial({
      color: 0x00d2ff,
      size: 0.065, // Very large points
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.facePoints = new THREE.Points(geometry, this.material);
    this.faceGroup.add(this.facePoints);

    // Dramatic Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambient);

    const purpleLight = new THREE.PointLight(0x7a28ff, 5, 10);
    purpleLight.position.set(-2, 2, 2);
    this.scene.add(purpleLight);

    const blueLight = new THREE.PointLight(0x00d2ff, 5, 10);
    blueLight.position.set(2, -2, 2);
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
    this.faceData = landmarks[0];
  }

  render = () => {
    if (!this.isInitialized) return;

    if (this.faceData) {
      const positions = this.facePoints.geometry.attributes.position.array;
      
      for (let i = 0; i < this.faceData.length; i++) {
        const landmark = this.faceData[i];
        // MASSIVE SCALE: 9.0x width/height, 12.0x depth
        // Centering and flipping X for natural mirror view
        positions[i * 3] = (0.5 - landmark.x) * 9.5; 
        positions[i * 3 + 1] = (0.5 - landmark.y) * 9.5;
        positions[i * 3 + 2] = -landmark.z * 12.0; 
      }
      this.facePoints.geometry.attributes.position.needsUpdate = true;
      
      // Auto-hover rotation
      this.faceGroup.rotation.y = Math.sin(Date.now() * 0.001) * 0.15;
      
      // Color cycle for neural effect
      this.material.color.setHSL((Date.now() * 0.0001) % 1, 0.8, 0.6);
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

  /**
   * Fail-safe Library Loader
   * Dynamically loads the MediaPipe vision bundle if not present
   */
  async ensureLibraries() {
    const VISION_URL = "https://cdn.jsdelivr.net/npm/@google/mediapipe_tasks_vision@0.10.3/vision_bundle.js";
    
    // Check multiple potential namespaces
    const getLib = () => {
      if (window.FaceLandmarker && window.FilesetResolver) return { FaceLandmarker: window.FaceLandmarker, FilesetResolver: window.FilesetResolver };
      if (window.mediapipe?.tasks?.vision) return window.mediapipe.tasks.vision;
      if (window.tasksVision) return window.tasksVision;
      return null;
    };

    let lib = getLib();
    if (lib) return lib;

    // Not found, inject script manually to be sure
    console.log("Neural AI library not found in global scope. Injecting dynamically...");
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = VISION_URL;
      script.crossOrigin = "anonymous";
      script.onload = async () => {
        // Wait a bit for execution
        for (let i = 0; i < 10; i++) {
          lib = getLib();
          if (lib) {
            console.log("Neural AI library successfully initialized.");
            resolve(lib);
            return;
          }
          await new Promise(r => setTimeout(resolve, 200));
        }
        reject(new Error("Neural AI libraries failed to initialize after dynamic injection."));
      };
      script.onerror = () => reject(new Error("Failed to download Neural AI libraries. Check your internet connection."));
      document.head.appendChild(script);
    });
  }

  async start() {
    if (this.isActive) return;
    
    this.enableBtn.disabled = true;
    this.enableBtn.innerText = 'INITIALIZING...';
    this.statusText.innerText = 'Synchronizing Neural Libraries...';

    try {
      const { FaceLandmarker, FilesetResolver } = await this.ensureLibraries();

      this.statusText.innerText = 'Downloading Pre-trained Weights...';

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

      this.statusText.innerText = 'Awakening Visual Cortex...';

      const videoElement = document.createElement('video');
      videoElement.autoplay = true;
      videoElement.playsInline = true;
      videoElement.muted = true;
      videoElement.style.cssText = `
        position: absolute;
        top: 2rem;
        left: 2rem;
        width: 200px;
        height: 150px;
        border-radius: 1.5rem;
        border: 2px solid #00d2ff;
        object-fit: cover;
        z-index: 100;
        box-shadow: 0 0 30px rgba(0, 210, 255, 0.5);
        transform: scaleX(-1);
      `;

      const container = document.querySelector('.face-canvas-wrapper');
      if (container) container.appendChild(videoElement);
      else document.body.appendChild(videoElement);
      
      this.video = videoElement;

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
      });
      videoElement.srcObject = stream;

      videoElement.onloadedmetadata = () => {
        videoElement.play();
        this.isActive = true;
        this.enableBtn.style.display = 'none';
        this.disableBtn.style.display = 'inline-block';
        this.statusText.innerText = 'NEURAL LINK: ACTIVE';
        this.statusOverlay.classList.add('active');
        this.predictWebcam();
      };

    } catch (err) {
      console.error('Neural system failure:', err);
      this.enableBtn.disabled = false;
      this.enableBtn.innerText = 'RETRY CONNECTION';
      this.statusText.innerText = `ERR: ${err.message}`;
      alert(`Critical System Failure: ${err.message}`);
    }
  }

  async predictWebcam() {
    if (!this.isActive || !this.faceLandmarker || !this.video) return;

    let startTimeMs = performance.now();
    if (this.video.currentTime > 0 && this.lastVideoTime !== this.video.currentTime) {
      this.lastVideoTime = this.video.currentTime;
      const results = this.faceLandmarker.detectForVideo(this.video, startTimeMs);

      if (results.faceLandmarks && results.faceLandmarks.length > 0) {
        if (this.canvasComp) this.canvasComp.updateFace(results.faceLandmarks);
        this.statusOverlay.classList.add('detected');
        this.statusText.innerText = 'TARGET ACQUIRED: SYNCED';
      } else {
        this.statusOverlay.classList.remove('detected');
        this.statusText.innerText = 'SCANNING FOR BIOMETRIC DATA...';
      }
    }

    if (this.isActive) {
      window.requestAnimationFrame(() => this.predictWebcam());
    }
  }

  stop() {
    this.isActive = false;
    if (this.video) {
      if (this.video.srcObject) this.video.srcObject.getTracks().forEach(t => t.stop());
      this.video.remove();
      this.video = null;
    }
    this.disableBtn.style.display = 'none';
    this.enableBtn.style.display = 'inline-block';
    this.enableBtn.disabled = false;
    this.enableBtn.innerText = 'Enable Face Tracking';
    this.statusOverlay.classList.remove('active', 'detected');
    this.statusText.innerText = 'SYSTEM OFFLINE';
  }
}
