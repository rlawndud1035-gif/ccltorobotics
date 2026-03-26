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
    
    // Check for THREE in global scope
    if (window.THREE) {
      this.initThree();
    } else {
      console.error('Three.js not found.');
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
    
    // Closer camera for a "really big" face effect
    this.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    this.camera.position.set(0, 0, 2.5);

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
      size: 0.05, 
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending
    });

    this.facePoints = new THREE.Points(geometry, this.material);
    this.faceGroup.add(this.facePoints);

    // Dynamic lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    this.scene.add(ambientLight);

    const purpleGlow = new THREE.PointLight(0x7a28ff, 3, 15);
    purpleGlow.position.set(0, 1, 3);
    this.scene.add(purpleGlow);

    const blueGlow = new THREE.PointLight(0x00d2ff, 3, 15);
    blueGlow.position.set(2, -1, 3);
    this.scene.add(blueGlow);

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
        // SIGNIFICANTLY INCREASED SCALE
        positions[i * 3] = (0.5 - landmark.x) * 8.5; 
        positions[i * 3 + 1] = (0.5 - landmark.y) * 8.5;
        positions[i * 3 + 2] = -landmark.z * 10.0; 
      }
      this.facePoints.geometry.attributes.position.needsUpdate = true;
      
      this.faceGroup.rotation.y = Math.sin(Date.now() * 0.0008) * 0.2;
      this.faceGroup.rotation.x = Math.cos(Date.now() * 0.0006) * 0.1;
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
   * Robust detection of MediaPipe classes from global scope
   */
  async findMediaPipe() {
    // Strategy 1: check standard window properties
    if (window.FaceLandmarker && window.FilesetResolver) {
      return { FaceLandmarker: window.FaceLandmarker, FilesetResolver: window.FilesetResolver };
    }

    // Strategy 2: check window.mediapipe.tasks.vision (common for CDN bundle)
    const m = window.mediapipe;
    if (m && m.tasks && m.tasks.vision) {
      const v = m.tasks.vision;
      if (v.FaceLandmarker && v.FilesetResolver) {
        return { FaceLandmarker: v.FaceLandmarker, FilesetResolver: v.FilesetResolver };
      }
    }

    // Strategy 3: check window.tasksVision
    if (window.tasksVision && window.tasksVision.FaceLandmarker) {
      return { FaceLandmarker: window.tasksVision.FaceLandmarker, FilesetResolver: window.tasksVision.FilesetResolver };
    }

    return null;
  }

  async start() {
    if (this.isActive) return;
    
    this.enableBtn.disabled = true;
    this.enableBtn.innerText = 'Initializing...';
    this.statusText.innerText = 'Detecting AI Infrastructure...';

    try {
      let mp = await this.findMediaPipe();
      
      // Retry logic if not found immediately (script might still be parsing)
      if (!mp) {
        this.statusText.innerText = 'Retrying Library Detection...';
        await new Promise(resolve => setTimeout(resolve, 1000));
        mp = await this.findMediaPipe();
      }

      if (!mp) {
        throw new Error('MediaPipe Vision libraries not found in global scope. Ensure scripts are correctly loaded.');
      }

      const { FaceLandmarker, FilesetResolver } = mp;

      this.statusText.innerText = 'Downloading Neural Weights...';

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

      this.statusText.innerText = 'Activating Optical Array...';

      const videoElement = document.createElement('video');
      videoElement.autoplay = true;
      videoElement.playsInline = true;
      videoElement.muted = true;
      videoElement.style.position = 'absolute';
      videoElement.style.top = '1.5rem';
      videoElement.style.left = '1.5rem';
      videoElement.style.width = '180px';
      videoElement.style.height = '135px';
      videoElement.style.borderRadius = '1rem';
      videoElement.style.border = '2px solid #7a28ff';
      videoElement.style.objectFit = 'cover';
      videoElement.style.zIndex = '100';
      videoElement.style.boxShadow = '0 0 20px rgba(122, 40, 255, 0.4)';
      videoElement.style.transform = 'scaleX(-1)'; 

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
        this.statusText.innerText = 'Neural Sync: ESTABLISHED';
        this.statusOverlay.classList.add('active');
        this.predictWebcam();
      };

    } catch (err) {
      console.error('Neural Link Error:', err);
      this.enableBtn.disabled = false;
      this.enableBtn.innerText = 'Enable Face Tracking';
      this.statusText.innerText = 'Neural Failure.';
      alert(`Diagnostic: ${err.message}`);
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
        this.statusText.innerText = 'Neural Lock: SECURED';
      } else {
        this.statusOverlay.classList.remove('detected');
        this.statusText.innerText = 'Scanning...';
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
    this.statusText.innerText = 'System Standby';
  }
}
