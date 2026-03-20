class InteractiveNeuralVortex extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.pointer = { x: 0, y: 0, tX: 0, tY: 0 };
    this.animationRef = null;
  }

  connectedCallback() {
    this.render_shadow();
    this.initWebGL();
    this.addEventListeners();
  }

  disconnectedCallback() {
    window.removeEventListener('resize', this.resizeCanvas);
    window.removeEventListener('pointermove', this.handleMouseMove);
    cancelAnimationFrame(this.animationRef);
    if (this.gl && this.program) {
      this.gl.deleteProgram(this.program);
    }
  }

  render_shadow() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          z-index: -1;
          pointer-events: none;
        }
        canvas {
          width: 100%;
          height: 100%;
          display: block;
          opacity: 0.95;
        }
      </style>
      <canvas id="neuro"></canvas>
    `;
    this.canvasEl = this.shadowRoot.querySelector('#neuro');
  }

  initWebGL() {
    const gl = this.canvasEl.getContext('webgl') || this.canvasEl.getContext('experimental-webgl');
    if (!gl) {
      console.error('WebGL not supported');
      return;
    }
    this.gl = gl;

    const vsSource = `
      precision mediump float;
      attribute vec2 a_position;
      varying vec2 vUv;
      void main() {
        vUv = .5 * (a_position + 1.);
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    const fsSource = `
      precision mediump float;
      varying vec2 vUv;
      uniform float u_time;
      uniform float u_ratio;
      uniform vec2 u_pointer_position;
      uniform float u_scroll_progress;
      
      vec2 rotate(vec2 uv, float th) {
        return mat2(cos(th), sin(th), -sin(th), cos(th)) * uv;
      }
      
      float neuro_shape(vec2 uv, float t, float p) {
        vec2 sine_acc = vec2(0.);
        vec2 res = vec2(0.);
        float scale = 8.;
        for (int j = 0; j < 15; j++) {
          uv = rotate(uv, 1.);
          sine_acc = rotate(sine_acc, 1.);
          vec2 layer = uv * scale + float(j) + sine_acc - t;
          sine_acc += sin(layer) + 2.4 * p;
          res += (.5 + .5 * cos(layer)) / scale;
          scale *= (1.2);
        }
        return res.x + res.y;
      }
      
      void main() {
        vec2 uv = .5 * vUv;
        uv.x *= u_ratio;
        vec2 pointer = vUv - u_pointer_position;
        pointer.x *= u_ratio;
        float p = clamp(length(pointer), 0., 1.);
        p = .5 * pow(1. - p, 2.);
        float t = .001 * u_time;
        vec3 color = vec3(0.);
        float noise = neuro_shape(uv, t, p);
        noise = 1.2 * pow(noise, 3.);
        noise += pow(noise, 10.);
        noise = max(.0, noise - .5);
        noise *= (1. - length(vUv - .5));
        color = vec3(0.5, 0.15, 0.65);
        color = mix(color, vec3(0.02, 0.7, 0.9), 0.32 + 0.16 * sin(2.0 * u_scroll_progress + 1.2));
        color += vec3(0.15, 0.0, 0.6) * sin(2.0 * u_scroll_progress + 1.5);
        color = color * noise;
        gl_FragColor = vec4(color, noise);
      }
    `;

    const compileShader = (source, type) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader error:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vertexShader = compileShader(vsSource, gl.VERTEX_SHADER);
    const fragmentShader = compileShader(fsSource, gl.FRAGMENT_SHADER);

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program));
      return;
    }
    gl.useProgram(program);
    this.program = program;

    const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const positionLocation = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    this.uTime = gl.getUniformLocation(program, 'u_time');
    this.uRatio = gl.getUniformLocation(program, 'u_ratio');
    this.uPointerPosition = gl.getUniformLocation(program, 'u_pointer_position');
    this.uScrollProgress = gl.getUniformLocation(program, 'u_scroll_progress');

    this.resizeCanvas();
    this.render();
  }

  resizeCanvas = () => {
    const devicePixelRatio = Math.min(window.devicePixelRatio, 2);
    this.canvasEl.width = window.innerWidth * devicePixelRatio;
    this.canvasEl.height = window.innerHeight * devicePixelRatio;
    this.gl.viewport(0, 0, this.canvasEl.width, this.canvasEl.height);
    this.gl.uniform1f(this.uRatio, this.canvasEl.width / this.canvasEl.height);
  };

  handleMouseMove = (e) => {
    this.pointer.tX = e.clientX;
    this.pointer.tY = e.clientY;
  };

  handleTouchMove = (e) => {
    if (e.touches[0]) {
      this.pointer.tX = e.touches[0].clientX;
      this.pointer.tY = e.touches[0].clientY;
    }
  };

  addEventListeners() {
    window.addEventListener('resize', this.resizeCanvas);
    window.addEventListener('pointermove', this.handleMouseMove);
    window.addEventListener('touchmove', this.handleTouchMove);
  }

  render = () => {
    const currentTime = performance.now();
    this.pointer.x += (this.pointer.tX - this.pointer.x) * 0.2;
    this.pointer.y += (this.pointer.tY - this.pointer.y) * 0.2;
    
    this.gl.uniform1f(this.uTime, currentTime);
    this.gl.uniform2f(this.uPointerPosition, 
      this.pointer.x / window.innerWidth, 
      1 - this.pointer.y / window.innerHeight
    );
    this.gl.uniform1f(this.uScrollProgress, window.pageYOffset / (2 * window.innerHeight));
    
    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    this.animationRef = requestAnimationFrame(this.render);
  };
}

customElements.define('neural-vortex', InteractiveNeuralVortex);

// Premium Smooth Scroll Implementation
document.addEventListener('DOMContentLoaded', () => {
  const sections = document.querySelectorAll('section');
  let isScrolling = false;
  let currentSectionIndex = 0;
  let isDetailViewActive = false;

  // Determine current section based on scroll position
  const updateCurrentIndex = () => {
    if (isDetailViewActive) return;
    const scrollPos = window.scrollY;
    sections.forEach((section, index) => {
      if (Math.abs(scrollPos - section.offsetTop) < 10) {
        currentSectionIndex = index;
      }
    });
  };

  const scrollToSection = (index) => {
    if (index < 0 || index >= sections.length || isScrolling || isDetailViewActive) return;
    
    isScrolling = true;
    currentSectionIndex = index;
    
    window.scrollTo({
      top: sections[index].offsetTop,
      behavior: 'smooth'
    });

    setTimeout(() => {
      isScrolling = false;
    }, 800);
  };

  // Keyboard Support
  window.addEventListener('keydown', (e) => {
    if (isScrolling || isDetailViewActive) return;
    
    if (e.key === 'ArrowDown' || e.key === 'PageDown') {
      e.preventDefault();
      scrollToSection(currentSectionIndex + 1);
    } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
      e.preventDefault();
      scrollToSection(currentSectionIndex - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      scrollToSection(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      scrollToSection(sections.length - 1);
    }
  });

  // Wheel Event
  window.addEventListener('wheel', (e) => {
    if (isDetailViewActive) return;
    e.preventDefault();
    if (isScrolling) return;
    
    if (e.deltaY > 0) {
      scrollToSection(currentSectionIndex + 1);
    } else if (e.deltaY < 0) {
      scrollToSection(currentSectionIndex - 1);
    }
  }, { passive: false });

  // Touch Support
  let touchStartY = 0;
  window.addEventListener('touchstart', (e) => {
    if (isDetailViewActive) return;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (isDetailViewActive) return;
    if (isScrolling) e.preventDefault();
  }, { passive: false });

  window.addEventListener('touchend', (e) => {
    if (isDetailViewActive) return;
    const touchEndY = e.changedTouches[0].clientY;
    const deltaY = touchStartY - touchEndY;
    
    if (Math.abs(deltaY) > 50) {
      if (deltaY > 0) {
        scrollToSection(currentSectionIndex + 1);
      } else {
        scrollToSection(currentSectionIndex - 1);
      }
    }
  }, { passive: true });

  // Robotics Card Expansion Implementation
  const roboticsCard = document.querySelector('#robotics-card');
  const roboticsDetail = document.querySelector('#robotics-detail');
  const backBtn = document.querySelector('.back-btn');

  const openRobotics = () => {
    if (isDetailViewActive) return;
    
    isDetailViewActive = true;
    const rect = roboticsCard.getBoundingClientRect();
    
    // Set initial fixed position for animation
    roboticsCard.style.top = `${rect.top}px`;
    roboticsCard.style.left = `${rect.left}px`;
    roboticsCard.style.width = `${rect.width}px`;
    roboticsCard.style.height = `${rect.height}px`;
    roboticsCard.classList.add('expanding');

    // Trigger expansion to full screen
    requestAnimationFrame(() => {
      roboticsCard.style.top = '0';
      roboticsCard.style.left = '0';
      roboticsCard.style.width = '100vw';
      roboticsCard.style.height = '100vh';
      roboticsCard.style.background = '#000';
    });

    // Show detail view content
    setTimeout(() => {
      roboticsDetail.classList.add('active');
      history.pushState({ view: 'robotics' }, 'Robotics');
    }, 600);
  };

  const closeRobotics = () => {
    if (!isDetailViewActive) return;
    
    roboticsDetail.classList.remove('active');
    
    // Shrink card back to original grid position
    // We need to re-calculate original grid position relative to viewport
    const gridItem = document.querySelector('.expertise-grid').children[0];
    const rect = gridItem.getBoundingClientRect();

    roboticsCard.style.top = `${rect.top}px`;
    roboticsCard.style.left = `${rect.left}px`;
    roboticsCard.style.width = `${rect.width}px`;
    roboticsCard.style.height = `${rect.height}px`;
    roboticsCard.style.background = 'rgba(255, 255, 255, 0.02)';

    setTimeout(() => {
      roboticsCard.classList.remove('expanding');
      roboticsCard.style = ''; // Reset inline styles
      isDetailViewActive = false;
    }, 800);
  };

  roboticsCard.addEventListener('click', openRobotics);
  backBtn.addEventListener('click', () => history.back());

  // Handle Browser Back Button
  window.addEventListener('popstate', (e) => {
    if (isDetailViewActive) {
      closeRobotics();
    }
  });

  updateCurrentIndex();

  // Image Lightbox Implementation
  const images = document.querySelectorAll('.clickable-image img');
  const lightbox = document.createElement('div');
  lightbox.id = 'lightbox';
  const lightboxImg = document.createElement('img');
  lightbox.appendChild(lightboxImg);
  document.body.appendChild(lightbox);

  images.forEach(image => {
    image.style.cursor = 'zoom-in';
    image.addEventListener('click', (e) => {
      lightbox.classList.add('active');
      lightboxImg.src = image.src;
      document.body.style.overflow = 'hidden';
    });
  });

  lightbox.addEventListener('click', () => {
    lightbox.classList.remove('active');
    document.body.style.overflow = 'auto';
  });
});
