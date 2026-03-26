// face-tracking.js
// CCL Robotics - Specialized Neural Face Synthesis Module
// Local-First Architecture: 100% independent from external CDNs

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
          display: block; width: 100%; height: 100%; position: relative;
          background: #000; border-radius: 2rem; overflow: hidden;
        }
        canvas { width: 100%; height: 100%; display: block; }
        .vignette {
          position: absolute; inset: 0; pointer-events: none; z-index: 2;
          background: radial-gradient(circle at center, transparent 10%, #000 90%);
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
    this.camera = new THREE.PerspectiveCamera(70, width / height, 0.1, 1000);
    this.camera.position.set(0, 0, 1.8); // 초거대 효과를 위해 카메라 밀착

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.faceGroup = new THREE.Group();
    this.scene.add(this.faceGroup);

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(478 * 3);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    this.material = new THREE.PointsMaterial({
      color: 0x00d2ff, size: 0.08, // 점 크기 대폭 확대
      transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false
    });

    this.facePoints = new THREE.Points(geometry, this.material);
    this.faceGroup.add(this.facePoints);

    // 하이라이트 조명
    const p1 = new THREE.PointLight(0x7a28ff, 15, 20);
    p1.position.set(-3, 3, 5);
    this.scene.add(p1);

    const p2 = new THREE.PointLight(0x00d2ff, 15, 20);
    p2.position.set(3, -3, 5);
    this.scene.add(p2);

    this.isInitialized = true;
    this.render();
    window.addEventListener('resize', () => this.onResize());
  }

  onResize() {
    if (!this.isInitialized) return;
    this.camera.aspect = this.canvas.clientWidth / this.canvas.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
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
        // 초거대 스케일 적용 (12.5배)
        positions[i * 3] = (0.5 - landmark.x) * 12.5; 
        positions[i * 3 + 1] = (0.5 - landmark.y) * 12.5;
        positions[i * 3 + 2] = -landmark.z * 18.0; 
      }
      this.facePoints.geometry.attributes.position.needsUpdate = true;
      this.faceGroup.rotation.y = Math.sin(Date.now() * 0.001) * 0.25;
      this.material.color.setHSL((Date.now() * 0.0001) % 1, 1.0, 0.65);
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

  async start() {
    if (this.isActive) return;
    this.enableBtn.disabled = true;
    this.statusText.innerText = 'Initializing Local Neural Engine...';

    try {
      // 로컬 라이브러리 객체 확인
      const vision = window.mediapipe?.tasks?.vision || window.tasksVision || window;
      if (!vision.FaceLandmarker) throw new Error("Local AI Engine not found.");

      this.statusText.innerText = 'Loading Local Weights...';
      const filesetResolver = await vision.FilesetResolver.forVisionTasks("./lib/mediapipe");
      
      this.faceLandmarker = await vision.FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath: `./lib/mediapipe/face_landmarker.task`,
          delegate: "GPU"
        },
        outputFaceBlendshapes: true,
        runningMode: "VIDEO",
        numFaces: 1
      });

      this.statusText.innerText = 'Activating Sensor Array...';
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: 'user' }
      });

      this.video = document.createElement('video');
      this.video.srcObject = stream;
      this.video.autoplay = true;
      this.video.playsInline = true;
      this.video.muted = true;
      this.video.style.cssText = `
        position: absolute; top: 1.5rem; left: 1.5rem; width: 240px; height: 180px;
        border-radius: 1.5rem; border: 3px solid #00d2ff; object-fit: cover;
        z-index: 100; box-shadow: 0 0 50px rgba(0, 210, 255, 0.6); transform: scaleX(-1);
      `;

      const container = document.querySelector('.face-canvas-wrapper');
      if (container) container.appendChild(this.video);
      else document.body.appendChild(this.video);

      this.video.onloadedmetadata = () => {
        this.isActive = true;
        this.enableBtn.style.display = 'none';
        this.disableBtn.style.display = 'inline-block';
        this.statusText.innerText = 'NEURAL LINK: LOCAL-SYNC ACTIVE';
        this.statusOverlay.classList.add('active');
        this.predict();
      };
    } catch (err) {
      console.error(err);
      this.enableBtn.disabled = false;
      this.statusText.innerText = 'Neural Failure. Restarting...';
      alert(`Critical: ${err.message}`);
    }
  }

  predict() {
    if (!this.isActive || !this.faceLandmarker || !this.video) return;
    if (this.video.currentTime > 0) {
      const results = this.faceLandmarker.detectForVideo(this.video, performance.now());
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
