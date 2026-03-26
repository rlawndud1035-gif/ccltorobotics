import './style.css';
import { HandGestureManager } from './hand-gesture.js';
import { FaceTrackingManager } from './face-tracking.js';

class IsoLevelWarp extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.mouse = { x: -1000, y: -1000, targetX: -1000, targetY: -1000 };
    this.time = 0;
    this.animationFrameId = null;
  }

  connectedCallback() {
    this.color = this.getAttribute('color') || "122, 40, 255";
    this.speed = parseFloat(this.getAttribute('speed')) || 1;
    this.density = parseInt(this.getAttribute('density')) || 40;
    
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          position: absolute;
          inset: 0;
          z-index: -1;
          overflow: hidden;
          background: transparent;
          pointer-events: none;
        }
        canvas {
          display: block;
          width: 100%;
          height: 100%;
        }
        .vignette {
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at center, transparent 0%, #000 100%);
          opacity: 0.5;
          pointer-events: none;
        }
      </style>
      <canvas></canvas>
      <div class="vignette"></div>
    `;
    
    this.canvas = this.shadowRoot.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    
    this.resize();
    this._resizeHandler = () => this.resize();
    window.addEventListener('resize', this._resizeHandler);
    
    this._pointerMoveHandler = (e) => this.handleMouseMove(e);
    window.addEventListener('pointermove', this._pointerMoveHandler);
    
    this.draw();
  }

  disconnectedCallback() {
    cancelAnimationFrame(this.animationFrameId);
    window.removeEventListener('resize', this._resizeHandler);
    window.removeEventListener('pointermove', this._pointerMoveHandler);
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.width = this.offsetWidth || window.innerWidth;
    this.height = this.offsetHeight || window.innerHeight;
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.ctx.scale(dpr, dpr);
  }

  handleMouseMove(e) {
    const rect = this.getBoundingClientRect();
    this.mouse.targetX = e.clientX - rect.left;
    this.mouse.targetY = e.clientY - rect.top;
  }

  updateTarget(x, y) {
    const rect = this.getBoundingClientRect();
    this.mouse.targetX = x - rect.left;
    this.mouse.targetY = y - rect.top;
  }

  smoothMix(a, b, t) {
    return a + (b - a) * t;
  }

  draw() {
    const ctx = this.ctx;
    const width = this.width;
    const height = this.height;
    
    ctx.clearRect(0, 0, width, height);
    
    this.mouse.x = this.smoothMix(this.mouse.x, this.mouse.targetX, 0.05);
    this.mouse.y = this.smoothMix(this.mouse.y, this.mouse.targetY, 0.05);

    this.time += 0.005 * this.speed;

    const gridGap = this.density;
    const rows = Math.ceil(height / gridGap) + 4;
    const cols = Math.ceil(width / gridGap) + 4;

    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, `rgba(${this.color}, 0)`);
    gradient.addColorStop(0.5, `rgba(${this.color}, 0.25)`);
    gradient.addColorStop(1, `rgba(${this.color}, 0)`);

    ctx.strokeStyle = gradient;
    ctx.lineWidth = 1;

    // Horizontal lines
    for (let y = 0; y <= rows; y++) {
      ctx.beginPath();
      for (let x = 0; x <= cols; x++) {
        const baseX = (x * gridGap) - (gridGap * 2);
        const baseY = (y * gridGap) - (gridGap * 2);

        const wave = Math.sin(x * 0.2 + this.time) * Math.cos(y * 0.2 + this.time) * 15;
        
        const dx = baseX - this.mouse.x;
        const dy = baseY - this.mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxDist = 350;
        
        const force = Math.max(0, (maxDist - dist) / maxDist);
        const interactionY = -(force * force) * 70;

        const finalX = baseX;
        const finalY = baseY + wave + interactionY;

        if (x === 0) ctx.moveTo(finalX, finalY);
        else ctx.lineTo(finalX, finalY);
      }
      ctx.stroke();
    }
    
    // Vertical lines
    for (let x = 0; x <= cols; x++) {
      ctx.beginPath();
      for (let y = 0; y <= rows; y++) {
        const baseX = (x * gridGap) - (gridGap * 2);
        const baseY = (y * gridGap) - (gridGap * 2);

        const wave = Math.sin(x * 0.2 + this.time) * Math.cos(y * 0.2 + this.time) * 15;
        
        const dx = baseX - this.mouse.x;
        const dy = baseY - this.mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxDist = 350;
        
        const force = Math.max(0, (maxDist - dist) / maxDist);
        const interactionY = -(force * force) * 70;

        const finalX = baseX;
        const finalY = baseY + wave + interactionY;

        if (y === 0) ctx.moveTo(finalX, finalY);
        else ctx.lineTo(finalX, finalY);
      }
      ctx.stroke();
    }

    this.animationFrameId = requestAnimationFrame(() => this.draw());
  }
}

customElements.define('iso-level-warp', IsoLevelWarp);

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
  let activeDetailType = null; // 'robotics' or '3d-design'

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

  // Wheel Event - Removed preventDefault to allow CSS Scroll Snap to work naturally
  window.addEventListener('wheel', (e) => {
    if (isDetailViewActive) return;
  }, { passive: true });

  // Update index on scroll
  window.addEventListener('scroll', () => {
    if (!isScrolling && !isDetailViewActive) {
      updateCurrentIndex();
    }
  }, { passive: true });

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

  // Modular Content Loading & Animation Setup
  const initDetailAnimations = (containerId) => {
    const container = document.getElementById(containerId);
    if (!container) {
      console.warn(`Container ${containerId} not found, retrying...`);
      setTimeout(() => initDetailAnimations(containerId), 100);
      return;
    }

    const sectionsLocal = container.querySelectorAll('section');

    // --- Work Process Pyramid Animation ---
    const processBlocks = container.querySelectorAll('.process-block');
    const processTrigger = container.querySelector('#process-trigger');
    if (processTrigger && processBlocks.length > 0) {
      const processObserver = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
          processBlocks.forEach((block, index) => setTimeout(() => block.classList.add('active'), index * 200));
          processObserver.unobserve(entries[0].target);
        }
      }, { root: container, threshold: 0.1 });
      processObserver.observe(processTrigger);
    }

    // --- Project Goals Interactive ---
    const goalColumns = container.querySelectorAll('.goal-column');
    const goalsInstruction = container.querySelector('#goals-instruction');
    let activeGoalIndex = 0; 
    const updateGoals = (index) => {
      goalColumns.forEach((col, i) => i <= index ? col.classList.add('active') : col.classList.remove('active'));
      if (goalsInstruction) index >= 0 ? goalsInstruction.classList.add('hidden') : goalsInstruction.classList.remove('hidden');
    };
    if (goalColumns.length > 0) updateGoals(0);

    // --- Robotics 3D Gallery ---
    const galleryItems = container.querySelectorAll('.gallery-3d-item');
    let activeGalleryIndex = 0;
    let galleryInterval = null;

    const updateGallery3D = (index) => {
      const total = galleryItems.length;
      activeGalleryIndex = (index + total) % total;

      galleryItems.forEach((item, i) => {
        item.className = 'gallery-3d-item';
        if (i === activeGalleryIndex) {
          item.classList.add('active');
        } else if (i === (activeGalleryIndex - 1 + total) % total) {
          item.classList.add('prev');
        } else if (i === (activeGalleryIndex + 1) % total) {
          item.classList.add('next');
        } else {
          const dist = (i - activeGalleryIndex + total) % total;
          if (dist > total / 2) {
            item.classList.add('hidden-left');
          } else {
            item.classList.add('hidden-right');
          }
        }
      });
    };

    const startGalleryAutoScroll = () => {
      if (galleryInterval) clearInterval(galleryInterval);
      galleryInterval = setInterval(() => {
        updateGallery3D(activeGalleryIndex + 1);
      }, 2500);
    };

    const stopGalleryAutoScroll = () => {
      if (galleryInterval) clearInterval(galleryInterval);
      galleryInterval = null;
    };

    if (galleryItems.length > 0) {
      updateGallery3D(0);
    }

    // --- Question Section ---
    const questionTrigger = container.querySelector('#question-trigger');
    if (questionTrigger) {
      const questionObserver = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
          entries[0].target.classList.add('active');
          setTimeout(() => container.querySelectorAll('.bubble-card').forEach(b => b.classList.add('floating')), 2000);
          questionObserver.unobserve(entries[0].target);
        }
      }, { root: container, threshold: 0.3 });
      questionObserver.observe(questionTrigger);
    }

    // --- State Management Variables ---
    let isBrandSectionActive = false;
    let isDdsSectionActive = false;
    let isGallerySectionActive = false;
    let isGoalsSectionActive = false;
    let isCoreElementsActive = false;

    const brandTrigger = container.querySelector('#brand-trigger');
    const ddsTrigger = container.querySelector('#dds-trigger');
    const galleryTrigger = container.querySelector('#gallery-3d-trigger');
    const goalsTrigger = container.querySelector('#goals-interactive-trigger');
    const coreElementsTrigger = container.querySelector('#core-elements-trigger');

    if (brandTrigger) new IntersectionObserver(entries => { isBrandSectionActive = entries[0].isIntersecting; }, { root: container, threshold: 0.3 }).observe(brandTrigger);
    if (ddsTrigger) {
      new IntersectionObserver(entries => {
        isDdsSectionActive = entries[0].isIntersecting;
      }, { root: container, threshold: 0.4 }).observe(ddsTrigger);
    }

    if (galleryTrigger) new IntersectionObserver(entries => {
      isGallerySectionActive = entries[0].isIntersecting;
      if (isGallerySectionActive) startGalleryAutoScroll();
      else stopGalleryAutoScroll();
    }, { root: container, threshold: 0.3 }).observe(galleryTrigger);

    const dashVideoTrigger = container.querySelector('#dashboard-video-trigger');
    if (dashVideoTrigger) {
      new IntersectionObserver(entries => {
        if (entries[0].isIntersecting) {
          entries[0].target.classList.add('active');
        }
      }, { root: container, threshold: 0.1 }).observe(dashVideoTrigger);
    }

    const energyFlowTrigger = container.querySelector('#energy-flow-trigger');
    if (energyFlowTrigger) {
      new IntersectionObserver(entries => {
        if (entries[0].isIntersecting) {
          entries[0].target.classList.add('active');
        }
      }, { root: container, threshold: 0.2 }).observe(energyFlowTrigger);
    }

    if (goalsTrigger) new IntersectionObserver(entries => { isGoalsSectionActive = entries[0].isIntersecting; }, { root: container, threshold: 0.3 }).observe(goalsTrigger);
    
    if (coreElementsTrigger) {
      new IntersectionObserver(entries => {
        isCoreElementsActive = entries[0].isIntersecting;
        if (entries[0].isIntersecting) {
          entries[0].target.classList.add('active');
        }
      }, { root: container, threshold: 0.4 }).observe(coreElementsTrigger);
    }

    const mergeTrigger = container.querySelector('#merge-trigger');
    if (mergeTrigger) {
      new IntersectionObserver(entries => {
        if (entries[0].isIntersecting) {
          entries[0].target.classList.add('active');
          setTimeout(() => {
            entries[0].target.classList.add('converge');
          }, 4000); 
        }
      }, { root: container, threshold: 0.4 }).observe(mergeTrigger);
    }

    // --- Products Section & Sequential Line Drawing ---
    const productsTrigger = container.querySelector('#products-trigger');
    const productsLinesSvg = container.querySelector('#products-lines-svg');
    const productsTitle = container.querySelector('.products-title');
    const ddsCentralNode = container.querySelector('#dds-central-node');

    function drawProductLines() {
      if (!productsLinesSvg || !productsTitle || !ddsCentralNode) return;
      const widgetItemsCurrent = container.querySelectorAll('.product-widget');
      if (widgetItemsCurrent.length === 0) return;

      const existingPaths = productsLinesSvg.querySelectorAll('path');
      existingPaths.forEach(p => p.remove());

      const svgRect = productsLinesSvg.getBoundingClientRect();
      const ddsRect = ddsCentralNode.getBoundingClientRect();
      const titleRect = productsTitle.getBoundingClientRect();

      if (svgRect.width === 0 || ddsRect.width === 0) {
        setTimeout(drawProductLines, 100);
        return;
      }

      const ddsCenterX = (ddsRect.left + ddsRect.right) / 2 - svgRect.left;
      const ddsCenterY = (ddsRect.top + ddsRect.bottom) / 2 - svgRect.top;
      const widgetPaths = [];

      widgetItemsCurrent.forEach(widget => {
        const widgetRect = widget.getBoundingClientRect();
        const startX = (widgetRect.left + widgetRect.right) / 2 - svgRect.left;
        const startY = (widgetRect.top + widgetRect.bottom) / 2 - svgRect.top;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const cpY = (startY + ddsCenterY) / 2;
        path.setAttribute('d', `M ${startX} ${startY} C ${startX} ${cpY}, ${ddsCenterX} ${cpY}, ${ddsCenterX} ${ddsCenterY}`);
        path.setAttribute('class', 'connecting-path widget-path');
        productsLinesSvg.appendChild(path);
        const len = path.getTotalLength();
        path.style.strokeDasharray = len;
        path.style.strokeDashoffset = len;
        widgetPaths.push(path);
      });

      const titleCenterX = (titleRect.left + titleRect.right) / 2 - svgRect.left;
      const titleTopY = titleRect.top - svgRect.top;
      const mainPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const mainCpY = (ddsCenterY + titleTopY) / 2;
      mainPath.setAttribute('d', `M ${ddsCenterX} ${ddsCenterY} C ${ddsCenterX} ${mainCpY}, ${titleCenterX} ${mainCpY}, ${titleCenterX} ${titleTopY}`);
      mainPath.setAttribute('class', 'connecting-path main-path');
      productsLinesSvg.appendChild(mainPath);
      const mainLen = mainPath.getTotalLength();
      mainPath.style.strokeDasharray = mainLen;
      mainPath.style.strokeDashoffset = mainLen;

      productsLinesSvg.getBoundingClientRect();

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          widgetPaths.forEach(p => {
            p.style.transition = "stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.5s ease";
            p.style.strokeDashoffset = "0";
            p.style.opacity = "0.8";
            setTimeout(() => p.classList.add('flow-active'), 1500);
          });
          setTimeout(() => {
            mainPath.style.transition = "stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.5s ease";
            mainPath.style.strokeDashoffset = "0";
            mainPath.style.opacity = "1";
            setTimeout(() => mainPath.classList.add('flow-active'), 1500);
          }, 800);
        });
      });
    }

    if (productsTrigger) {
      const productsObserver = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting) {
          entries[0].target.classList.add('active-products');
          setTimeout(drawProductLines, 600);
        }
      }, { root: container, threshold: 0.1 });
      productsObserver.observe(productsTrigger);
    }

    // Keyboard Listener for detail view
    const handleKeyDown = (e) => {
      if (!isDetailViewActive || window.innerWidth <= 768) return;
      if (activeDetailType && !containerId.includes(activeDetailType)) return;

      if (isBrandSectionActive) {
        if (e.key === 'ArrowRight') brandTrigger.classList.add('blue-state');
        else if (e.key === 'ArrowLeft') brandTrigger.classList.remove('blue-state');
        if (e.key.startsWith('Arrow')) e.preventDefault();
      }

      if (isDdsSectionActive) {
        if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
          if (!ddsTrigger.classList.contains('active-dds')) {
            ddsTrigger.classList.add('active-dds');
            e.preventDefault();
          }
        }
      }

      const productsSection = container.querySelector('#products-trigger');
      if (productsSection && Math.abs(container.scrollTop - productsSection.offsetTop) < 10) {
        const hasCollab = productsSection.classList.contains('collab-mode');
        const hasGlow = productsSection.classList.contains('dds-glow-mode');
        const hasOkay = productsSection.classList.contains('okay-mode');
        if (e.key === 'ArrowDown') {
          if (!hasCollab) { productsSection.classList.add('collab-mode'); e.preventDefault(); return; }
          else if (!hasGlow) { productsSection.classList.add('dds-glow-mode'); e.preventDefault(); return; }
          else if (!hasOkay) { productsSection.classList.add('okay-mode'); e.preventDefault(); return; }
        } else if (e.key === 'ArrowUp') {
          if (hasOkay) { productsSection.classList.remove('okay-mode'); e.preventDefault(); return; }
          else if (hasGlow) { productsSection.classList.remove('dds-glow-mode'); e.preventDefault(); return; }
          else if (hasCollab) { productsSection.classList.remove('collab-mode'); e.preventDefault(); return; }
        }
      }

      if (isGoalsSectionActive) {
        if (e.key === 'ArrowRight' && activeGoalIndex < 3) { activeGoalIndex++; updateGoals(activeGoalIndex); e.preventDefault(); }
        else if (e.key === 'ArrowLeft' && activeGoalIndex >= 0) { activeGoalIndex--; updateGoals(activeGoalIndex); e.preventDefault(); }
      }

      if (isGallerySectionActive) {
        if (e.key === 'ArrowRight' && activeGalleryIndex < galleryItems.length - 1) { activeGalleryIndex++; updateGallery3D(activeGalleryIndex); e.preventDefault(); }
        else if (e.key === 'ArrowLeft' && activeGalleryIndex > 0) { activeGalleryIndex--; updateGallery3D(activeGalleryIndex); e.preventDefault(); }
      }

      const currentScroll = container.scrollTop;
      const sectionHeight = window.innerHeight;
      let targetSectionIndex = Math.round(currentScroll / sectionHeight);
      if (e.key === 'ArrowDown' && !e.repeat && targetSectionIndex < sectionsLocal.length - 1) {
        e.preventDefault();
        sectionsLocal[targetSectionIndex + 1].scrollIntoView({ behavior: 'smooth' });
      } else if (e.key === 'ArrowUp' && !e.repeat && targetSectionIndex > 0) {
        e.preventDefault();
        sectionsLocal[targetSectionIndex - 1].scrollIntoView({ behavior: 'smooth' });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
  };

  // --- Modular Content Loading & Animation Setup ---
  const loadedContents = new Set();
  
  const loadContent = async (type, url, detailEl, containerId) => {
    if (loadedContents.has(type)) return true;
    try {
      console.log(`Loading content for ${type} from ${url}...`);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const html = await response.text();
      detailEl.innerHTML = html;
      loadedContents.add(type);
      
      // Initialize animations after a short delay to ensure DOM is ready
      setTimeout(() => initDetailAnimations(containerId), 50);
      
      const backBtn = detailEl.querySelector('.back-btn');
      if (backBtn) {
        backBtn.addEventListener('click', (e) => {
          e.preventDefault();
          history.back();
        });
      }
      return true;
    } catch (err) {
      console.error(`Failed to load ${type} content:`, err);
      detailEl.innerHTML = `<div class="detail-content"><button class="back-btn" onclick="history.back()">← Back</button><h1 class="geist-h1">Error</h1><p class="geist-h2">Failed to load content. Please try again.</p></div>`;
      return false;
    }
  };

  const openDetail = async (type, cardEl, detailEl, containerId) => {
    if (isDetailViewActive) return;
    isDetailViewActive = true;
    activeDetailType = type;
    
    // Ensure content is loaded
    const url = type === 'robotics' ? 'robotics.html' : '3d-design.html';
    await loadContent(type, url, detailEl, containerId);
    
    const rect = cardEl.getBoundingClientRect();
    cardEl.style.top = `${rect.top}px`;
    cardEl.style.left = `${rect.left}px`;
    cardEl.style.width = `${rect.width}px`;
    cardEl.style.height = `${rect.height}px`;
    cardEl.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
    cardEl.classList.add('expanding');
    
    // Start expansion animation
    requestAnimationFrame(() => {
      cardEl.style.top = '0';
      cardEl.style.left = '0';
      cardEl.style.width = '100vw';
      cardEl.style.height = '100vh';
      cardEl.style.backgroundColor = '#000';
    });
    
    // Show detail content
    setTimeout(() => {
      detailEl.classList.add('active');
      history.pushState({ view: type }, type.charAt(0).toUpperCase() + type.slice(1));
    }, 400);
  };

  const closeDetail = (type, cardEl, detailEl) => {
    if (!isDetailViewActive) return;
    detailEl.classList.remove('active');
    
    setTimeout(() => {
      // Find the card's original position in the grid
      const rect = document.querySelector(`.expertise-card[id="${cardEl.id}"]`).parentElement.getBoundingClientRect();
      // Since it's a 4-column grid, we need to be more precise if possible
      // But using the current rect from the hidden placeholder/original position is better
      const originalCard = document.getElementById(cardEl.id);
      originalCard.classList.remove('expanding');
      const targetRect = originalCard.getBoundingClientRect();
      
      cardEl.style.top = `${targetRect.top}px`;
      cardEl.style.left = `${targetRect.left}px`;
      cardEl.style.width = `${targetRect.width}px`;
      cardEl.style.height = `${targetRect.height}px`;
      cardEl.style.backgroundColor = 'rgba(255, 255, 255, 0.02)';
      
      setTimeout(() => {
        cardEl.classList.remove('expanding');
        cardEl.style = '';
        isDetailViewActive = false;
        activeDetailType = null;
      }, 800);
    }, 100);
  };

  // Expertise Cards Setup
  const setupExpertiseCards = () => {
    const cards = [
      { id: 'robotics-card', type: 'robotics', detailId: 'robotics-detail', containerId: 'robotics-scroll-container' },
      { id: '3d-design-card', type: '3d-design', detailId: '3d-design-detail', containerId: '3d-design-scroll-container' }
    ];

    cards.forEach(config => {
      const card = document.getElementById(config.id);
      const detail = document.getElementById(config.detailId);
      if (card && detail) {
        // Preload content
        loadContent(config.type, `${config.type}.html`, detail, config.containerId);
        
        card.addEventListener('click', () => {
          openDetail(config.type, card, detail, config.containerId);
        });
      }
    });
  };

  setupExpertiseCards();

  window.addEventListener('popstate', (e) => {
    if (isDetailViewActive) {
      const card = activeDetailType === 'robotics' ? document.getElementById('robotics-card') : document.getElementById('3d-design-card');
      const detail = activeDetailType === 'robotics' ? document.getElementById('robotics-detail') : document.getElementById('3d-design-detail');
      if (card && detail) closeDetail(activeDetailType, card, detail);
    }
  });

  updateCurrentIndex();

  const images = document.querySelectorAll('.clickable-image img');
  const lightbox = document.createElement('div');
  lightbox.id = 'lightbox';
  const lightboxImg = document.createElement('img');
  lightbox.appendChild(lightboxImg);
  document.body.appendChild(lightbox);
  
  images.forEach(image => {
    image.style.cursor = 'zoom-in';
    image.addEventListener('click', () => {
      lightbox.classList.add('active');
      lightboxImg.src = image.src;
      document.body.style.overflow = 'hidden';
    });
  });
  
  lightbox.addEventListener('click', () => {
    lightbox.classList.remove('active');
    document.body.style.overflow = 'auto';
  });

  // Eye-Tracking Experience
  class EyeTrackingManager {
    constructor() {
      this.gazePointer = document.getElementById('gaze-pointer');
      this.startBtn = document.getElementById('start-tracking-btn');
      this.stopBtn = document.getElementById('stop-tracking-btn');
      this.overlay = document.getElementById('calibration-overlay');
      this.statusInfo = document.getElementById('calibration-info');
      this.points = document.querySelectorAll('.calibration-point');
      this.isCalibrated = false;
      this.calibrationClicks = 0;
      
      if (this.startBtn) this.init();
    }

    init() {
      this.startBtn.addEventListener('click', () => this.start());
      this.stopBtn.addEventListener('click', () => this.stop());
      
      this.points.forEach(point => {
        point.addEventListener('click', () => {
          if (point.classList.contains('calibrated')) return;
          point.classList.add('calibrated');
          this.calibrationClicks++;
          
          if (this.calibrationClicks >= this.points.length) {
            this.completeCalibration();
          }
        });
      });
    }

    async start() {
      if (typeof webgazer === 'undefined') {
        alert('Eye-tracking module is still loading. Please try again in a moment.');
        return;
      }

      this.startBtn.disabled = true;
      this.startBtn.innerText = 'Initializing Camera...';

      try {
        await webgazer.setRegression('ridge')
          .setTracker('TKM')
          .setGazeListener((data, elapsedTime) => {
            if (data == null) return;
            this.updateGaze(data.x, data.y);
          })
          .saveDataAcrossSessions(true)
          .begin();

        webgazer.showVideoPreview(true)
          .showPredictionPoints(false)
          .applyKalmanFilter(true);

        // Position and style the video preview
        const checkVideoInterval = setInterval(() => {
          const video = document.getElementById('webgazerVideoContainer');
          const videoFeed = document.getElementById('webgazerVideoFeed');
          const faceOverlay = document.getElementById('webgazerFaceOverlay');
          const faceFeedbackBox = document.getElementById('webgazerFaceFeedbackBox');

          if (video) {
            video.style.top = '20px';
            video.style.left = '20px';
            video.style.width = '240px';
            video.style.height = '180px';
            video.style.borderRadius = '12px';
            video.style.overflow = 'hidden';
            video.style.zIndex = '10002';
            video.style.border = '2px solid rgba(122, 40, 255, 0.5)';
            video.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
            
            if (videoFeed) {
              videoFeed.style.width = '100%';
              videoFeed.style.height = '100%';
              videoFeed.style.objectFit = 'cover';
            }
            
            if (faceOverlay) faceOverlay.style.display = 'none';
            if (faceFeedbackBox) faceFeedbackBox.style.border = '2px solid #4dff4d';

            clearInterval(checkVideoInterval);
          }
        }, 100);

        this.startBtn.style.display = 'none';
        this.stopBtn.style.display = 'inline-block';
        this.overlay.style.display = 'flex';
        this.statusInfo.style.display = 'block';
        
      } catch (err) {
        console.error('Eye tracking initialization failed:', err);
        this.startBtn.disabled = false;
        this.startBtn.innerText = 'Enable Eye-Tracking';
        alert('Camera access denied or failed to initialize.');
      }
    }

    completeCalibration() {
      this.overlay.style.opacity = '0';
      setTimeout(() => {
        this.overlay.style.display = 'none';
        this.statusInfo.innerHTML = '<p style="color: #4dff4d;">✓ Neural Tracking Active</p>';
        this.gazePointer.classList.add('active');
        this.isCalibrated = true;
      }, 500);
    }

    updateGaze(x, y) {
      if (!this.isCalibrated) return;
      
      // Update background graphics
      const background = document.querySelector('neural-vortex');
      if (background) {
        background.updateTarget(x, y);
      }

      // Update gaze pointer position
      requestAnimationFrame(() => {
        this.gazePointer.style.left = `${x}px`;
        this.gazePointer.style.top = `${y}px`;
      });
    }

    stop() {
      if (typeof webgazer !== 'undefined') {
        webgazer.end();
      }
      this.isCalibrated = false;
      this.calibrationClicks = 0;
      this.gazePointer.classList.remove('active');
      this.stopBtn.style.display = 'none';
      this.startBtn.style.display = 'inline-block';
      this.startBtn.disabled = false;
      this.startBtn.innerText = 'Enable Eye-Tracking';
      this.statusInfo.style.display = 'none';
      this.overlay.style.display = 'none';
      this.overlay.style.opacity = '1';
      this.points.forEach(p => p.classList.remove('calibrated'));
      
      const video = document.getElementById('webgazerVideoContainer');
      if (video) video.remove();
    }
  }

  new EyeTrackingManager();
  new HandGestureManager();
});
