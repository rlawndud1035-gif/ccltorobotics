// face-tracking.js
// CCL Robotics - Specialized Neural Face Synthesis Module
// Ultra-high reliability version with dual-CDN failover and massive visuals

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
          background: radial-gradient(circle at center, transparent 10%, #000 100%);
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
    this.camera = new THREE.PerspectiveCamera(65, width / height, 0.1, 1000);
    this.camera.position.set(0, 0, 2.0); // 카메라를 더 앞으로 당김 (초거대 얼굴)

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.faceGroup = new THREE.Group();
    this.scene.add(this.faceGroup);

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(478 * 3);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    this.material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.075, // 점 크기 확대
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.facePoints = new THREE.Points(geometry, this.material);
    this.faceGroup.add(this.facePoints);

    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);

    const p1 = new THREE.PointLight(0x7a28ff, 10, 20);
    p1.position.set(-2, 2, 5);
    this.scene.add(p1);

    const p2 = new THREE.PointLight(0x00d2ff, 10, 20);
    p2.position.set(2, -2, 5);
    this.scene.add(p2);

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
        // 압도적 스케일: 가로세로 10.5배, 깊이 15.0배
        positions[i * 3] = (0.5 - landmark.x) * 10.5; 
        positions[i * 3 + 1] = (0.5 - landmark.y) * 10.5;
        positions[i * 3 + 2] = -landmark.z * 15.0; 
      }
      this.facePoints.geometry.attributes.position.needsUpdate = true;
      this.faceGroup.rotation.y = Math.sin(Date.now() * 0.001) * 0.2;
      this.material.color.setHSL((Date.now() * 0.0001) % 1, 0.9, 0.7);
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
    if (this.enableBtn) this.init();
  }

  init() {
    this.enableBtn.addEventListener('click', () => this.start());
    this.disableBtn.addEventListener('click', () => this.stop());
  }

  async ensureLibraries() {
    const urls = [
      "https://cdn.jsdelivr.net/npm/@google/mediapipe_tasks_vision@0.10.3/vision_bundle.js",
      "https://unpkg.com/@google/mediapipe_tasks_vision@0.10.3/vision_bundle.js"
    ];

    const checkGlobal = () => {
      if (window.FaceLandmarker && window.FilesetResolver) return { FaceLandmarker: window.FaceLandmarker, FilesetResolver: window.FilesetResolver };
      const vision = window.mediapipe?.tasks?.vision || window.tasksVision;
      if (vision?.FaceLandmarker && vision?.FilesetResolver) return vision;
      return null;
    };

    let lib = checkGlobal();
    if (lib) return lib;

    for (const url of urls) {
      try {
        console.log(`Attempting to load Neural AI from: ${url}`);
        await this.loadScript(url);
        // Script loaded, now wait for it to initialize globals
        for (let i = 0; i < 20; i++) {
          lib = checkGlobal();
          if (lib) return lib;
          await new Promise(r => setTimeout(r, 150));
        }
      } catch (e) {
        console.warn(`Failed to load from ${url}, trying next...`);
      }
    }
    throw new Error("Could not load Neural AI libraries from any source.");
  }

  loadScript(url) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = url;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  async start() {
    if (this.isActive) return;
    this.enableBtn.disabled = true;
    this.statusText.innerText = 'Initializing Neural Fail-safe...';

    try {
      const lib = await this.ensureLibraries();
      const { FaceLandmarker, FilesetResolver } = lib;

      this.statusText.innerText = 'Loading Neural Weights...';
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

      this.statusText.innerText = 'Booting Optical Sensors...';
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: 'user' }
      });

      this.video = document.createElement('video');
      this.video.srcObject = stream;
      this.video.autoplay = true;
      this.video.playsInline = true;
      this.video.muted = true;
      this.video.style.cssText = `
        position: absolute; top: 1.5rem; left: 1.5rem; width: 220px; height: 165px;
        border-radius: 1rem; border: 3px solid #7a28ff; object-fit: cover;
        z-index: 100; box-shadow: 0 0 40px rgba(122, 40, 255, 0.6); transform: scaleX(-1);
      `;

      const container = document.querySelector('.face-canvas-wrapper');
      if (container) container.appendChild(this.video);
      else document.body.appendChild(this.video);

      this.video.onloadedmetadata = () => {
        this.isActive = true;
        this.enableBtn.style.display = 'none';
        this.disableBtn.style.display = 'inline-block';
        this.statusText.innerText = 'NEURAL LINK: ESTABLISHED';
        this.statusOverlay.classList.add('active');
        this.predict();
      };
    } catch (err) {
      console.error(err);
      this.enableBtn.disabled = false;
      this.statusText.innerText = 'Neural Failure. Please refresh.';
      alert(`Critical: ${err.message}`);
    }
  }

  predict() {
    if (!this.isActive || !this.faceLandmarker || !this.video) return;
    const now = performance.now();
    if (this.video.currentTime > 0) {
      const results = this.faceLandmarker.detectForVideo(this.video, now);
      if (results.faceLandmarks?.length > 0) {
        if (this.canvasComp) this.canvasComp.updateFace(results.faceLandmarks);
        this.statusOverlay.classList.add('detected');
        this.statusText.innerText = 'SYNCED';
      } else {
        this.statusOverlay.classList.remove('detected');
        this.statusText.innerText = 'SCANNING...';
      }
    }
    requestAnimationFrame(() => this.predict());
  }

  stop() {
    this.isActive = false;
    if (this.video) {
      this.video.srcObject?.getTracks().forEach(t => t.stop());
      this.video.remove();
      this.video = null;
    }
    this.disableBtn.style.display = 'none';
    this.enableBtn.style.display = 'inline-block';
    this.enableBtn.disabled = false;
    this.statusOverlay.classList.remove('active', 'detected');
    this.statusText.innerText = 'OFFLINE';
  }
}
