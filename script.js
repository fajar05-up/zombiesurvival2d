/* ============================================
   ZOMBIE SURVIVAL 2D - GAME LOGIC
   Author: Fajar Ramadhan (25210105)
   Mata Kuliah: Pemrograman Game
   ============================================ */

// ==========================================
// 1. SETUP CANVAS & KONSTANTA
// ==========================================
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Resize canvas agar sesuai dengan ukuran window
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// Game states
const STATE = {
    MENU: 'MENU',
    PLAYING: 'PLAYING',
    PAUSED: 'PAUSED',
    GAME_OVER: 'GAME_OVER'
};

// Konfigurasi difficulty
const DIFFICULTY = {
    easy:   { zombieSpeedMul: 0.7, spawnMul: 0.7, damageMul: 0.7 },
    normal: { zombieSpeedMul: 1.0, spawnMul: 1.0, damageMul: 1.0 },
    hard:   { zombieSpeedMul: 1.4, spawnMul: 1.5, damageMul: 1.5 }
};

// ==========================================
// 2. STATE GAME & VARIABEL GLOBAL
// ==========================================
let gameState = STATE.MENU;
let lastTime = 0;
let elapsedTime = 0;         // waktu bertahan hidup (detik)
let score = 0;
let kills = 0;
let currentWave = 1;
let waveTimer = 0;           // waktu sejak wave dimulai
let waveSpawnTimer = 0;      // timer untuk spawn zombie berikutnya
let zombiesToSpawnThisWave = 0;
let zombiesSpawnedThisWave = 0;
let waveTransitionTimer = 0; // jeda antar wave
let screenShake = 0;

// Settings
let settings = {
    volume: 0.5,
    difficulty: 'normal',
    particlesEnabled: true
};

// Arrays untuk entitas game
let player = null;
let zombies = [];
let bullets = [];
let particles = [];
let muzzleFlashes = [];

// Input state
const keys = {};
const mouse = { x: 0, y: 0, down: false };

// ==========================================
// 3. SISTEM AUDIO (OPSIONAL - TIDAK ERROR JIKA TIDAK ADA FILE)
// ==========================================
const AudioSystem = {
    ctx: null,
    enabled: true,
    
    init() {
        try {
            // Gunakan Web Audio API untuk membuat suara sintetis
            // (tidak butuh file audio eksternal)
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn('Audio tidak tersedia:', e);
            this.enabled = false;
        }
    },
    
    // Membuat suara tembakan sintetis
    playShoot() {
        if (!this.enabled || !this.ctx) return;
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.type = 'square';
            osc.frequency.setValueAtTime(800, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.15 * settings.volume, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);
            osc.start();
            osc.stop(this.ctx.currentTime + 0.1);
        } catch (e) { /* ignore */ }
    },
    
    // Suara zombie terkena peluru
    playHit() {
        if (!this.enabled || !this.ctx) return;
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(200, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(50, this.ctx.currentTime + 0.15);
            gain.gain.setValueAtTime(0.2 * settings.volume, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);
            osc.start();
            osc.stop(this.ctx.currentTime + 0.15);
        } catch (e) { /* ignore */ }
    },
    
    // Suara pemain terkena damage
    playDamage() {
        if (!this.enabled || !this.ctx) return;
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(150, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(80, this.ctx.currentTime + 0.3);
            gain.gain.setValueAtTime(0.25 * settings.volume, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);
            osc.start();
            osc.stop(this.ctx.currentTime + 0.3);
        } catch (e) { /* ignore */ }
    },
    
    // Suara game over
    playGameOver() {
        if (!this.enabled || !this.ctx) return;
        try {
            [200, 150, 100, 60].forEach((freq, i) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.type = 'sawtooth';
                const t = this.ctx.currentTime + i * 0.2;
                osc.frequency.setValueAtTime(freq, t);
                gain.gain.setValueAtTime(0.2 * settings.volume, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
                osc.start(t);
                osc.stop(t + 0.3);
            });
        } catch (e) { /* ignore */ }
    },
    
    // Suara wave baru
    playWaveStart() {
        if (!this.enabled || !this.ctx) return;
        try {
            [400, 600, 800].forEach((freq, i) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.type = 'triangle';
                const t = this.ctx.currentTime + i * 0.1;
                osc.frequency.setValueAtTime(freq, t);
                gain.gain.setValueAtTime(0.15 * settings.volume, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
                osc.start(t);
                osc.stop(t + 0.2);
            });
        } catch (e) { /* ignore */ }
    }
};

// ==========================================
// 4. KELAS PLAYER
// ==========================================
class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 18;
        this.speed = 220;          // unit per detik
        this.health = 100;
        this.maxHealth = 100;
        this.angle = 0;            // arah bidikan (radian)
        this.shootCooldown = 0;    // cooldown tembakan (detik)
        this.shootRate = 0.25;     // detik antar tembakan
        this.damageFlashTimer = 0;
        this.invulnTimer = 0;      // invulnerability setelah kena damage
    }
    
    update(dt) {
        // Hitung vektor gerakan dari input
        let dx = 0, dy = 0;
        if (keys['w'] || keys['W'] || keys['ArrowUp']) dy -= 1;
        if (keys['s'] || keys['S'] || keys['ArrowDown']) dy += 1;
        if (keys['a'] || keys['A'] || keys['ArrowLeft']) dx -= 1;
        if (keys['d'] || keys['D'] || keys['ArrowRight']) dx += 1;
        
        // Normalisasi diagonal agar kecepatan tidak lebih cepat
        if (dx !== 0 && dy !== 0) {
            const len = Math.sqrt(dx * dx + dy * dy);
            dx /= len;
            dy /= len;
        }
        
        // Update posisi dengan deltaTime
        this.x += dx * this.speed * dt;
        this.y += dy * this.speed * dt;
        
        // Batasi agar tidak keluar arena
        this.x = Math.max(this.radius, Math.min(canvas.width - this.radius, this.x));
        this.y = Math.max(this.radius, Math.min(canvas.height - this.radius, this.y));
        
        // Hitung sudut ke mouse
        this.angle = Math.atan2(mouse.y - this.y, mouse.x - this.x);
        
        // Update cooldown
        if (this.shootCooldown > 0) this.shootCooldown -= dt;
        if (this.damageFlashTimer > 0) this.damageFlashTimer -= dt;
        if (this.invulnTimer > 0) this.invulnTimer -= dt;
        
        // Tembak otomatis jika mouse ditekan
        if (mouse.down && this.shootCooldown <= 0) {
            this.shoot();
        }
    }
    
    shoot() {
        this.shootCooldown = this.shootRate;
        // Posisi peluru muncul dari ujung senjata
        const gunLength = this.radius + 10;
        const bx = this.x + Math.cos(this.angle) * gunLength;
        const by = this.y + Math.sin(this.angle) * gunLength;
        bullets.push(new Bullet(bx, by, this.angle));
        
        // Efek muzzle flash
        muzzleFlashes.push(new MuzzleFlash(bx, by, this.angle));
        
        AudioSystem.playShoot();
    }
    
    takeDamage(amount) {
        if (this.invulnTimer > 0) return;
        this.health -= amount;
        this.damageFlashTimer = 0.3;
        this.invulnTimer = 0.5;
        screenShake = 8;
        
        // Tampilkan damage flash di layar
        const flash = document.getElementById('damage-flash');
        flash.classList.add('active');
        setTimeout(() => flash.classList.remove('active'), 150);
        
        AudioSystem.playDamage();
        
        if (this.health <= 0) {
            this.health = 0;
            gameOver();
        }
    }
    
    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        
        // Bayangan
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.beginPath();
        ctx.ellipse(2, 4, this.radius, this.radius * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.rotate(this.angle);
        
        // Efek damage flash
        const flashAlpha = this.damageFlashTimer > 0 ? 0.5 : 0;
        
        // Badan pemain (rompi taktis)
        ctx.fillStyle = '#2c3e50';
        ctx.strokeStyle = '#1a252f';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // Detail rompi
        ctx.fillStyle = '#34495e';
        ctx.beginPath();
        ctx.arc(0, 0, this.radius - 4, 0, Math.PI * 2);
        ctx.fill();
        
        // Senapan
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(this.radius - 5, -3, 18, 6);
        ctx.fillStyle = '#444';
        ctx.fillRect(this.radius + 5, -2, 8, 4);
        
        // Kepala
        ctx.rotate(-this.angle);
        ctx.fillStyle = '#f4c28a';
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.55, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#c9986a';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        
        // Arah pandangan (mata)
        ctx.rotate(this.angle);
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(4, -3, 1.5, 0, Math.PI * 2);
        ctx.arc(4, 3, 1.5, 0, Math.PI * 2);
        ctx.fill();
        
        // Overlay flash saat kena damage
        if (flashAlpha > 0) {
            ctx.rotate(-this.angle);
            ctx.fillStyle = `rgba(231, 76, 60, ${flashAlpha})`;
            ctx.beginPath();
            ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.restore();
    }
}

// ==========================================
// 5. KELAS ZOMBIE
// ==========================================
class Zombie {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 16;
        const diff = DIFFICULTY[settings.difficulty];
        this.baseSpeed = 60 + Math.random() * 30;
        this.speed = this.baseSpeed * diff.zombieSpeedMul;
        this.health = 2;
        this.maxHealth = 2;
        this.damage = 15 * diff.damageMul;
        this.attackCooldown = 0;
        this.attackRate = 1.0;       // detik antar serangan
        this.angle = 0;
        this.wobble = Math.random() * Math.PI * 2; // animasi goyang
        this.variant = Math.floor(Math.random() * 3); // variasi warna
    }
    
    update(dt) {
        if (!player) return;
        
        // Kejar pemain
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist > 0) {
            // Gerakan dengan sedikit wobble agar tidak kaku
            this.wobble += dt * 5;
            const wobbleAmount = Math.sin(this.wobble) * 0.2;
            const targetAngle = Math.atan2(dy, dx) + wobbleAmount;
            
            this.x += Math.cos(targetAngle) * this.speed * dt;
            this.y += Math.sin(targetAngle) * this.speed * dt;
            this.angle = targetAngle;
        }
        
        // Serang pemain jika dekat
        if (this.attackCooldown > 0) this.attackCooldown -= dt;
        
        if (dist < this.radius + player.radius + 5 && this.attackCooldown <= 0) {
            player.takeDamage(this.damage);
            this.attackCooldown = this.attackRate;
        }
    }
    
    takeDamage(amount) {
        this.health -= amount;
        // Spawn partikel darah
        if (settings.particlesEnabled) {
            for (let i = 0; i < 8; i++) {
                particles.push(new Particle(this.x, this.y, 'blood'));
            }
        }
        AudioSystem.playHit();
    }
    
    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        
        // Bayangan
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.beginPath();
        ctx.ellipse(2, 4, this.radius, this.radius * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.rotate(this.angle);
        
        // Warna zombie berdasarkan variant
        const colors = [
            { body: '#4a6b3a', dark: '#2d4223' },
            { body: '#5a7a4a', dark: '#3a5230' },
            { body: '#3d5a2f', dark: '#243818' }
        ];
        const c = colors[this.variant];
        
        // Badan zombie
        ctx.fillStyle = c.body;
        ctx.strokeStyle = c.dark;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // Detail badan (sobekan)
        ctx.fillStyle = '#8b0000';
        ctx.beginPath();
        ctx.arc(-3, 4, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(5, -2, 2, 0, Math.PI * 2);
        ctx.fill();
        
        // Tangan zombie (menjulur ke depan)
        ctx.fillStyle = c.body;
        ctx.fillRect(this.radius - 2, -8, 8, 4);
        ctx.fillRect(this.radius - 2, 4, 8, 4);
        
        // Kepala
        ctx.rotate(-this.angle);
        ctx.fillStyle = '#6b8e4e';
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = c.dark;
        ctx.stroke();
        
        // Mata merah menyala
        ctx.rotate(this.angle);
        ctx.fillStyle = '#ff0000';
        ctx.shadowColor = '#ff0000';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(4, -3, 2, 0, Math.PI * 2);
        ctx.arc(4, 3, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        
        // Mulut
        ctx.strokeStyle = '#2d0000';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(5, 0, 3, 0, Math.PI);
        ctx.stroke();
        
        ctx.restore();
        
        // Health bar di atas zombie (jika health < max)
        if (this.health < this.maxHealth) {
            const barWidth = 30;
            const barHeight = 4;
            const barX = this.x - barWidth / 2;
            const barY = this.y - this.radius - 10;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);
            ctx.fillStyle = '#c0392b';
            ctx.fillRect(barX, barY, barWidth * (this.health / this.maxHealth), barHeight);
        }
    }
}

// ==========================================
// 6. KELAS BULLET (PELURU)
// ==========================================
class Bullet {
    constructor(x, y, angle) {
        this.x = x;
        this.y = y;
        this.angle = angle;
        this.speed = 700;
        this.radius = 4;
        this.damage = 1;
        this.life = 2; // detik sebelum hilang
        this.trail = [];
    }
    
    update(dt) {
        // Simpan posisi sebelumnya untuk trail
        this.trail.push({ x: this.x, y: this.y });
        if (this.trail.length > 5) this.trail.shift();
        
        this.x += Math.cos(this.angle) * this.speed * dt;
        this.y += Math.sin(this.angle) * this.speed * dt;
        this.life -= dt;
    }
    
    isOffScreen() {
        return this.x < -50 || this.x > canvas.width + 50 ||
               this.y < -50 || this.y > canvas.height + 50 ||
               this.life <= 0;
    }
    
    draw() {
        // Trail peluru
        for (let i = 0; i < this.trail.length; i++) {
            const t = this.trail[i];
            const alpha = i / this.trail.length * 0.5;
            ctx.fillStyle = `rgba(255, 220, 100, ${alpha})`;
            ctx.beginPath();
            ctx.arc(t.x, t.y, this.radius * (i / this.trail.length), 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Peluru utama
        ctx.save();
        ctx.shadowColor = '#ffdd44';
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#ffeb3b';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// ==========================================
// 7. KELAS MUZZLE FLASH
// ==========================================
class MuzzleFlash {
    constructor(x, y, angle) {
        this.x = x;
        this.y = y;
        this.angle = angle;
        this.life = 0.08;
        this.maxLife = 0.08;
    }
    
    update(dt) {
        this.life -= dt;
    }
    
    draw() {
        const alpha = this.life / this.maxLife;
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.globalAlpha = alpha;
        
        // Cahaya flash
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 20);
        gradient.addColorStop(0, 'rgba(255, 255, 200, 1)');
        gradient.addColorStop(0.5, 'rgba(255, 180, 50, 0.8)');
        gradient.addColorStop(1, 'rgba(255, 100, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, 20, 0, Math.PI * 2);
        ctx.fill();
        
        // Bentuk flash
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(15, -5);
        ctx.lineTo(20, 0);
        ctx.lineTo(15, 5);
        ctx.closePath();
        ctx.fill();
        
        ctx.restore();
    }
}

// ==========================================
// 8. KELAS PARTICLE (EFEK DARAH)
// ==========================================
class Particle {
    constructor(x, y, type = 'blood') {
        this.x = x;
        this.y = y;
        this.type = type;
        const angle = Math.random() * Math.PI * 2;
        const speed = 50 + Math.random() * 150;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.life = 0.5 + Math.random() * 0.5;
        this.maxLife = this.life;
        this.size = 2 + Math.random() * 3;
        
        if (type === 'blood') {
            this.color = `rgb(${150 + Math.random() * 80}, 0, 0)`;
        } else {
            this.color = '#ffaa00';
        }
    }
    
    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        // Perlambatan
        this.vx *= 0.92;
        this.vy *= 0.92;
        this.life -= dt;
    }
    
    draw() {
        const alpha = this.life / this.maxLife;
        ctx.fillStyle = this.color;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }
}

// ==========================================
// 9. FUNGSI GAME LOOP (sesuai pseudocode materi)
// ==========================================

function gameLoop(timestamp) {
    // Hitung deltaTime dalam detik
    if (!lastTime) lastTime = timestamp;
    let dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;
    
    // Clamp deltaTime agar tidak terlalu besar (misal saat tab tidak aktif)
    if (dt > 0.1) dt = 0.1;
    
    if (gameState === STATE.PLAYING) {
        processInput();
        updatePlayer(dt);
        updateZombies(dt);
        updateBullets(dt);
        updateParticles(dt);
        updateMuzzleFlashes(dt);
        checkCollisions();
        updateHealthAndScore(dt);
        updateWaveSystem(dt);
    }
    
    renderGame();
    
    requestAnimationFrame(gameLoop);
}

// ==========================================
// 10. FUNGSI UPDATE (sesuai urutan materi)
// ==========================================

function processInput() {
    // Input sudah diproses via event listener, di sini hanya untuk logika tambahan
    // (misalnya pause via P/ESC)
}

function updatePlayer(dt) {
    if (player) player.update(dt);
}

function updateZombies(dt) {
    for (let i = zombies.length - 1; i >= 0; i--) {
        zombies[i].update(dt);
    }
}

function updateBullets(dt) {
    for (let i = bullets.length - 1; i >= 0; i--) {
        bullets[i].update(dt);
        if (bullets[i].isOffScreen()) {
            bullets.splice(i, 1);
        }
    }
}

function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update(dt);
        if (particles[i].life <= 0) {
            particles.splice(i, 1);
        }
    }
}

function updateMuzzleFlashes(dt) {
    for (let i = muzzleFlashes.length - 1; i >= 0; i--) {
        muzzleFlashes[i].update(dt);
        if (muzzleFlashes[i].life <= 0) {
            muzzleFlashes.splice(i, 1);
        }
    }
}

// ==========================================
// 11. COLLISION DETECTION
// ==========================================

function checkCollisions() {
    // Peluru vs Zombie
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        for (let j = zombies.length - 1; j >= 0; j--) {
            const z = zombies[j];
            const dx = b.x - z.x;
            const dy = b.y - z.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist < b.radius + z.radius) {
                // Zombie terkena peluru
                z.takeDamage(b.damage);
                bullets.splice(i, 1);
                
                if (z.health <= 0) {
                    // Zombie mati
                    if (settings.particlesEnabled) {
                        for (let k = 0; k < 15; k++) {
                            particles.push(new Particle(z.x, z.y, 'blood'));
                        }
                    }
                    zombies.splice(j, 1);
                    score += 10;
                    kills++;
                }
                break; // peluru hanya kena 1 zombie
            }
        }
    }
}

function updateHealthAndScore(dt) {
    elapsedTime += dt;
    updateHUD();
}

// ==========================================
// 12. WAVE SYSTEM
// ==========================================

function updateWaveSystem(dt) {
    // Jika sedang jeda antar wave
    if (waveTransitionTimer > 0) {
        waveTransitionTimer -= dt;
        if (waveTransitionTimer <= 0) {
            startNewWave();
        }
        return;
    }
    
    waveTimer += dt;
    waveSpawnTimer -= dt;
    
    // Spawn zombie sesuai jadwal
    if (waveSpawnTimer <= 0 && zombiesSpawnedThisWave < zombiesToSpawnThisWave) {
        spawnZombie();
        zombiesSpawnedThisWave++;
        // Interval spawn semakin cepat seiring wave
        waveSpawnTimer = Math.max(0.3, 1.5 - currentWave * 0.1);
    }
    
    // Cek apakah wave selesai (semua zombie di-spawn dan mati)
    if (zombiesSpawnedThisWave >= zombiesToSpawnThisWave && zombies.length === 0) {
        currentWave++;
        score += currentWave * 50; // bonus wave
        waveTransitionTimer = 3;
        showWaveAnnouncement(currentWave);
        AudioSystem.playWaveStart();
    }
}

function startNewWave() {
    const diff = DIFFICULTY[settings.difficulty];
    zombiesToSpawnThisWave = Math.floor((3 + currentWave * 2) * diff.spawnMul);
    zombiesSpawnedThisWave = 0;
    waveTimer = 0;
    waveSpawnTimer = 0.5;
}

function spawnZombie() {
    // Spawn dari pinggir layar
    const side = Math.floor(Math.random() * 4);
    let x, y;
    const margin = 40;
    
    switch (side) {
        case 0: // atas
            x = Math.random() * canvas.width;
            y = -margin;
            break;
        case 1: // kanan
            x = canvas.width + margin;
            y = Math.random() * canvas.height;
            break;
        case 2: // bawah
            x = Math.random() * canvas.width;
            y = canvas.height + margin;
            break;
        case 3: // kiri
            x = -margin;
            y = Math.random() * canvas.height;
            break;
    }
    
    zombies.push(new Zombie(x, y));
}

function showWaveAnnouncement(wave) {
    const el = document.getElementById('wave-announcement');
    el.textContent = `WAVE ${wave}`;
    el.classList.remove('hidden');
    // Reset animasi
    el.style.animation = 'none';
    el.offsetHeight; // trigger reflow
    el.style.animation = '';
    setTimeout(() => {
        el.classList.add('hidden');
    }, 2500);
}

// ==========================================
// 13. RENDER GAME
// ==========================================

function renderGame() {
    // Clear canvas
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Screen shake effect
    ctx.save();
    if (screenShake > 0) {
        const shakeX = (Math.random() - 0.5) * screenShake;
        const shakeY = (Math.random() - 0.5) * screenShake;
        ctx.translate(shakeX, shakeY);
        screenShake *= 0.85;
        if (screenShake < 0.5) screenShake = 0;
    }
    
    // Gambar arena (lantai dengan pola grid)
    drawArena();
    
    // Gambar entitas hanya saat bermain atau game over
    if (gameState === STATE.PLAYING || gameState === STATE.PAUSED || gameState === STATE.GAME_OVER) {
        // Partikel di bawah
        for (const p of particles) p.draw();
        
        // Peluru
        for (const b of bullets) b.draw();
        
        // Muzzle flash
        for (const m of muzzleFlashes) m.draw();
        
        // Zombie
        for (const z of zombies) z.draw();
        
        // Pemain
        if (player) player.draw();
    }
    
    ctx.restore();
}

function drawArena() {
    // Latar gelap dengan gradient
    const gradient = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, 100,
        canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height) / 1.5
    );
    gradient.addColorStop(0, '#1a1a1a');
    gradient.addColorStop(1, '#050505');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Grid pattern
    const gridSize = 50;
    ctx.strokeStyle = 'rgba(192, 57, 43, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < canvas.width; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
    }
    for (let y = 0; y < canvas.height; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
    }
    ctx.stroke();
    
    // Noda darah acak (dekoratif)
    ctx.fillStyle = 'rgba(100, 0, 0, 0.15)';
    for (let i = 0; i < 8; i++) {
        const x = ((i * 137) % canvas.width);
        const y = ((i * 241) % canvas.height);
        ctx.beginPath();
        ctx.arc(x, y, 20 + (i * 7) % 30, 0, Math.PI * 2);
        ctx.fill();
    }
}

// ==========================================
// 14. HUD UPDATE
// ==========================================

function updateHUD() {
    // Health bar
    const healthBar = document.getElementById('health-bar');
    const healthPercent = (player.health / player.maxHealth) * 100;
    healthBar.style.width = healthPercent + '%';
    healthBar.classList.remove('medium', 'low');
    if (healthPercent <= 30) healthBar.classList.add('low');
    else if (healthPercent <= 60) healthBar.classList.add('medium');
    
    // Score, kills, wave
    document.getElementById('score-display').textContent = score;
    document.getElementById('kills-display').textContent = kills;
    document.getElementById('wave-display').textContent = currentWave;
    
    // Timer
    const mins = Math.floor(elapsedTime / 60);
    const secs = Math.floor(elapsedTime % 60);
    document.getElementById('time-display').textContent = 
        `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// ==========================================
// 15. GAME STATE MANAGEMENT
// ==========================================

function startGame() {
    // Reset semua state
    player = new Player(canvas.width / 2, canvas.height / 2);
    zombies = [];
    bullets = [];
    particles = [];
    muzzleFlashes = [];
    score = 0;
    kills = 0;
    currentWave = 1;
    elapsedTime = 0;
    waveTimer = 0;
    waveSpawnTimer = 0;
    zombiesSpawnedThisWave = 0;
    screenShake = 0;
    
    // Mulai wave pertama
    startNewWave();
    showWaveAnnouncement(1);
    
    // Ubah state
    gameState = STATE.PLAYING;
    
    // Tampilkan HUD, sembunyikan menu
    document.getElementById('hud').classList.remove('hidden');
    document.getElementById('pause-btn').classList.remove('hidden');
    document.getElementById('main-menu').classList.add('hidden');
    document.getElementById('gameover-screen').classList.add('hidden');
    document.getElementById('pause-screen').classList.add('hidden');
    
    // Inisialisasi audio (butuh user gesture)
    if (!AudioSystem.ctx) AudioSystem.init();
    if (AudioSystem.ctx && AudioSystem.ctx.state === 'suspended') {
        AudioSystem.ctx.resume();
    }
}

function pauseGame() {
    if (gameState !== STATE.PLAYING) return;
    gameState = STATE.PAUSED;
    document.getElementById('pause-screen').classList.remove('hidden');
}

function resumeGame() {
    if (gameState !== STATE.PAUSED) return;
    gameState = STATE.PLAYING;
    document.getElementById('pause-screen').classList.add('hidden');
    lastTime = performance.now(); // reset deltaTime agar tidak loncat
}

function gameOver() {
    gameState = STATE.GAME_OVER;
    AudioSystem.playGameOver();
    
    // Isi statistik akhir
    document.getElementById('final-score').textContent = score;
    document.getElementById('final-kills').textContent = kills;
    document.getElementById('final-wave').textContent = currentWave;
    const mins = Math.floor(elapsedTime / 60);
    const secs = Math.floor(elapsedTime % 60);
    document.getElementById('final-time').textContent = 
        `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    
    // Tampilkan layar game over
    document.getElementById('gameover-screen').classList.remove('hidden');
    document.getElementById('pause-btn').classList.add('hidden');
}

function returnToMenu() {
    gameState = STATE.MENU;
    player = null;
    zombies = [];
    bullets = [];
    particles = [];
    muzzleFlashes = [];
    
    document.getElementById('main-menu').classList.remove('hidden');
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('pause-btn').classList.add('hidden');
    document.getElementById('pause-screen').classList.add('hidden');
    document.getElementById('gameover-screen').classList.add('hidden');
    document.getElementById('howto-screen').classList.add('hidden');
    document.getElementById('settings-screen').classList.add('hidden');
}

// ==========================================
// 16. EVENT LISTENERS - INPUT
// ==========================================

// Keyboard
window.addEventListener('keydown', (e) => {
    keys[e.key] = true;
    
    // Pause/Resume dengan P atau Escape
    if ((e.key === 'p' || e.key === 'P' || e.key === 'Escape') && 
        (gameState === STATE.PLAYING || gameState === STATE.PAUSED)) {
        if (gameState === STATE.PLAYING) pauseGame();
        else resumeGame();
    }
    
    // Cegah scroll dengan arrow keys
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
    }
});

window.addEventListener('keyup', (e) => {
    keys[e.key] = false;
});

// Mouse
canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
});

canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) { // klik kiri
        mouse.down = true;
        // Inisialisasi audio saat interaksi pertama
        if (!AudioSystem.ctx) AudioSystem.init();
        if (AudioSystem.ctx && AudioSystem.ctx.state === 'suspended') {
            AudioSystem.ctx.resume();
        }
    }
});

canvas.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouse.down = false;
});

canvas.addEventListener('mouseleave', () => {
    mouse.down = false;
});

// Cegah context menu saat klik kanan
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ==========================================
// 17. EVENT LISTENERS - UI BUTTONS
// ==========================================

// Main menu buttons
document.getElementById('play-btn').addEventListener('click', startGame);

document.getElementById('howto-btn').addEventListener('click', () => {
    document.getElementById('main-menu').classList.add('hidden');
    document.getElementById('howto-screen').classList.remove('hidden');
});

document.getElementById('settings-btn').addEventListener('click', () => {
    document.getElementById('main-menu').classList.add('hidden');
    document.getElementById('settings-screen').classList.remove('hidden');
});

document.getElementById('back-from-howto').addEventListener('click', () => {
    document.getElementById('howto-screen').classList.add('hidden');
    document.getElementById('main-menu').classList.remove('hidden');
});

document.getElementById('back-from-settings').addEventListener('click', () => {
    document.getElementById('settings-screen').classList.add('hidden');
    document.getElementById('main-menu').classList.remove('hidden');
});

// Pause screen
document.getElementById('pause-btn').addEventListener('click', () => {
    if (gameState === STATE.PLAYING) pauseGame();
});

document.getElementById('resume-btn').addEventListener('click', resumeGame);

document.getElementById('restart-pause-btn').addEventListener('click', () => {
    document.getElementById('pause-screen').classList.add('hidden');
    startGame();
});

document.getElementById('menu-pause-btn').addEventListener('click', returnToMenu);

// Game over screen
document.getElementById('restart-btn').addEventListener('click', startGame);
document.getElementById('menu-btn').addEventListener('click', returnToMenu);

// Settings controls
document.getElementById('volume-slider').addEventListener('input', (e) => {
    settings.volume = e.target.value / 100;
    document.getElementById('volume-value').textContent = e.target.value + '%';
});

document.getElementById('difficulty-select').addEventListener('change', (e) => {
    settings.difficulty = e.target.value;
});

document.getElementById('particles-toggle').addEventListener('change', (e) => {
    settings.particlesEnabled = e.target.checked;
});

// ==========================================
// 18. INISIALISASI
// ==========================================

// Mulai game loop
requestAnimationFrame(gameLoop);

console.log('%c🧟 ZOMBIE SURVIVAL 2D', 'color: #c0392b; font-size: 20px; font-weight: bold;');
console.log('%cFajar Ramadhan - 25210105 - Pemrograman Game', 'color: #888; font-size: 12px;');
console.log('Game siap dimainkan. Klik PLAY GAME untuk mulai!');