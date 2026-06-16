/* js/packer.js */

window.packer = {
  /**
   * Packs a list of sprite frames into a single coordinate layout
   */
  packSpriteSheet(flatFrames, maxAtlasSize = 1024, padding = 4, forcePOT = true) {
    // Sort frames by height descending for packing optimization
    const sorted = flatFrames.map((f, idx) => ({
      originalIndex: idx,
      w: f.sourceW,
      h: f.sourceH,
      frame: f
    }));
    
    sorted.sort((a, b) => b.h - a.h);

    // Shelf Bin Packing Algorithm
    const shelves = [];
    let currentY = 0;
    let maxSheetW = 0;
    let maxSheetH = 0;

    // Initialize first shelf
    shelves.push({
      x: 0,
      y: 0,
      h: 0
    });

    const packedFrames = [];

    for (const item of sorted) {
      const itemW = item.w + padding * 2;
      const itemH = item.h + padding * 2;

      let placed = false;
      
      // Attempt placing in existing shelves
      for (const shelf of shelves) {
        if (shelf.x + itemW <= maxAtlasSize) {
          // Fits on this shelf!
          packedFrames.push({
            item: item,
            x: shelf.x + padding,
            y: shelf.y + padding,
            w: item.w,
            h: item.h
          });
          
          shelf.x += itemW;
          shelf.h = Math.max(shelf.h, itemH);
          maxSheetW = Math.max(maxSheetW, shelf.x);
          maxSheetH = Math.max(maxSheetH, shelf.y + shelf.h);
          placed = true;
          break;
        }
      }

      if (!placed) {
        // Create new shelf
        const prevShelf = shelves[shelves.length - 1];
        const newY = prevShelf.y + prevShelf.h;
        
        if (newY + itemH > maxAtlasSize) {
          console.warn(`Warning: Sprites exceed the max atlas size limit (${maxAtlasSize}px). Try increasing the max resolution.`);
        }

        const newShelf = {
          x: itemW,
          y: newY,
          h: itemH
        };
        
        shelves.push(newShelf);
        
        packedFrames.push({
          item: item,
          x: padding,
          y: newY + padding,
          w: item.w,
          h: item.h
        });

        maxSheetW = Math.max(maxSheetW, itemW);
        maxSheetH = Math.max(maxSheetH, newY + itemH);
      }
    }

    // Adjust to next Power of Two if required
    let finalWidth = maxSheetW;
    let finalHeight = maxSheetH;

    if (forcePOT) {
      finalWidth = this.nextPowerOfTwo(maxSheetW);
      finalHeight = this.nextPowerOfTwo(maxSheetH);
      
      // Clamp to max size
      finalWidth = Math.min(finalWidth, maxAtlasSize);
      finalHeight = Math.min(finalHeight, maxAtlasSize);
    }

    // Generate manifest JSON coordinates mapping
    const manifestFrames = {};
    const manifestStates = {};
    
    packedFrames.forEach(p => {
      const f = p.item.frame;
      const key = `${f.characterId}_${f.stateName}_${f.index}`;
      
      manifestFrames[key] = {
        frame: { x: p.x, y: p.y, w: p.w, h: p.h },
        rotated: false,
        trimmed: true,
        spriteSourceSize: { x: 0, y: 0, w: p.w, h: p.h },
        sourceSize: { w: p.w, h: p.h },
        pivot: { x: 0.5, y: 0.5 },
        nudge: { x: f.nudgeX, y: f.nudgeY, scale: f.scale, rotate: f.rotate }
      };

      if (!manifestStates[f.stateName]) {
        manifestStates[f.stateName] = {
          fps: f.fps,
          loop: f.loop,
          frames: []
        };
      }
      manifestStates[f.stateName].frames.push(key);
    });

    const manifest = {
      meta: {
        app: "Antigravity-Sprite-Web",
        version: "1.0.0",
        image: "sprite-sheet-alpha.png",
        format: "RGBA8888",
        size: { w: finalWidth, h: finalHeight },
        scale: "1"
      },
      frames: manifestFrames,
      states: manifestStates
    };

    return {
      width: finalWidth,
      height: finalHeight,
      packedFrames,
      manifest
    };
  },

  /**
   * Find next power of two for a number
   */
  nextPowerOfTwo(value) {
    if (value <= 0) return 1;
    let pot = 1;
    while (pot < value) {
      pot *= 2;
    }
    return pot;
  },

  /**
   * Bake the packed frames onto the output canvas, drawing transformed pixels directly
   */
  bakeAtlasCanvas(destCanvas, sourceCanvas, packedFrames, width, height) {
    destCanvas.width = width;
    destCanvas.height = height;
    const ctx = destCanvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);

    ctx.imageSmoothingEnabled = false;

    packedFrames.forEach(p => {
      const f = p.item.frame;
      
      ctx.save();
      
      const targetCenterX = p.x + p.w / 2;
      const targetCenterY = p.y + p.h / 2;
      
      ctx.translate(targetCenterX, targetCenterY);
      
      ctx.translate(f.nudgeX, f.nudgeY);
      ctx.scale(f.scale, f.scale);
      ctx.rotate((f.rotate * Math.PI) / 180);

      ctx.drawImage(
        sourceCanvas,
        f.sourceX, f.sourceY, f.sourceW, f.sourceH,
        -f.sourceW / 2, -f.sourceH / 2, f.sourceW, f.sourceH
      );
      
      ctx.restore();
    });
  }
};
