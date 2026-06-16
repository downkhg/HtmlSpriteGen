/* js/curator.js */

export class SpriteCurator {
  constructor(curatorCanvasId, playerCanvasId, onCurationChanged) {
    this.canvas = document.getElementById(curatorCanvasId);
    this.ctx = this.canvas.getContext('2d');
    
    this.playerCanvas = document.getElementById(playerCanvasId);
    this.playerCtx = this.playerCanvas.getContext('2d');
    
    this.onCurationChanged = onCurationChanged;

    // State
    this.sourceCanvas = null; // Original transparent sheet canvas
    this.currentStateFrames = [];
    this.selectedFrameIndex = -1;
    
    // Viewing transforms for curator canvas
    this.zoom = 1.0;
    this.bgType = 'checkerboard'; // 'checkerboard', 'white', 'black'
    
    // Drag interaction state
    this.isDragging = false;
    this.startX = 0;
    this.startY = 0;
    
    // Animation Player state
    this.isPlaying = true;
    this.currentPlayIndex = 0;
    this.lastFrameTime = 0;
    this.playerFps = 6;
    this.playerLoop = true;
    
    this.initEvents();
    this.startPlayerLoop();
  }

  setSourceCanvas(canvas) {
    this.sourceCanvas = canvas;
  }

  setStateFrames(frames, selectedIndex = 0) {
    this.currentStateFrames = frames || [];
    this.selectedFrameIndex = Math.min(selectedIndex, this.currentStateFrames.length - 1);
    if (this.currentStateFrames.length > 0 && this.selectedFrameIndex < 0) {
      this.selectedFrameIndex = 0;
    }
    this.currentPlayIndex = 0;
    this.renderCurator();
  }

  setSelectedFrameIndex(index) {
    if (index >= 0 && index < this.currentStateFrames.length) {
      this.selectedFrameIndex = index;
      this.renderCurator();
      
      // Update UI fields outside
      if (this.onCurationChanged) {
        this.onCurationChanged(this.getSelectedFrame());
      }
    }
  }

  getSelectedFrame() {
    if (this.selectedFrameIndex >= 0 && this.selectedFrameIndex < this.currentStateFrames.length) {
      return this.currentStateFrames[this.selectedFrameIndex];
    }
    return null;
  }

  setZoom(z) {
    this.zoom = Math.max(0.5, Math.min(8.0, z));
    this.renderCurator();
  }

  setBgType(type) {
    this.bgType = type; // 'checkerboard', 'white', 'black'
    this.renderCurator();
    
    // Update player background too
    const playerWrapper = document.getElementById('playerBgWrapper');
    if (playerWrapper) {
      playerWrapper.className = 'preview-panel';
      if (type === 'checkerboard') playerWrapper.classList.add('checkerboard-bg');
      else if (type === 'white') playerWrapper.classList.add('white-bg');
      else if (type === 'black') playerWrapper.classList.add('black-bg');
    }
  }

  updateSelectedFrameNudge(nudgeX, nudgeY, scale, rotate, rejected) {
    const frame = this.getSelectedFrame();
    if (!frame) return;

    if (nudgeX !== undefined) frame.nudgeX = nudgeX;
    if (nudgeY !== undefined) frame.nudgeY = nudgeY;
    if (scale !== undefined) frame.scale = scale;
    if (rotate !== undefined) frame.rotate = rotate;
    if (rejected !== undefined) frame.rejected = rejected;

    this.renderCurator();
    if (this.onCurationChanged) {
      this.onCurationChanged(frame);
    }
  }

  initEvents() {
    // Mouse Drag events to Nudge X/Y offset
    this.canvas.addEventListener('mousedown', (e) => {
      const frame = this.getSelectedFrame();
      if (!frame || frame.rejected) return;

      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      this.isDragging = true;
      this.startX = mouseX;
      this.startY = mouseY;
    });

    this.canvas.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      const frame = this.getSelectedFrame();
      if (!frame) return;

      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Calculate relative delta based on zoom
      const dx = Math.round((mouseX - this.startX) / this.zoom);
      const dy = Math.round((mouseY - this.startY) / this.zoom);

      if (dx !== 0 || dy !== 0) {
        frame.nudgeX += dx;
        frame.nudgeY += dy;
        
        this.startX = mouseX;
        this.startY = mouseY;
        
        this.renderCurator();
        if (this.onCurationChanged) {
          this.onCurationChanged(frame);
        }
      }
    });

    const stopDragging = () => {
      this.isDragging = false;
    };

    this.canvas.addEventListener('mouseup', stopDragging);
    this.canvas.addEventListener('mouseleave', stopDragging);
    
    // Support Touch Events as well
    this.canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      const frame = this.getSelectedFrame();
      if (!frame || frame.rejected) return;

      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.touches[0].clientX - rect.left;
      const mouseY = e.touches[0].clientY - rect.top;

      this.isDragging = true;
      this.startX = mouseX;
      this.startY = mouseY;
      e.preventDefault();
    });

    this.canvas.addEventListener('touchmove', (e) => {
      if (!this.isDragging || e.touches.length !== 1) return;
      const frame = this.getSelectedFrame();
      if (!frame) return;

      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.touches[0].clientX - rect.left;
      const mouseY = e.touches[0].clientY - rect.top;

      const dx = Math.round((mouseX - this.startX) / this.zoom);
      const dy = Math.round((mouseY - this.startY) / this.zoom);

      if (dx !== 0 || dy !== 0) {
        frame.nudgeX += dx;
        frame.nudgeY += dy;
        this.startX = mouseX;
        this.startY = mouseY;
        this.renderCurator();
        if (this.onCurationChanged) {
          this.onCurationChanged(frame);
        }
      }
      e.preventDefault();
    });

    this.canvas.addEventListener('touchend', stopDragging);
  }

  /**
   * Render checkerboard pattern or solid colors manually inside the canvas
   */
  drawBackground(ctx, w, h) {
    ctx.save();
    if (this.bgType === 'white') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, w, h);
    } else if (this.bgType === 'black') {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, w, h);
    } else {
      // Checkerboard
      ctx.fillStyle = '#101014';
      ctx.fillRect(0, 0, w, h);
      
      const size = 16;
      ctx.fillStyle = '#1B1C22';
      for (let y = 0; y < h; y += size * 2) {
        for (let x = 0; x < w; x += size * 2) {
          ctx.fillRect(x, y, size, size);
          ctx.fillRect(x + size, y + size, size, size);
        }
      }
    }
    ctx.restore();
  }

  /**
   * Render the selected frame in the main curator viewport
   */
  renderCurator() {
    const frame = this.getSelectedFrame();
    if (!frame || !this.sourceCanvas) {
      // Clear canvas if no frame selected
      this.canvas.width = 300;
      this.canvas.height = 300;
      this.drawBackground(this.ctx, 300, 300);
      this.ctx.fillStyle = '#6B7280';
      this.ctx.font = '14px sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('프레임 데이터 없음', 150, 150);
      return;
    }

    // Set canvas size dynamically based on frame boundary + padding, multiplied by zoom
    const padding = 40;
    const viewW = (frame.sourceW + padding * 2) * this.zoom;
    const viewH = (frame.sourceH + padding * 2) * this.zoom;
    
    this.canvas.width = viewW;
    this.canvas.height = viewH;
    
    // Draw background
    this.drawBackground(this.ctx, viewW, viewH);

    const ctx = this.ctx;
    ctx.save();
    
    // Center point in viewport coordinates
    const cx = viewW / 2;
    const cy = viewH / 2;
    
    // 1. Draw boundary cell guidelines (where the original frame was)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(cx - (frame.sourceW / 2) * this.zoom, cy - (frame.sourceH / 2) * this.zoom, frame.sourceW * this.zoom, frame.sourceH * this.zoom);
    
    // 2. Apply viewport scaling
    ctx.translate(cx, cy);
    ctx.scale(this.zoom, this.zoom);
    
    // 3. Apply frame transformations (Nudge & Rotate & Scale)
    ctx.translate(frame.nudgeX, frame.nudgeY);
    ctx.scale(frame.scale, frame.scale);
    ctx.rotate((frame.rotate * Math.PI) / 180);

    // 4. Draw image portion (Centered on pivot)
    ctx.imageSmoothingEnabled = false; // Preserve retro/pixel art crispness
    ctx.drawImage(
      this.sourceCanvas,
      frame.sourceX, frame.sourceY, frame.sourceW, frame.sourceH,
      -frame.sourceW / 2, -frame.sourceH / 2, frame.sourceW, frame.sourceH
    );
    
    ctx.restore();

    // 5. Draw center pivot crosshair guidelines on top (non-transformed center)
    ctx.save();
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.4)'; // Neon purple line
    ctx.lineWidth = 1.5;
    
    // Horizontal center line
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy);
    ctx.lineTo(cx + 10, cy);
    ctx.stroke();
    
    // Vertical center line
    ctx.beginPath();
    ctx.moveTo(cx, cy - 10);
    ctx.lineTo(cx, cy + 10);
    ctx.stroke();
    
    // Draw active bounding box wrapper indicators
    if (frame.rejected) {
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)'; // Red for rejected
      ctx.lineWidth = 2;
      ctx.strokeRect(cx - (frame.sourceW / 2) * this.zoom, cy - (frame.sourceH / 2) * this.zoom, frame.sourceW * this.zoom, frame.sourceH * this.zoom);
      
      // Draw big Red 'X'
      ctx.beginPath();
      ctx.moveTo(cx - 20, cy - 20);
      ctx.lineTo(cx + 20, cy + 20);
      ctx.moveTo(cx + 20, cy - 20);
      ctx.lineTo(cx - 20, cy + 20);
      ctx.strokeStyle = '#EF4444';
      ctx.lineWidth = 4;
      ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(168, 85, 247, 0.8)'; // Purple border for active
      ctx.lineWidth = 1.5;
      
      // Draw nudged border guidelines
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(this.zoom, this.zoom);
      ctx.translate(frame.nudgeX, frame.nudgeY);
      ctx.scale(frame.scale, frame.scale);
      ctx.rotate((frame.rotate * Math.PI) / 180);
      
      ctx.setLineDash([2, 2]);
      ctx.strokeRect(-frame.sourceW / 2, -frame.sourceH / 2, frame.sourceW, frame.sourceH);
      ctx.restore();
    }
    
    ctx.restore();
  }

  /**
   * Start animation player requestAnimationFrame loop
   */
  startPlayerLoop() {
    const loop = (timestamp) => {
      this.animatePlayer(timestamp);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  animatePlayer(timestamp) {
    if (!this.isPlaying || this.currentStateFrames.length === 0 || !this.sourceCanvas) {
      return;
    }

    const elapsed = timestamp - this.lastFrameTime;
    const interval = 1000 / this.playerFps;

    if (elapsed >= interval) {
      this.lastFrameTime = timestamp - (elapsed % interval);
      
      // Find the next active frame (skip rejected ones)
      let attempts = 0;
      const total = this.currentStateFrames.length;
      
      do {
        this.currentPlayIndex = (this.currentPlayIndex + 1) % total;
        attempts++;
        
        // If we completed a full loop and all are rejected, stop
        if (attempts >= total) break;
      } while (this.currentStateFrames[this.currentPlayIndex]?.rejected && this.playerLoop);

      this.renderPlayerFrame();
    }
  }

  renderPlayerFrame() {
    if (this.currentStateFrames.length === 0 || !this.sourceCanvas) {
      this.playerCanvas.width = 128;
      this.playerCanvas.height = 128;
      this.playerCtx.clearRect(0, 0, 128, 128);
      return;
    }

    const frame = this.currentStateFrames[this.currentPlayIndex];
    if (!frame || frame.rejected) {
      // If frame is null or rejected, render empty transparent frame
      this.playerCtx.clearRect(0, 0, this.playerCanvas.width, this.playerCanvas.height);
      return;
    }

    // Set player canvas dimension to frame max bounds
    const maxDim = Math.max(frame.sourceW, frame.sourceH);
    this.playerCanvas.width = maxDim;
    this.playerCanvas.height = maxDim;

    const ctx = this.playerCtx;
    ctx.clearRect(0, 0, maxDim, maxDim);

    ctx.save();
    const cx = maxDim / 2;
    const cy = maxDim / 2;

    // Apply exact transformations
    ctx.translate(cx, cy);
    ctx.translate(frame.nudgeX, frame.nudgeY);
    ctx.scale(frame.scale, frame.scale);
    ctx.rotate((frame.rotate * Math.PI) / 180);

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      this.sourceCanvas,
      frame.sourceX, frame.sourceY, frame.sourceW, frame.sourceH,
      -frame.sourceW / 2, -frame.sourceH / 2, frame.sourceW, frame.sourceH
    );

    ctx.restore();
  }
}
