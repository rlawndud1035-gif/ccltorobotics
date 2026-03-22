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

  // Modular Robotics Content Loading
  const roboticsCard = document.querySelector('#robotics-card');
  const roboticsDetail = document.querySelector('#robotics-detail');
  let isContentLoaded = false;

  const initRoboticsAnimations = () => {
    const container = document.getElementById('robotics-scroll-container');
    if (!container) return;

    const sections = container.querySelectorAll('section');
    const goalSlider = document.getElementById('goal-slider');
    const dots = document.querySelectorAll('.progress-dot');
    let isScrollingLocal = false;

    // --- Work Process Pyramid Animation ---
    const processBlocks = document.querySelectorAll('.process-block');
    const processTrigger = document.getElementById('process-trigger');
    
    if (processTrigger && processBlocks.length > 0) {
      const observerOptions = {
        root: container, // Use the scroll container as root
        threshold: 0.1 // 6층 높이를 고려하여 조금 더 일찍 트리거
      };

      const animateBlocks = () => {
        processBlocks.forEach((block, index) => {
          // 01번(인덱스 0)이 가장 먼저, 06번(인덱스 5)이 가장 나중에 나타남
          // 아래에서 위로 쌓이는 느낌을 위해 인덱스 순서대로 지연 시간 부여
          const delay = index * 200; 

          setTimeout(() => {
            block.classList.add('active');
          }, delay);
        });
      };

      const processObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            animateBlocks();
            processObserver.unobserve(entry.target);
          }
        });
      }, observerOptions);

      processObserver.observe(processTrigger);
    }

    // --- Project Goals Interactive (Keyboard Reveal) ---
    const goalsTrigger = document.getElementById('goals-interactive-trigger');
    const goalColumns = document.querySelectorAll('.goal-column');
    const goalsInstruction = document.getElementById('goals-instruction');
    let activeGoalIndex = 0; // Start with first goal visible
    let isGoalsSectionActive = false;

    // --- Robotics 3D Gallery Logic ---
    const galleryTrigger = document.getElementById('gallery-3d-trigger');
    const galleryItems = document.querySelectorAll('.gallery-3d-item');
    let activeGalleryIndex = 0;
    let isGallerySectionActive = false;

    const updateGallery3D = (index) => {
      galleryItems.forEach((item, i) => {
        item.className = 'gallery-3d-item'; // Reset classes
        if (i === index) {
          item.classList.add('active');
        } else if (i === index - 1) {
          item.classList.add('prev');
        } else if (i === index + 1) {
          item.classList.add('next');
        } else if (i < index) {
          item.classList.add('hidden-left');
        } else {
          item.classList.add('hidden-right');
        }
      });
    };

    // Initialize gallery state
    if (galleryItems.length > 0) updateGallery3D(0);

    const updateGoals = (index) => {
      goalColumns.forEach((col, i) => {
        if (i <= index) {
          col.classList.add('active');
        } else {
          col.classList.remove('active');
        }
      });
      
      if (index >= 0 && goalsInstruction) {
        goalsInstruction.classList.add('hidden');
      } else if (index < 0 && goalsInstruction) {
        goalsInstruction.classList.remove('hidden');
      }
    };

    // Initialize first goal state
    if (goalColumns.length > 0) updateGoals(0);

    // Observers
    const goalsObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        isGoalsSectionActive = entry.isIntersecting;
      });
    }, { threshold: 0.5 });

    const galleryObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        isGallerySectionActive = entry.isIntersecting;
      });
    }, { threshold: 0.5 });

    if (goalsTrigger) goalsObserver.observe(goalsTrigger);
    if (galleryTrigger) galleryObserver.observe(galleryTrigger);

    // --- Question Section Logic ---
    const questionTrigger = document.getElementById('question-trigger');
    const bubbleCards = document.querySelectorAll('.bubble-card');

    const questionObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('active');
          
          // Add floating animation class after they have emerged from the back
          setTimeout(() => {
            bubbleCards.forEach(bubble => bubble.classList.add('floating'));
          }, 2000);
          
          questionObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.3 });

    if (questionTrigger) questionObserver.observe(questionTrigger);

    // Global Keyboard Listener for detail view
    const handleKeyDown = (e) => {
      if (!isDetailViewActive || window.innerWidth <= 768) return;

      // Handle Goals Interaction
      if (isGoalsSectionActive) {
        if (e.key === 'ArrowRight') {
          if (activeGoalIndex < 3) {
            activeGoalIndex++;
            updateGoals(activeGoalIndex);
            e.preventDefault();
          }
        } else if (e.key === 'ArrowLeft') {
          if (activeGoalIndex >= 0) {
            activeGoalIndex--;
            updateGoals(activeGoalIndex);
            e.preventDefault();
          }
        }
      }

      // Handle 3D Gallery Interaction
      if (isGallerySectionActive) {
        if (e.key === 'ArrowRight') {
          if (activeGalleryIndex < galleryItems.length - 1) {
            activeGalleryIndex++;
            updateGallery3D(activeGalleryIndex);
            e.preventDefault();
          }
        } else if (e.key === 'ArrowLeft') {
          if (activeGalleryIndex > 0) {
            activeGalleryIndex--;
            updateGallery3D(activeGalleryIndex);
            e.preventDefault();
          }
        }
      }

      // Handle Section Navigation (ArrowUp/Down)
      const currentScroll = container.scrollTop;
      const sectionHeight = window.innerHeight;
      let targetSectionIndex = Math.round(currentScroll / sectionHeight);

      if (e.key === 'ArrowDown' && !e.repeat) {
        if (targetSectionIndex < sections.length - 1) {
          e.preventDefault();
          scrollToSectionDetail(targetSectionIndex + 1);
        }
      } else if (e.key === 'ArrowUp' && !e.repeat) {
        if (targetSectionIndex > 0) {
          e.preventDefault();
          scrollToSectionDetail(targetSectionIndex - 1);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    // Cleanup function when needed (though detail view is persistent in this app)
    // In a full SPA we would remove this on component unmount.

    function scrollToSectionDetail(index) {
      isScrollingLocal = true;
      sections[index].scrollIntoView({ behavior: 'smooth' });
      setTimeout(() => { isScrollingLocal = false; }, 1000);
    }
  };

  const loadRoboticsContent = async () => {
    if (isContentLoaded) return;
    try {
      const response = await fetch('robotics.html');
      const html = await response.text();
      roboticsDetail.innerHTML = html;
      isContentLoaded = true;
      
      // Initialize animations after content is injected
      initRoboticsAnimations();

      // Bind back button after content is loaded
      const backBtn = roboticsDetail.querySelector('.back-btn');
      if (backBtn) {
        backBtn.addEventListener('click', () => history.back());
      }
    } catch (err) {
      console.error('Failed to load robotics content:', err);
    }
  };

  // Pre-fetch content for zero-latency transition
  loadRoboticsContent();

  const openRobotics = () => {
    if (isDetailViewActive) return;
    
    isDetailViewActive = true;
    const rect = roboticsCard.getBoundingClientRect();
    
    roboticsCard.style.top = `${rect.top}px`;
    roboticsCard.style.left = `${rect.left}px`;
    roboticsCard.style.width = `${rect.width}px`;
    roboticsCard.style.height = `${rect.height}px`;
    roboticsCard.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
    roboticsCard.classList.add('expanding');

    requestAnimationFrame(() => {
      roboticsCard.style.top = '0';
      roboticsCard.style.left = '0';
      roboticsCard.style.width = '100vw';
      roboticsCard.style.height = '100vh';
      roboticsCard.style.backgroundColor = '#000';
    });

    setTimeout(() => {
      roboticsDetail.classList.add('active');
      history.pushState({ view: 'robotics' }, 'Robotics');
    }, 400);
  };

  const closeRobotics = () => {
    if (!isDetailViewActive) return;
    
    roboticsDetail.classList.remove('active');
    
    setTimeout(() => {
      const gridItem = document.querySelector('.expertise-grid').children[0];
      const rect = gridItem.getBoundingClientRect();

      roboticsCard.style.top = `${rect.top}px`;
      roboticsCard.style.left = `${rect.left}px`;
      roboticsCard.style.width = `${rect.width}px`;
      roboticsCard.style.height = `${rect.height}px`;
      roboticsCard.style.backgroundColor = 'rgba(255, 255, 255, 0.02)';

      setTimeout(() => {
        roboticsCard.classList.remove('expanding');
        roboticsCard.style = '';
        isDetailViewActive = false;
      }, 800);
    }, 100);
  };

  roboticsCard.addEventListener('click', openRobotics);

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
