import './style.css'

// Traffic Simulation for Hero Section
const initTrafficSimulation = () => {
  const heroSection = document.querySelector('.hero');
  if (!heroSection) return;

  // Create Canvas Overlay
  const canvas = document.createElement('canvas');
  canvas.classList.add('traffic-overlay');
  heroSection.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  let width, height;
  let roads = [];
  let signals = [];

  // Road Generation (Manhattan Grid)
  const generateRoads = () => {
    roads = [];
    const numH = Math.floor(height / 100); // Horizontal roads every ~100px
    const numV = Math.floor(width / 150);  // Vertical roads every ~150px

    // Horizontal Roads
    for (let i = 0; i < numH; i++) {
      const y = (height / numH) * i + (Math.random() * 50);
      roads.push({
        type: 'H',
        y: y,
        x1: 0,
        x2: width,
        laneCount: Math.random() > 0.5 ? 2 : 1
      });
    }

    // Vertical Roads
    for (let i = 0; i < numV; i++) {
      const x = (width / numV) * i + (Math.random() * 50);
      roads.push({
        type: 'V',
        x: x,
        y1: 0,
        y2: height,
        laneCount: Math.random() > 0.5 ? 2 : 1
      });
    }
  };

  // Signal (Car) Class
  class Signal {
    constructor() {
      this.reset();
    }

    reset() {
      // Pick a random road
      const road = roads[Math.floor(Math.random() * roads.length)];
      this.road = road;

      // Speed and size
      this.speed = (Math.random() * 2 + 1) * (Math.random() > 0.5 ? 1 : -1); // Random direction
      this.size = Math.random() * 2 + 1;
      this.color = `rgba(100, 200, 255, ${Math.random() * 0.5 + 0.5})`; // Blue-ish

      if (road.type === 'H') {
        this.x = this.speed > 0 ? 0 : width;
        this.y = road.y + (Math.random() * 10 - 5); // Lane jitter
      } else {
        this.x = road.x + (Math.random() * 10 - 5);
        this.y = this.speed > 0 ? 0 : height;
      }
    }

    update() {
      if (this.road.type === 'H') {
        this.x += this.speed;
        // Respawn if out of bounds
        if ((this.speed > 0 && this.x > width) || (this.speed < 0 && this.x < 0)) this.reset();
      } else {
        this.y += this.speed;
        if ((this.speed > 0 && this.y > height) || (this.speed < 0 && this.y < 0)) this.reset();
      }
    }

    draw() {
      ctx.fillStyle = this.color;
      ctx.shadowBlur = 4;
      ctx.shadowColor = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0; // Reset
    }
  }

  // Resize Handler
  const resize = () => {
    width = heroSection.clientWidth;
    height = heroSection.clientHeight;
    canvas.width = width;
    canvas.height = height;
    generateRoads();
  };

  // Animation Loop
  const animate = () => {
    ctx.clearRect(0, 0, width, height);

    // Optional: Draw faint road lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    roads.forEach(road => {
      ctx.beginPath();
      if (road.type === 'H') {
        ctx.moveTo(0, road.y);
        ctx.lineTo(width, road.y);
      } else {
        ctx.moveTo(road.x, 0);
        ctx.lineTo(road.x, height);
      }
      ctx.stroke();
    });

    // Update and draw signals
    signals.forEach(signal => {
      signal.update();
      signal.draw();
    });

    requestAnimationFrame(animate);
  };

  // Init
  window.addEventListener('resize', resize);
  resize();

  // Create initial batch of signals
  for (let i = 0; i < 50; i++) {
    signals.push(new Signal());
  }

  animate();
};

document.addEventListener('DOMContentLoaded', initTrafficSimulation);

// Re-integrate Scroll Observer from previous step
document.addEventListener('DOMContentLoaded', () => {
  const observerOptions = {
    root: null,
    rootMargin: '0px',
    threshold: 0.1
  };

  const observer = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  const elements = document.querySelectorAll('.reveal-on-scroll');
  elements.forEach(el => observer.observe(el));
});
