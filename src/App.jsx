import React, { useState, useEffect, useRef, useCallback } from 'react';
import './index.css';

// --- WEB AUDIO API ENGINE ---
const AudioContext = window.AudioContext || window.webkitAudioContext;
const actx = new AudioContext();

const playSound = (type) => {
  if (actx.state === 'suspended') actx.resume();
  const osc = actx.createOscillator();
  const gain = actx.createGain();
  osc.connect(gain);
  gain.connect(actx.destination);
  const now = actx.currentTime;
  
  if (type === 'shoot') {
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(10, now + 0.1);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    osc.start(now); osc.stop(now + 0.1);
  } else if (type === 'hit') {
    osc.type = 'square';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.setValueAtTime(800, now + 0.05);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.15);
    osc.start(now); osc.stop(now + 0.15);
  } else if (type === 'miss') {
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, now);
    osc.frequency.linearRampToValueAtTime(50, now + 0.3);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.3);
    osc.start(now); osc.stop(now + 0.3);
  } else if (type === 'round_start') {
    osc.type = 'square';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.setValueAtTime(400, now + 0.1);
    osc.frequency.setValueAtTime(500, now + 0.2);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.4);
    osc.start(now); osc.stop(now + 0.4);
  } else if (type === 'laugh') {
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.linearRampToValueAtTime(150, now + 0.2);
    osc.frequency.setValueAtTime(280, now + 0.25);
    osc.frequency.linearRampToValueAtTime(130, now + 0.45);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.6);
    osc.start(now); osc.stop(now + 0.6);
  }
};

// --- SPRITES ---
const CELL = 3; 
const ACROBAT_SWING = [
  ".....RR.....",
  "....RRRR....",
  "...RWWWRR...",
  "...RRRRRR...",
  "....RBRB....",
  "...RRBBBRR..",
  "..R.BBBBB.R.",
  "..R..BBB..R.",
  ".....R.R....",
  "....RR.RR...",
  "...RR...RR.."
];
const VIGILANTE_STAND = [
  "......FFFF......",
  ".....FFFFFF.....",
  ".....FKKKKF.....",
  ".....FFFFFF.....",
  "...KKKKKKKKKK...",
  "..KKKWWKKWWKKK..",
  "..KKKKWWWWKKKK..",
  "...KKKKWWKKKK...",
  "....KKK..KKK....",
  "....KK....KK...."
];
const DRONE_SPRITE = [
  "..K......K..",
  ".K.KKKKKK.K.",
  "K..KRRRRK..K",
  "KKKKRWWKKKKK",
  "...KKKKKK..."
];

const PALETTES = {
  acrobat: { R: '#e23636', B: '#1a1a1a', W: '#ffffff' },
  vigilante: { F: '#ffcda8', K: '#111111', W: '#ffffff' },
  drone: { K: '#222222', R: '#ff3333', W: '#ffff00' }
};

const drawGrid = (ctx, x, y, grid, palette, flip=false, scale=1) => {
  const H = grid.length, W = grid[0].length;
  ctx.save();
  ctx.translate(x, y);
  if (flip) ctx.scale(-1, 1);
  ctx.translate(-(W*CELL*scale)/2, -(H*CELL*scale)/2); 
  for (let r=0; r<H; r++) {
    for (let c=0; c<W; c++) {
      const ch = grid[r][c];
      if (ch !== '.') {
        ctx.fillStyle = palette[ch];
        ctx.fillRect(c*CELL*scale, r*CELL*scale, CELL*scale, CELL*scale);
      }
    }
  }
  ctx.restore();
};

const MISS_TAUNTS = [
  "CANT YOU DO IT MAN?",
  "A 3 YEAR OLD COULD HAVE PLAYED BETTER!",
  "STORMTRUPER AIM!",
  "WAS THAT A WARNING SHOT?",
  "IS YOUR MOUSE BROKEN?",
  "OPEN YOUR EYES, MAN!",
  "EVEN I COULD HIT THAT!",
  "MY GRANDMA AIMS BETTER!",
  "ARE YOU PLAYING WITH YOUR FEET?",
  "WAKE UP, HERO!",
  "I'VE SEEN BETTER AIM FROM A POTATO.",
  "YOU'RE SHOOTING BLANKS!",
  "PACIFIST RUN?",
  "YOU CALL THAT AN ATTACK?"
];

const GAME_OVER_TAUNTS = [
  "OH COOL YOU HAVE FINALLY ENDED YOUR BROS LOVE STORY.",
  "WITH GREAT POWER COMES TERRIBLE AIM.",
  "THE REAL PUNISHMENT IS YOUR SCORE.",
  "SPIDEY: 1, YOU: 0.",
  "DONT QUIT YOUR DAY JOB.",
  "THE CITY IS DOOMED THANKS TO YOU.",
  "BACK TO TRAINING WHEELS FOR YOU.",
  "MAYBE TRY MINESWEEPER INSTEAD?",
  "EVEN J. JONAH JAMESON IS DISAPPOINTED.",
  "YOU LET THEM GET AWAY! THE RENT IS STILL DUE!"
];

// --- GAME LOGIC ENGINE ---
class GameEngine {
  constructor(canvas, updateReactState) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.ctx.imageSmoothingEnabled = false;
    this.updateReactState = updateReactState;
    
    // Internal logical resolution (16:9)
    this.W = 800; this.H = 450;
    this.canvas.width = this.W; this.canvas.height = this.H;
    
    this.state = 'MENU'; 
    this.mode = 1; // 1=EASY, 2=MEDIUM, 3=HARD
    
    this.score = 0;
    this.hiScore = parseInt(localStorage.getItem('retroweb_hi')) || 0;
    this.round = 1;
    this.ammo = 5;
    this.maxAmmo = 5;
    
    this.targets = [];
    this.particles = [];
    this.floatingTexts = []; 
    this.history = new Array(10).fill('empty');
    this.targetsSpawned = 0;
    this.shotsFired = 0;
    this.currentCombo = 0; 
    this.gameOverTaunt = "";
    
    this.mascot = { active: false, y: this.H, type: 'laugh', timer: 0 };
    
    this.lastTime = performance.now();
    this.reqId = requestAnimationFrame((t) => this.loop(t));
  }

  startGame(mode) {
    this.mode = mode;
    this.score = 0;
    this.round = 1;
    this.currentCombo = 0;
    this.gameOverTaunt = "";
    
    // Determine Max Ammo based on Difficulty Level
    if (this.mode === 1) this.maxAmmo = 5; // Easy
    else if (this.mode === 2) this.maxAmmo = 4; // Medium
    else this.maxAmmo = 3; // Hard
    
    this.startRound();
  }

  startRound() {
    this.history = new Array(10).fill('empty');
    this.targetsSpawned = 0;
    this.targets = [];
    this.particles = [];
    this.floatingTexts = [];
    this.state = 'ROUND_START';
    this.syncState();
    playSound('round_start');
    
    setTimeout(() => {
      if (this.state === 'ROUND_START') {
        this.state = 'PLAYING';
        this.spawnWave();
      }
    }, 1500);
  }

  spawnWave() {
    this.ammo = this.maxAmmo;
    this.targets = [];
    
    // Targets per wave based on Difficulty Level
    let count = 1;
    if (this.mode === 2) count = 2; // Medium: 2 acrobats
    if (this.mode === 3) count = 2; // Hard: acrobat + drone mix
    
    for (let i=0; i<count; i++) {
      if (this.mode === 3 && i === 1) {
        this.targets.push(this.createDrone());
      } else {
        this.targets.push(this.createAcrobat());
      }
    }
    this.targetsSpawned += count;
    this.syncState();
  }

  // --- ENTITY CREATION ---
  createAcrobat() {
    // Huge difficulty tweaks here based on level
    let speedMult = 0.5 + (this.round * 0.05); // EASY base speed
    if (this.mode === 2) speedMult = 0.8 + (this.round * 0.05); // MEDIUM
    if (this.mode === 3) speedMult = 1.2 + (this.round * 0.1); // HARD
    
    const dir = Math.random() > 0.5 ? 1 : -1;
    const startY = 150 + Math.random() * 100; 
    
    return {
      type: 'acrobat',
      x: dir === 1 ? -80 : this.W + 80,
      y: startY,
      baseY: startY,
      vx: (140 + Math.random() * 40) * speedMult * dir, 
      amplitude: 140 + Math.random() * 50, // Massive swing down to bottom third of screen
      phase: Math.random() * Math.PI,
      phaseSpeed: (2.0 + Math.random()) * speedMult,
      dead: false,
      escaped: false,
      escapeTimer: 0,
      speedGlitched: false,
      freezeTimer: 0,
      freezeCount: 0,
      // More forgiving screen time on easy
      maxTime: this.mode === 1 ? 5.0 : Math.max(1.5, 4.0 - (this.round * 0.2)) 
    };
  }

  createDrone() {
    let speedMult = 1.0 + (this.round * 0.1);
    const dir = Math.random() > 0.5 ? 1 : -1;
    return {
      type: 'drone',
      x: dir === 1 ? -40 : this.W + 40,
      y: this.H * 0.5 + (Math.random() * 120 - 60), 
      vx: (160 + Math.random() * 60) * speedMult * dir,
      vy: (-20 - Math.random() * 30) * speedMult,
      scale: 2.5,
      dead: false,
      escaped: false,
      escapeTimer: 0,
      speedGlitched: false,
      freezeTimer: 0,
      freezeCount: 0,
      maxTime: Math.max(1.5, 3.5 - (this.round * 0.15))
    };
  }

  // --- INPUT ---
  shoot(x, y) {
    if (this.state !== 'PLAYING') return;
    if (this.ammo <= 0) return;
    
    this.ammo--;
    this.shotsFired++;
    playSound('shoot');
    
    const flashEl = document.getElementById('screen-flash');
    if (flashEl) {
      flashEl.style.opacity = '0.4';
      setTimeout(() => flashEl.style.opacity = '0', 50);
    }

    let hitAnything = false;

    // Difficulty based hit boxes
    let radiusMult = 1.0;
    if (this.mode === 1) radiusMult = 1.5; // Huge hit boxes for Easy
    if (this.mode === 3) radiusMult = 0.8; // Small hit boxes for Hard

    for (let i = this.targets.length - 1; i >= 0; i--) {
      const t = this.targets[i];
      if (t.dead || t.escaped) continue;
      
      const baseRadius = t.type === 'drone' ? 24 * t.scale : 32; 
      const radius = baseRadius * radiusMult;
      const dist = Math.hypot(t.x - x, t.y - y);
      
      if (dist < radius) {
        t.dead = true;
        hitAnything = true;
        this.currentCombo++;
        playSound('hit');
        
        const basePts = (t.type === 'drone' ? 1000 : 500) + (this.round * 100);
        const comboMult = this.currentCombo > 1 ? this.currentCombo : 1;
        const totalPts = basePts * comboMult;
        
        this.score += totalPts;
        if (this.score > this.hiScore) {
          this.hiScore = this.score;
          localStorage.setItem('retroweb_hi', this.hiScore);
        }
        
        this.floatingTexts.push({ x: t.x, y: t.y - 30, text: `+${totalPts}`, color: '#f1c40f', life: 1.2, isTaunt: false });
        if (this.currentCombo > 1) {
            this.floatingTexts.push({ x: t.x, y: t.y - 50, text: `${this.currentCombo}X COMBO!`, color: '#e23636', life: 1.5, isTaunt: false });
        }

        this.spawnExplosion(t.x, t.y, t.type === 'drone' ? '#ff3333' : '#e23636');
        
        const idx = this.targetsSpawned - this.targets.length + i;
        if (idx < 10) this.history[idx] = 'hit';
        break; 
      }
    }

    if (!hitAnything) {
        playSound('miss');
        this.currentCombo = 0; 
        
        // Clear previous taunts to prevent unreadable overlaps
        this.floatingTexts = this.floatingTexts.filter(ft => !ft.isTaunt);
        const taunt = MISS_TAUNTS[Math.floor(Math.random() * MISS_TAUNTS.length)];
        
        // Spawn taunt in the upper center of the screen
        this.floatingTexts.push({
          x: this.W / 2, y: this.H / 3, text: taunt, color: '#ff6b6b', life: 2.5, isTaunt: true
        });
    }
    
    this.checkWaveEnd();
    this.syncState();
  }

  checkWaveEnd() {
    const allDead = this.targets.every(t => t.dead);
    const allEscaped = this.targets.every(t => t.escaped || t.dead);
    
    // Advance the wave as soon as all targets are either dead or escaped
    if (allDead || allEscaped) {
      setTimeout(() => this.endWave(), 600);
    }
  }

  endWave() {
    if (this.state !== 'PLAYING') return;
    
    let caughtCount = this.targets.filter(t => t.dead).length;
    
    if (this.targets.length > 0 && this.targets.some(t => t.escaped && !t.dead)) {
       this.currentCombo = 0; 
       this.targets.forEach((t, i) => {
         if (t.escaped && !t.dead) {
           const idx = this.targetsSpawned - this.targets.length + i;
           if (idx < 10) this.history[idx] = 'miss';
         }
       });
    }

    this.state = 'END_ANIM';
    this.mascot.active = true;
    this.mascot.y = this.H;
    this.mascot.timer = 0;
    
    if (caughtCount > 0) {
      this.mascot.type = 'stand';
    } else {
      this.mascot.type = 'laugh';
      playSound('laugh');
    }
    this.syncState();
  }

  spawnExplosion(x, y, color) {
    for(let i=0; i<30; i++) {
      this.particles.push({
        x, y,
        vx: (Math.random()-0.5)*350,
        vy: (Math.random()-0.5)*350,
        life: 1.0,
        color: Math.random()>0.5 ? color : '#ffffff'
      });
    }
  }

  // --- LOOP & RENDERING ---
  loop(now) {
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;
    
    this.update(dt);
    this.draw();
    
    this.reqId = requestAnimationFrame((t) => this.loop(t));
  }

  update(dt) {
    if (this.state === 'PLAYING') {
      let activeCount = 0;
      
      this.targets.forEach(t => {
        if (t.dead) {
          t.y += 500 * dt; 
          return;
        }
        if (t.escaped) return;
        
        t.escapeTimer += dt;
        if (t.escapeTimer > t.maxTime || t.x < -150 || t.x > this.W + 150 || t.y < -150) {
          t.escaped = true;
          this.checkWaveEnd();
        }

        // EVENT BUG #2: the enemy suddenly accelerates after being
        // visible for about one second.
        if (!t.speedGlitched && t.escapeTimer > 1.0) {
          t.vx *= 2.2;
          if (t.type === 'drone') t.vy *= 1.6;
          t.speedGlitched = true;
        }



        if (t.type === 'acrobat') {
          t.x += t.vx * dt;
          t.phase += t.phaseSpeed * dt;
          t.y = t.baseY + Math.sin(t.phase) * t.amplitude;
        } else if (t.type === 'drone') {
          t.x += t.vx * dt;
          t.y += t.vy * dt;
          t.scale = Math.max(0.5, t.scale - 0.5 * dt); 
        }
        activeCount++;
      });
      
      if (this.ammo === 0 && activeCount > 0) {
        this.targets.forEach(t => { if(!t.dead) t.escapeTimer += dt * 5; });
      }
    }

    if (this.state === 'END_ANIM') {
      this.mascot.timer += dt;
      if (this.mascot.timer < 0.5) this.mascot.y -= 150 * dt; 
      else if (this.mascot.timer > 2.0) this.mascot.y += 150 * dt; 
      
      if (this.mascot.timer > 2.5) {
        this.mascot.active = false;
        if (this.targetsSpawned >= 10) this.checkRoundClear();
        else { this.state = 'PLAYING'; this.spawnWave(); }
      }
    }

    this.particles.forEach(p => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt * 1.5;
    });
    this.particles = this.particles.filter(p => p.life > 0);

    this.floatingTexts.forEach(ft => {
      ft.y -= (ft.isTaunt ? 5 : 45) * dt;
      ft.life -= dt;
    });
    this.floatingTexts = this.floatingTexts.filter(ft => ft.life > 0);
  }

  checkRoundClear() {
    const hits = this.history.filter(h => h === 'hit').length;
    // Progression requirements scaled by difficulty
    let required = 5 + Math.floor(this.round / 2);
    if (this.mode === 1) required -= 1; // Easier to pass on easy mode
    required = Math.min(required, 10);
    
    if (hits >= required) {
      this.round++;
      this.startRound();
    } else {
      this.state = 'GAME_OVER';
      this.gameOverTaunt = GAME_OVER_TAUNTS[Math.floor(Math.random() * GAME_OVER_TAUNTS.length)];
      this.syncState();
    }
  }

  draw() {
    const ctx = this.ctx;
    const T = performance.now() / 1000; // time in seconds for animations

    // --- VOLCANO SKY ---
    const skyGrad = ctx.createLinearGradient(0, 0, 0, this.H);
    skyGrad.addColorStop(0,   '#0d0200');
    skyGrad.addColorStop(0.4, '#3a0a00');
    skyGrad.addColorStop(0.7, '#6b1500');
    skyGrad.addColorStop(1,   '#1a0500');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, this.W, this.H);

    // Ash clouds drifting across sky
    ctx.save();
    for (let i = 0; i < 6; i++) {
      const cx = ((Math.sin(i * 1.7) * 0.5 + 0.5) * 1.4 * this.W + T * (18 + i * 5)) % (this.W + 200) - 100;
      const cy = 30 + i * 22 + Math.sin(T * 0.3 + i) * 10;
      const r  = 60 + i * 20;
      const ashGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      ashGrad.addColorStop(0,   'rgba(60,20,5,0.55)');
      ashGrad.addColorStop(1,   'rgba(10,4,2,0)');
      ctx.fillStyle = ashGrad;
      ctx.beginPath(); ctx.ellipse(cx, cy, r, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // Distant glow from the volcano behind mountains
    const volcGlow = ctx.createRadialGradient(200, this.H * 0.55, 10, 200, this.H * 0.55, 180);
    volcGlow.addColorStop(0,   'rgba(255,100,0,0.55)');
    volcGlow.addColorStop(0.5, 'rgba(200,40,0,0.2)');
    volcGlow.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = volcGlow;
    ctx.fillRect(0, 0, this.W, this.H);

    // --- VOLCANO MOUNTAIN ---
    // Main volcano silhouette
    ctx.beginPath();
    ctx.moveTo(0, this.H);
    ctx.lineTo(0, this.H * 0.72);
    ctx.lineTo(100, this.H * 0.58);
    ctx.lineTo(160, this.H * 0.72);
    ctx.lineTo(200, this.H * 0.34); // peak
    ctx.lineTo(240, this.H * 0.72);
    ctx.lineTo(360, this.H * 0.62);
    ctx.lineTo(400, this.H);
    ctx.closePath();
    const volcMtnGrad = ctx.createLinearGradient(200, this.H * 0.34, 200, this.H);
    volcMtnGrad.addColorStop(0,   '#1a0800');
    volcMtnGrad.addColorStop(0.5, '#2a0e02');
    volcMtnGrad.addColorStop(1,   '#0d0400');
    ctx.fillStyle = volcMtnGrad;
    ctx.fill();

    // Crater rim highlight
    ctx.beginPath();
    ctx.ellipse(200, this.H * 0.34, 28, 10, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#3a1200';
    ctx.fill();

    // Lava eruption from crater — animated jets
    for (let j = 0; j < 5; j++) {
      const jx = 200 + Math.sin(T * 2.5 + j * 1.3) * 12;
      const jy = this.H * 0.34 - 10;
      const jHeight = 18 + Math.abs(Math.sin(T * 3 + j)) * 28;
      const lavJet = ctx.createLinearGradient(jx, jy, jx, jy - jHeight);
      lavJet.addColorStop(0,   'rgba(255,180,0,0.9)');
      lavJet.addColorStop(0.5, 'rgba(255,80,0,0.7)');
      lavJet.addColorStop(1,   'rgba(200,20,0,0)');
      ctx.strokeStyle = lavJet;
      ctx.lineWidth = 3 + j * 0.5;
      ctx.beginPath();
      ctx.moveTo(jx, jy);
      ctx.quadraticCurveTo(
        jx + Math.sin(T + j) * 20,
        jy - jHeight * 0.6,
        jx + Math.sin(T * 1.5 + j) * 30,
        jy - jHeight
      );
      ctx.stroke();
    }

    // Lava flow down the volcano slope (left side)
    for (let r = 0; r < 3; r++) {
      const flowOff = (T * 18 + r * 25) % 80;
      const lavFlow = ctx.createLinearGradient(170, this.H * 0.38, 90, this.H * 0.68);
      lavFlow.addColorStop(0,   'rgba(255,160,0,0.95)');
      lavFlow.addColorStop(0.5, 'rgba(220,60,0,0.8)');
      lavFlow.addColorStop(1,   'rgba(160,20,0,0)');
      ctx.strokeStyle = lavFlow;
      ctx.lineWidth = 4 - r;
      ctx.beginPath();
      ctx.moveTo(195 - r * 5, this.H * 0.38 + flowOff * 0.1);
      ctx.bezierCurveTo(
        170 - r * 8, this.H * 0.48 + flowOff * 0.15,
        130 - r * 6, this.H * 0.56 + flowOff * 0.2,
        100 - r * 4, this.H * 0.67
      );
      ctx.stroke();
    }

    // --- BACKGROUND MOUNTAINS (right side) ---
    ctx.beginPath();
    ctx.moveTo(350, this.H);
    ctx.lineTo(420, this.H * 0.62);
    ctx.lineTo(500, this.H * 0.48);
    ctx.lineTo(580, this.H * 0.65);
    ctx.lineTo(650, this.H * 0.42);
    ctx.lineTo(730, this.H * 0.58);
    ctx.lineTo(800, this.H * 0.5);
    ctx.lineTo(800, this.H);
    ctx.closePath();
    ctx.fillStyle = '#160600';
    ctx.fill();

    // Lava seam on right mountain
    const seamGrad = ctx.createLinearGradient(650, this.H * 0.42, 610, this.H * 0.65);
    seamGrad.addColorStop(0,   'rgba(255,120,0,0.8)');
    seamGrad.addColorStop(1,   'rgba(180,40,0,0)');
    ctx.strokeStyle = seamGrad;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(650, this.H * 0.44);
    ctx.bezierCurveTo(645, this.H * 0.51, 625, this.H * 0.57, 615, this.H * 0.64);
    ctx.stroke();

    // --- MOLTEN LAVA GROUND ---
    // Base ground
    ctx.fillStyle = '#0d0300';
    ctx.fillRect(0, this.H - 80, this.W, 80);

    // Three animated lava rivers flowing across foreground
    const rivers = [
      { y: this.H - 62, h: 12, speed: 22 },
      { y: this.H - 44, h: 18, speed: 15 },
      { y: this.H - 22, h: 22, speed: 30 },
    ];
    rivers.forEach(rv => {
      // Pulsing lava color
      const pulse = 0.75 + Math.sin(T * 2.5) * 0.25;
      const riverGrad = ctx.createLinearGradient(0, rv.y, 0, rv.y + rv.h);
      riverGrad.addColorStop(0,   `rgba(255,${Math.floor(180 * pulse)},0,1)`);
      riverGrad.addColorStop(0.4, `rgba(220,${Math.floor(80 * pulse)},0,0.95)`);
      riverGrad.addColorStop(1,   `rgba(120,10,0,0.9)`);
      ctx.fillStyle = riverGrad;
      ctx.fillRect(0, rv.y, this.W, rv.h);

      // Bright flowing highlights — ripple effect
      for (let rx = -60; rx < this.W + 60; rx += 60) {
        const hx = (rx + T * rv.speed * 2) % (this.W + 120) - 60;
        ctx.fillStyle = `rgba(255,220,80,${0.25 + Math.sin(T * 3 + rx * 0.05) * 0.15})`;
        ctx.beginPath();
        ctx.ellipse(hx, rv.y + rv.h * 0.35, 28, rv.h * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // Crackling dark rocks between lava rivers
    [[0, this.H - 70, this.W, 10], [0, this.H - 50, this.W, 6]].forEach(([rx, ry, rw, rh]) => {
      ctx.fillStyle = '#1a0800';
      ctx.fillRect(rx, ry, rw, rh);
      // Glowing cracks
      for (let ci = 0; ci < 12; ci++) {
        const cx2 = (ci / 12) * this.W + Math.sin(ci * 3.7) * 20;
        const crackAlpha = 0.4 + Math.sin(T * 4 + ci) * 0.35;
        ctx.fillStyle = `rgba(255,100,0,${crackAlpha})`;
        ctx.fillRect(cx2, ry, 2, rh);
      }
    });

    // --- FLOATING EMBERS ---
    for (let e = 0; e < 28; e++) {
      // Deterministic but animated ember positions
      const ex = ((Math.sin(e * 137.5) * 0.5 + 0.5) * this.W + T * (8 + (e % 5) * 4)) % this.W;
      const ey = ((Math.cos(e * 97.3) * 0.5 + 0.5) * this.H * 0.85) - ((T * (12 + e % 7)) % (this.H * 0.85));
      const er = 1.2 + Math.sin(T * 5 + e) * 0.8;
      const ea = 0.5 + Math.sin(T * 6 + e * 0.7) * 0.4;
      ctx.globalAlpha = Math.max(0, ea);
      ctx.fillStyle = e % 3 === 0 ? '#ffdd00' : e % 3 === 1 ? '#ff6600' : '#ff2200';
      ctx.beginPath(); ctx.arc(ex, ey, er, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1.0;

    // Targets
    this.targets.forEach(t => {
      if (t.escaped && !t.dead) return;
      if (t.type === 'acrobat') {
        ctx.strokeStyle = 'rgba(255, 160, 60, 0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(t.x + (t.vx * 0.3), -200); // Attach way off screen
        ctx.lineTo(t.x, t.y);
        ctx.stroke();
        
        if (!t.dead) drawGrid(ctx, t.x, t.y, ACROBAT_SWING, PALETTES.acrobat, t.vx > 0, 1.8);
      } else if (t.type === 'drone') {
        if (!t.dead) drawGrid(ctx, t.x, t.y, DRONE_SPRITE, PALETTES.drone, false, t.scale);
      }
    });

    // Particles 
    this.particles.forEach(p => {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillRect(p.x, p.y, 5, 5);
    });
    ctx.globalAlpha = 1.0;

    // Mascot
    if (this.mascot.active) {
       const mY = Math.max(this.mascot.y, this.H - 120);
       drawGrid(ctx, this.W / 2, mY, VIGILANTE_STAND, PALETTES.vigilante, false, 2.5);
       if (this.mascot.type === 'laugh') {
         const bob = Math.sin(this.mascot.timer * 20) * 5;
         drawGrid(ctx, this.W / 2, mY + bob, VIGILANTE_STAND, PALETTES.vigilante, false, 2.5);
       }
    }

    // Floating Texts (Scores & Taunts)
    ctx.textAlign = 'center';
    this.floatingTexts.forEach(ft => {
      ctx.font = ft.isTaunt ? 'bold 18px "Press Start 2P", monospace, sans-serif' : '14px "Press Start 2P", monospace, sans-serif';
      ctx.globalAlpha = Math.max(0, Math.min(1, ft.life * 1.5));
      
      const textWidth = ctx.measureText(ft.text).width;
      let drawX = Math.max(textWidth / 2 + 20, Math.min(this.W - textWidth / 2 - 20, ft.x));

      if (ft.isTaunt) {
         ctx.fillStyle = 'rgba(10, 6, 20, 0.9)';
         ctx.fillRect(drawX - textWidth/2 - 20, ft.y - 24, textWidth + 40, 36);
         ctx.strokeStyle = '#e23636';
         ctx.lineWidth = 2;
         ctx.strokeRect(drawX - textWidth/2 - 20, ft.y - 24, textWidth + 40, 36);
      }

      ctx.fillStyle = ft.color;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 4;
      ctx.strokeText(ft.text, drawX, ft.y);
      ctx.fillText(ft.text, drawX, ft.y);
    });
    ctx.globalAlpha = 1.0;
  }

  syncState() {
    if (this.updateReactState) {
      this.updateReactState({
        state: this.state,
        score: this.score,
        hiScore: this.hiScore,
        round: this.round,
        ammo: this.ammo,
        maxAmmo: this.maxAmmo,
        history: [...this.history],
        mode: this.mode,
        gameOverTaunt: this.gameOverTaunt
      });
    }
  }

  destroy() {
    cancelAnimationFrame(this.reqId);
  }
}

// --- REACT APP COMPONENT ---
const App = () => {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  
  const [gameState, setGameState] = useState({
    state: 'MENU',
    score: 0,
    hiScore: parseInt(localStorage.getItem('retroweb_hi')) || 0,
    round: 1,
    ammo: 5,
    maxAmmo: 5,
    history: new Array(10).fill('empty'),
    mode: 1,
    gameOverTaunt: ""
  });

  const initEngine = useCallback(() => {
    if (engineRef.current) engineRef.current.destroy();
    engineRef.current = new GameEngine(canvasRef.current, setGameState);
    setGameState(prev => ({...prev, hiScore: engineRef.current.hiScore}));
  }, []);

  useEffect(() => {
    initEngine();
    return () => { if (engineRef.current) engineRef.current.destroy(); };
  }, [initEngine]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      const eng = engineRef.current;
      if (!eng) return;
      
      switch(e.key.toLowerCase()) {
        case '1': if(eng.state === 'MENU') eng.startGame(1); break;
        case '2': if(eng.state === 'MENU') eng.startGame(2); break;
        case '3': if(eng.state === 'MENU') eng.startGame(3); break;
        case 'r': eng.startGame(eng.mode); break;
        case 'escape': 
          eng.state = 'MENU';
          eng.syncState();
          break;
        case ' ': 
          if (eng.state === 'PLAYING') eng.shoot(400, 225); // Shoot center
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleCanvasClick = (e) => {
    const eng = engineRef.current;
    if (!eng || eng.state !== 'PLAYING') return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    eng.shoot(x, y);
  };

  const modeNames = { 1: "LEVEL 1: EASY", 2: "LEVEL 2: MEDIUM", 3: "LEVEL 3: VERY HARD" };

  return (
    <div className="game-area">
      <canvas ref={canvasRef} onClick={handleCanvasClick} />
      <div className="crt-overlay"></div>
      <div id="screen-flash" className="flash"></div>

      {/* Top HUD Controls overlay over canvas directly */}
      {(gameState.state !== 'MENU') && (
        <div className="hud-top">
           <div></div>
           <div>
              <button className="btn" onClick={() => engineRef.current && engineRef.current.startGame(engineRef.current.mode)}>RESTART (R)</button>
              <button className="btn" onClick={() => {if(engineRef.current) {engineRef.current.state = 'MENU'; engineRef.current.syncState();}}}>MENU (ESC)</button>
           </div>
        </div>
      )}

      {gameState.state === 'MENU' && (
        <div className="overlay-screen">
          <h2 className="title">RETRO WEB HUNTER</h2>
          <p className="subtitle">Aim with mouse/finger · Click/Space to shoot</p>
          <div className="menu-opts">
            <div className="menu-opt" onClick={() => engineRef.current.startGame(1)}>LEVEL 1: EASY (Press 1)</div>
            <div className="menu-opt" onClick={() => engineRef.current.startGame(2)}>LEVEL 2: MEDIUM (Press 2)</div>
            <div className="menu-opt" onClick={() => engineRef.current.startGame(3)}>LEVEL 3: VERY HARD (Press 3)</div>
          </div>
        </div>
      )}

      {gameState.state === 'ROUND_START' && (
        <div className="overlay-screen" style={{background: 'rgba(5,3,10,0.6)'}}>
          <h2 className="title" style={{fontSize: '3vmin'}}>WAVE {gameState.round}</h2>
        </div>
      )}

      {gameState.state === 'GAME_OVER' && (
        <div className="overlay-screen">
          <h2 className="title" style={{color: 'var(--neon-red)'}}>GAME OVER</h2>
          <p style={{fontSize: '1.5vmin', marginBottom: '16px'}}>SCORE: {gameState.score}</p>
          <p style={{fontSize: '1.5vmin', color: '#f39c12', marginBottom: '32px', maxWidth: '80%', lineHeight: '1.6'}}>
            "{gameState.gameOverTaunt}"
          </p>
          <div className="menu-opt" onClick={() => engineRef.current.startGame(gameState.mode)}>TRY AGAIN (R)</div>
          <div className="menu-opt" style={{marginTop: '10px'}} onClick={() => {engineRef.current.state = 'MENU'; engineRef.current.syncState();}}>MENU (ESC)</div>
        </div>
      )}

      {(gameState.state !== 'MENU') && (
        <div className="hud-bottom">
          <div className="hud-left">
            <div><span className="text-highlight">WAVE {gameState.round}</span></div>
            <div style={{color: '#8ab4f8'}}>{modeNames[gameState.mode]}</div>
          </div>
          
          <div className="hud-center">
            {gameState.history.map((res, i) => (
              <div key={i} className={`hit-box ${res === 'hit' ? 'hit' : res === 'miss' ? 'miss' : ''}`} />
            ))}
          </div>

          <div className="hud-right" style={{textAlign: 'right'}}>
            <div>SCORE <span className="text-highlight">{gameState.score.toString().padStart(6, '0')}</span></div>
            <div>HI <span className="text-highlight">{gameState.hiScore.toString().padStart(6, '0')}</span></div>
          </div>

          <div className="ammo-container">
            {Array.from({length: gameState.maxAmmo}).map((_, i) => (
              <div key={i} className={`bullet-icon ${i >= gameState.ammo ? 'spent' : ''}`} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
