// hand-gesture.js
// Specialized module for Hand Gesture Interaction using MediaPipe and Three.js

class HandGestureCanvas extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.animationRef = null;
    this.target = { x: 0, y: 0, scale: 1, rotation: 0, pinch: 0 };
    this.current = { x: 0, y: 0, scale: 1, rotation: 0, pinch: 0 };
  }

  connectedCallback() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          width: 100%;
          height: 500px;
          position: relative;
          background: radial-gradient(circle at center, rgba(122, 40, 255, 0.05) 0%, transparent 70%);
          border-radius: 2rem;
          overflow: hidden;
        }
        canvas {
          width: 100%;
          height: 100%;
          display: block;
        }
      </style>
      <canvas id="gesture-canvas"></canvas>
    `;
    this.canvas = this.shadowRoot.querySelector('#gesture-canvas');
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
    this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    this.camera.position.z = 5;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Create a reactive hologram object
    const geometry = new THREE.TorusKnotGeometry(1, 0.3, 128, 32);
    this.material = new THREE.MeshPhongMaterial({
      color: 0x7a28ff,
      emissive: 0x220044,
      specular: 0xffffff,
      shininess: 100,
      wireframe: true,
      transparent: true,
      opacity: 0.8
    });

    this.hologram = new THREE.Mesh(geometry, this.material);
    this.scene.add(this.hologram);

    // Add lighting
    const ambientLight = new THREE.AmbientLight(0x404040);
    this.scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0x7a28ff, 2, 100);
    pointLight.position.set(5, 5, 5);
    this.scene.add(pointLight);

    const blueLight = new THREE.PointLight(0x00d2ff, 2, 100);
    blueLight.position.set(-5, -5, 5);
    this.scene.add(blueLight);

    this.render();
    
    // Resize listener
    window.addEventListener('resize', () => this.onResize());
  }

  onResize() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  updateState(data) {
    // data: { x, y, pinch, isOpen }
    this.target.x = (data.x - 0.5) * 10; // Map 0-1 to -5 to 5
    this.target.y = -(data.y - 0.5) * 6; // Map 0-1 to 3 to -3
    this.target.pinch = data.pinch; // 0 to 1
    this.target.rotation = data.isOpen ? 0.02 : 0.005;
  }

  render = () => {
    // Smooth interpolation
    this.current.x += (this.target.x - this.current.x) * 0.1;
    this.current.y += (this.target.y - this.current.y) * 0.1;
    this.current.pinch += (this.target.pinch - this.current.pinch) * 0.1;

    if (this.hologram) {
      this.hologram.position.x = this.current.x;
      this.hologram.position.y = this.current.y;
      
      // Rotate based on state
      this.hologram.rotation.y += 0.01;
      this.hologram.rotation.x += this.target.rotation;

      // Scale based on pinch
      const scale = 1 + this.current.pinch * 2;
      this.hologram.scale.set(scale, scale, scale);

      // Color shift based on pinch
      const r = 0.48 + this.current.pinch * 0.5;
      const b = 1.0 - this.current.pinch * 0.3;
      this.material.color.setRGB(r, 0.15, b);
      
      // Wireframe intensity
      this.material.opacity = 0.4 + (1 - this.current.pinch) * 0.4;
    }

    this.renderer.render(this.scene, this.camera);
    this.animationRef = requestAnimationFrame(this.render);
  };
}

customElements.define('hand-gesture-canvas', HandGestureCanvas);

export class HandGestureManager {
  constructor() {
    this.canvasComp = document.getElementById('hand-gesture-canvas');
    this.enableBtn = document.getElementById('enable-hand-btn');
    this.disableBtn = document.getElementById('disable-hand-btn');
    this.statusText = document.getElementById('hand-status-text');
    this.statusOverlay = document.getElementById('hand-status-overlay');
    
    this.hands = null;
    this.camera = null;
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
    this.enableBtn.innerText = 'Initializing...';
    this.statusText.innerText = 'Initializing camera...';

    try {
      this.hands = new Hands({
        locateFile: (file) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
        }
      });

      this.hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });

      this.hands.onResults((results) => this.onResults(results));

      const videoElement = document.createElement('video');
      videoElement.style.display = 'none';
      document.body.appendChild(videoElement);

      this.camera = new Camera(videoElement, {
        onFrame: async () => {
          await this.hands.send({ image: videoElement });
        },
        width: 640,
        height: 480
      });

      await this.camera.start();
      
      this.isActive = true;
      this.enableBtn.style.display = 'none';
      this.disableBtn.style.display = 'inline-block';
      this.statusText.innerText = 'Hand Tracking Active. Move your hand!';
      this.statusOverlay.classList.add('active');

    } catch (err) {
      console.error('Hand tracking failed:', err);
      this.enableBtn.disabled = false;
      this.enableBtn.innerText = 'Enable Hand Recognition';
      this.statusText.innerText = 'Error initializing camera.';
      alert('Failed to access camera for hand recognition.');
    }
  }

  onResults(results) {
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      const landmarks = results.multiHandLandmarks[0];
      
      // Calculate palm center (approx by middle finger base)
      const palmX = landmarks[9].x;
      const palmY = landmarks[9].y;

      // Calculate pinch (distance between thumb tip 4 and index tip 8)
      const thumbTip = landmarks[4];
      const indexTip = landmarks[8];
      const distance = Math.sqrt(
        Math.pow(thumbTip.x - indexTip.x, 2) +
        Math.pow(thumbTip.y - indexTip.y, 2)
      );
      
      // Normalize pinch (smaller distance = more pinch)
      const pinch = Math.max(0, 1 - (distance / 0.15));

      // Check if hand is open (dist between palm and middle tip)
      const middleTip = landmarks[12];
      const wrist = landmarks[0];
      const handSpan = Math.sqrt(
        Math.pow(middleTip.x - wrist.x, 2) +
        Math.pow(middleTip.y - wrist.y, 2)
      );
      const isOpen = handSpan > 0.2;

      if (this.canvasComp) {
        this.canvasComp.updateState({
          x: palmX,
          y: palmY,
          pinch: pinch,
          isOpen: isOpen
        });
      }

      this.statusText.innerText = isOpen ? 'Hand Open - Rapid Spin' : 'Hand Closed - Stable';
      this.statusOverlay.classList.add('detected');
    } else {
      this.statusOverlay.classList.remove('detected');
      this.statusText.innerText = 'No hand detected. Show your hand to the camera.';
    }
  }

  stop() {
    if (this.camera) {
      this.camera.stop();
    }
    this.isActive = false;
    this.disableBtn.style.display = 'none';
    this.enableBtn.style.display = 'inline-block';
    this.enableBtn.disabled = false;
    this.enableBtn.innerText = 'Enable Hand Recognition';
    this.statusOverlay.classList.remove('active', 'detected');
    this.statusText.innerText = 'Waiting for camera...';
    
    const video = document.querySelector('video');
    if (video) video.remove();
  }
}
