/* =======================================================================
   3D 第一人称射击（FPS）· 敌人系统
   Three.js r134 经典全局构建（file:// 双击可运行，可离线）

   玩家：血量 100，每发伤害 10；敌人：血量 100，每发伤害 5。归零即死。
   - 敌人面向玩家 + 视线检测（障碍可当掩体）+ 周期射出红色弹丸（可走位躲闪）
   - 玩家左键连射，射线命中敌人扣血；敌人头顶血条
   - 受击红屏、阵亡结算、波次/击杀、重新开始
   ======================================================================= */
(function () {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- 场景 ----------
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fd3ff);
  scene.fog = new THREE.Fog(0x9fd3ff, 45, 130);

  const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.rotation.order = "YXZ";
  scene.add(camera);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);

  // ---------- 灯光 ----------
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const sun = new THREE.DirectionalLight(0xffffff, 0.9);
  sun.position.set(20, 30, 16);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 120;
  sun.shadow.camera.left = -60; sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 60; sun.shadow.camera.bottom = -60;
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  // ---------- 地面 ----------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x6cc04a, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const grid = new THREE.GridHelper(200, 100, 0x2f6b22, 0x3d8a30);
  grid.position.y = 0.02; grid.material.opacity = 0.5; grid.material.transparent = true;
  scene.add(grid);

  // ---------- 障碍物 ----------
  const obstacles = [];
  const COLORS = [0xff6b6b, 0x4ec9f5, 0xffd93b, 0xc77bff, 0xff9f43, 0x6bff8c];
  function mat(c) { return new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 }); }
  function addObstacle(mesh, h, x, z) {
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh); obstacles.push(mesh);
  }
  const box  = (w, h, d, x, z, c) => addObstacle(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c)), h, x, z);
  const cyl  = (r, h, x, z, c)    => addObstacle(new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 24), mat(c)), h, x, z);
  const cone = (r, h, x, z, c)    => addObstacle(new THREE.Mesh(new THREE.ConeGeometry(r, h, 24), mat(c)), h, x, z);
  box(3, 4, 3, -8, -6, COLORS[0]); box(2, 2, 6, 10, 8, COLORS[1]); box(5, 3, 2, 6, -10, COLORS[2]);
  cyl(2, 5, -12, 9, COLORS[3]); cone(2.2, 5, 13, -3, COLORS[4]); box(2.5, 6, 2.5, -4, 12, COLORS[5]);
  box(1.5, 1.5, 1.5, 4, 4, COLORS[0]); cyl(1.2, 3, -7, 5, COLORS[1]); box(4, 2, 4, -14, -12, COLORS[2]);
  cone(1.6, 3.5, 8, 14, COLORS[3]);
  obstacles.forEach(o => {
    const bb = new THREE.Box3().setFromObject(o);
    o.userData.aabb = { minX: bb.min.x, maxX: bb.max.x, minZ: bb.min.z, maxZ: bb.max.z };
  });

  // ---------- 角色 + 枪 ----------
  const EYE = 2.4;
  const player = { x: 0, z: 10, health: 100, dead: false };

  function createGun() {
    const gun = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x2b2b30, roughness: 0.5, metalness: 0.4 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.8), dark); body.position.z = 0.1; gun.add(body);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.5, 12), dark);
    barrel.rotation.x = Math.PI / 2; barrel.position.z = 0.7; gun.add(barrel);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.35, 0.14), dark); handle.position.set(0, -0.24, -0.05); gun.add(handle);
    return gun;
  }
  const GUN_BASE_Z = -0.55;
  const gun = createGun();
  gun.rotation.y = Math.PI;
  gun.position.set(0.32, -0.30, GUN_BASE_Z);
  gun.traverse(o => { if (o.isMesh) o.castShadow = false; });
  camera.add(gun);

  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0, 0.95); gun.add(muzzle);
  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  flash.position.copy(muzzle.position); flash.visible = false; gun.add(flash);
  let flashLife = 0, recoil = 0;

  // ---------- 音效 ----------
  let audioCtx = null, shotBuffer = null;
  function ensureAudio() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const dur = 0.12;
      shotBuffer = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * dur), audioCtx.sampleRate);
      const d = shotBuffer.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.2);
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
  }
  function tone(freq, start, dur, type, vol, endFreq) {
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime + start;
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(audioCtx.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function sfxShoot() {
    if (!audioCtx) return;
    const src = audioCtx.createBufferSource(); src.buffer = shotBuffer;
    const g = audioCtx.createGain(); g.gain.value = 0.28;
    const f = audioCtx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 1600;
    src.connect(f).connect(g).connect(audioCtx.destination); src.start();
  }
  const sfxHit       = () => tone(1400, 0, 0.06, "square", 0.14, 500);
  const sfxEnemyShoot= () => { tone(360, 0, 0.10, "sawtooth", 0.10, 180); };
  const sfxPlayerHurt= () => { tone(140, 0, 0.18, "square", 0.22, 70); };
  const sfxEnemyDie  = () => { tone(300, 0, 0.30, "sawtooth", 0.20, 50); };

  // ---------- 玩家射击：射线 + 曳光弹 + 粒子 ----------
  const raycaster = new THREE.Raycaster();
  raycaster.far = 200;
  const CENTER = new THREE.Vector2(0, 0);
  const _v = new THREE.Vector3();
  const PARTICLE_GEO = new THREE.SphereGeometry(0.07, 6, 6);
  const particles = [], tracers = [];

  function spawnHit(pos, color, count) {
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(PARTICLE_GEO, new THREE.MeshBasicMaterial({ color }));
      m.position.copy(pos);
      const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 5;
      m.userData = { vx: Math.cos(a) * sp, vy: sp * (0.4 + Math.random()), vz: Math.sin(a) * sp, life: 0.4 + Math.random() * 0.3, max: 0.7 };
      scene.add(m); particles.push(m);
    }
  }
  function spawnTracer(from, to) {
    const g = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
    const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.95 }));
    scene.add(line); tracers.push({ line, life: 0.07, max: 0.07 });
  }

  let firing = false, fireCooldown = 0;
  const FIRE_INTERVAL = 0.14;
  function shoot() {
    ensureAudio(); sfxShoot();
    recoil = Math.min(recoil + 0.9, 1.5);
    flashLife = 0.05; flash.visible = true; flash.material.opacity = 1; flash.scale.setScalar(0.7 + Math.random() * 0.6);
    raycaster.setFromCamera(CENTER, camera);
    const hits = raycaster.intersectObjects([ground].concat(obstacles, enemies), true);
    muzzle.getWorldPosition(_v);
    if (hits.length > 0) {
      const h = hits[0];
      spawnTracer(_v, h.point);
      let o = h.object, enemy = null;
      while (o) { if (o.userData && o.userData.enemy) { enemy = o.userData.enemy; break; } o = o.parent; }
      if (enemy && enemy.userData.alive) damageEnemy(enemy, 10, h.point);
      else spawnHit(h.point, (h.object === ground) ? 0x9a9a9a : ((h.object.material && h.object.material.color) ? h.object.material.color.getHex() : 0xffe066), 12);
      sfxHit();
    } else {
      const far = new THREE.Vector3(); raycaster.ray.at(150, far);
      spawnTracer(_v, far);
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i], u = p.userData;
      u.life -= dt;
      if (u.life <= 0) { scene.remove(p); p.material.dispose(); particles.splice(i, 1); continue; }
      u.vy -= 18 * dt;
      p.position.x += u.vx * dt; p.position.y += u.vy * dt; p.position.z += u.vz * dt;
      if (p.position.y < 0.05) { p.position.y = 0.05; u.vy *= -0.4; u.vx *= 0.7; u.vz *= 0.7; }
      p.scale.setScalar(Math.max(0.1, u.life / u.max));
    }
  }
  function updateTracers(dt) {
    for (let i = tracers.length - 1; i >= 0; i--) {
      const t = tracers[i]; t.life -= dt;
      if (t.life <= 0) { scene.remove(t.line); t.line.geometry.dispose(); t.line.material.dispose(); tracers.splice(i, 1); continue; }
      t.line.material.opacity = (t.life / t.max) * 0.95;
    }
  }

  // ---------- 敌人 ----------
  const enemies = [];
  const enemyProjectiles = [];
  const ENEMY_PROJ_GEO = new THREE.SphereGeometry(0.14, 8, 8);
  const ENEMY_COLORS = { red: 0xc0392b, dark: 0x2b1416, metal: 0x4a2030 };

  function makeBar() {
    const g = new THREE.Group();
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.18), new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.7 }));
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.12), new THREE.MeshBasicMaterial({ color: 0x33dd33 }));
    fill.position.z = 0.001;
    g.add(bg); g.add(fill); g.userData.fill = fill;
    return g;
  }
  function createEnemy(x, z) {
    const g = new THREE.Group();
    const mC = (c, emi) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, metalness: 0.2, emissive: emi || 0x000000, emissiveIntensity: emi ? 0.9 : 0 });
    function add(mesh) { mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh); return mesh; }
    add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.2, 0.5), mC(ENEMY_COLORS.dark))).position.y = 1.5;
    add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), mC(ENEMY_COLORS.metal))).position.y = 2.35;
    const eye = add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 10), mC(0xff3322, 0xff2200))); eye.position.set(0, 2.4, 0.26);
    const lArm = add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.0, 0.22), mC(ENEMY_COLORS.red))); lArm.position.set(-0.6, 2.0, 0); lArm.rotation.x = -0.4;
    const rArm = add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.0, 0.22), mC(ENEMY_COLORS.red))); rArm.position.set(0.6, 2.0, 0); rArm.rotation.x = -0.4;
    add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.9, 0.35), mC(ENEMY_COLORS.dark))).position.set(-0.22, 0.45, 0);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.9, 0.35), mC(ENEMY_COLORS.dark))).position.set(0.22, 0.45, 0);
    g.position.set(x, 0, z);
    g.userData = { health: 100, alive: true, cooldown: 0.6 + Math.random() * 1.4, eye, hitFlash: 0 };
    g.traverse(o => { if (o.isMesh) { o.userData.enemy = g; o.userData.baseEmissive = o.material.emissive ? o.material.emissive.getHex() : 0; o.userData.baseEmInt = o.material.emissiveIntensity || 0; } });
    const bar = makeBar(); scene.add(bar); g.userData.bar = bar;
    scene.add(g); enemies.push(g);
    return g;
  }

  let wave = 1, kills = 0;
  function spawnWave() {
    const count = Math.min(3 + wave, 6);
    for (let i = 0; i < count; i++) {
      let x, z, tries = 0;
      do { x = (Math.random() * 2 - 1) * 32; z = (Math.random() * 2 - 1) * 32; tries++; }
      while (tries < 25 && (blocked(x, z) || (x * x + z * z) < 81));
      createEnemy(x, z);
    }
    updateStatsUI();
  }

  function damageEnemy(enemy, dmg, point) {
    enemy.userData.health -= dmg;
    enemy.userData.hitFlash = 0.12;
    spawnHit(point, 0xff3322, 8);
    if (enemy.userData.health <= 0) killEnemy(enemy);
  }
  function killEnemy(enemy) {
    enemy.userData.alive = false;
    const p = new THREE.Vector3(); enemy.getWorldPosition(p); p.y = 1.5;
    spawnHit(p, 0xff3322, 34);
    sfxEnemyDie();
    scene.remove(enemy); scene.remove(enemy.userData.bar);
    const i = enemies.indexOf(enemy); if (i >= 0) enemies.splice(i, 1);
    kills++; updateStatsUI();
    if (enemies.length === 0) { wave++; spawnWave(); }
  }

  // 视线检测：敌人到玩家之间是否有障碍
  const _los = new THREE.Raycaster();
  function hasLineOfSight(e) {
    const from = new THREE.Vector3(e.position.x, 1.5, e.position.z);
    const to = new THREE.Vector3(player.x, EYE, player.z);
    const dir = to.clone().sub(from); const dist = dir.length(); dir.normalize();
    _los.set(from, dir); _los.far = dist;
    return _los.intersectObjects(obstacles, false).length === 0;
  }
  function enemyShoot(e) {
    ensureAudio(); sfxEnemyShoot();
    const from = new THREE.Vector3(e.position.x, 1.7, e.position.z);
    const to = new THREE.Vector3(player.x, EYE, player.z);
    const dir = to.sub(from); dir.normalize();
    const speed = 26;
    const mesh = new THREE.Mesh(ENEMY_PROJ_GEO, new THREE.MeshBasicMaterial({ color: 0xff3322, blending: THREE.AdditiveBlending, depthWrite: false }));
    mesh.position.copy(from);
    scene.add(mesh);
    enemyProjectiles.push({ mesh, vx: dir.x * speed, vy: dir.y * speed, vz: dir.z * speed, life: 3 });
    spawnHit(from.clone(), 0xff5533, 4);
  }

  function updateEnemies(dt) {
    for (const e of enemies) {
      if (!e.userData.alive) continue;
      const dx = player.x - e.position.x, dz = player.z - e.position.z;
      e.rotation.y = Math.atan2(dx, dz); // 正面(+Z/眼)朝向玩家
      if (!player.dead) {
        e.userData.cooldown -= dt;
        if (e.userData.cooldown <= 0) {
          e.userData.cooldown = 1.3 + Math.random() * 0.9;
          if (hasLineOfSight(e)) enemyShoot(e);
        }
      }
      // 受击闪白
      if (e.userData.hitFlash > 0) {
        e.userData.hitFlash -= dt;
        const k = Math.max(0, e.userData.hitFlash / 0.12);
        e.traverse(o => { if (o.isMesh && o.material.emissive) o.material.emissiveIntensity = o.userData.baseEmInt + k * 1.2; });
      }
      // 头顶血条 billboard
      const bar = e.userData.bar, ratio = Math.max(0, e.userData.health / 100);
      bar.position.set(e.position.x, 3.0, e.position.z);
      bar.quaternion.copy(camera.quaternion);
      bar.userData.fill.scale.x = ratio;
      bar.userData.fill.position.x = -(1 - ratio) * 0.55;
      bar.userData.fill.material.color.setHex(ratio > 0.5 ? 0x33dd33 : ratio > 0.25 ? 0xddaa22 : 0xdd3322);
    }
  }
  function updateEnemyProjectiles(dt) {
    for (let i = enemyProjectiles.length - 1; i >= 0; i--) {
      const p = enemyProjectiles[i]; p.life -= dt;
      p.mesh.position.x += p.vx * dt; p.mesh.position.y += p.vy * dt; p.mesh.position.z += p.vz * dt;
      let remove = false;
      const dx = p.mesh.position.x - player.x, dy = p.mesh.position.y - EYE, dz = p.mesh.position.z - player.z;
      if (!player.dead && dx * dx + dy * dy + dz * dz < 0.5) { damagePlayer(5); spawnHit(p.mesh.position, 0xff3322, 8); remove = true; }
      else if (p.mesh.position.y <= 0.05) { spawnHit(p.mesh.position.clone().setY(0.05), 0xff5533, 6); remove = true; }
      else if (blocked(p.mesh.position.x, p.mesh.position.z)) { spawnHit(p.mesh.position, 0xff5533, 6); remove = true; }
      else if (p.life <= 0 || Math.abs(p.mesh.position.x) > 100 || Math.abs(p.mesh.position.z) > 100) remove = true;
      if (remove) { scene.remove(p.mesh); p.mesh.material.dispose(); enemyProjectiles.splice(i, 1); }
    }
  }

  // ---------- 玩家受击 / 死亡 ----------
  let damageFlash = 0;
  function damagePlayer(dmg) {
    if (player.dead) return;
    player.health -= dmg;
    damageFlash = 0.5;
    sfxPlayerHurt();
    updateHealthUI();
    if (player.health <= 0) { player.health = 0; playerDie(); }
  }
  function playerDie() {
    player.dead = true; firing = false;
    if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
    document.getElementById("gameover").style.display = "flex";
    updateLockUI();
  }

  // ---------- 输入 ----------
  const keys = {};
  window.addEventListener("keydown", (e) => { keys[e.code] = true; if (e.code.startsWith("Arrow")) e.preventDefault(); });
  window.addEventListener("keyup", (e) => { keys[e.code] = false; });
  const pressed = (...codes) => codes.some(c => keys[c]);

  let yaw = 0, pitch = 0;
  const SENS = 0.0022;
  window.addEventListener("click", () => {
    ensureAudio();
    if (!player.dead && document.pointerLockElement !== renderer.domElement) renderer.domElement.requestPointerLock();
  });
  window.addEventListener("mousemove", (e) => {
    if (document.pointerLockElement !== renderer.domElement) return;
    yaw -= e.movementX * SENS;
    pitch -= e.movementY * SENS;
    pitch = clamp(pitch, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);
  });
  window.addEventListener("mousedown", (e) => { if (e.button === 0 && document.pointerLockElement === renderer.domElement && !player.dead) firing = true; });
  window.addEventListener("mouseup", (e) => { if (e.button === 0) firing = false; });

  function updateLockUI() {
    const locked = document.pointerLockElement === renderer.domElement;
    const showPrompt = !locked && !player.dead;
    document.getElementById("lock-prompt").style.display = showPrompt ? "flex" : "none";
    document.getElementById("crosshair").style.display = (locked && !player.dead) ? "block" : "none";
    if (!locked) firing = false;
  }
  document.addEventListener("pointerlockchange", updateLockUI);
  updateLockUI();

  document.getElementById("btn-restart").addEventListener("click", (ev) => { ev.stopPropagation(); restart(); });

  // ---------- 碰撞 ----------
  const R = 0.45;
  function blocked(x, z) {
    for (const o of obstacles) {
      const a = o.userData.aabb;
      if (x > a.minX - R && x < a.maxX + R && z > a.minZ - R && z < a.maxZ + R) return true;
    }
    return false;
  }

  // ---------- UI ----------
  function updateHealthUI() {
    const pct = Math.max(0, player.health);
    const f = document.getElementById("hp-fill");
    f.style.width = pct + "%";
    f.style.background = pct > 50 ? "linear-gradient(90deg,#3ce06b,#27ae60)" : pct > 25 ? "linear-gradient(90deg,#ffd24a,#e6a012)" : "linear-gradient(90deg,#ff6b6b,#c0392b)";
    document.getElementById("hp-text").textContent = Math.round(pct);
  }
  function updateStatsUI() {
    document.getElementById("wave").textContent = wave;
    document.getElementById("kills").textContent = kills;
    document.getElementById("go-wave").textContent = wave;
    document.getElementById("go-kills").textContent = kills;
  }

  // ---------- 重新开始 ----------
  function restart() {
    player.health = 100; player.dead = false; player.x = 0; player.z = 10; yaw = 0; pitch = 0;
    enemies.slice().forEach(e => { scene.remove(e); if (e.userData.bar) scene.remove(e.userData.bar); });
    enemies.length = 0;
    enemyProjectiles.forEach(p => scene.remove(p.mesh)); enemyProjectiles.length = 0;
    particles.forEach(p => scene.remove(p)); particles.length = 0;
    tracers.forEach(t => scene.remove(t.line)); tracers.length = 0;
    damageFlash = 0; recoil = 0; firing = false;
    wave = 1; kills = 0;
    spawnWave();
    updateHealthUI(); updateStatsUI();
    document.getElementById("gameover").style.display = "none";
    updateLockUI();
  }

  // ---------- 响应式 ----------
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ---------- 主循环 ----------
  const SPEED = 8;
  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), move = new THREE.Vector3();
  let last = performance.now();
  function animate(now) {
    requestAnimationFrame(animate);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;

    if (!player.dead) {
      fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw));
      right.set(Math.cos(yaw), 0, -Math.sin(yaw));
      move.set(0, 0, 0);
      if (pressed("KeyW", "ArrowUp")) move.add(fwd);
      if (pressed("KeyS", "ArrowDown")) move.sub(fwd);
      if (pressed("KeyD", "ArrowRight")) move.add(right);
      if (pressed("KeyA", "ArrowLeft")) move.sub(right);
      if (move.lengthSq() > 0.0001) {
        move.normalize();
        const dx = move.x * SPEED * dt, dz = move.z * SPEED * dt;
        const nx = player.x + dx; if (!blocked(nx, player.z)) player.x = clamp(nx, -95, 95);
        const nz = player.z + dz; if (!blocked(player.x, nz)) player.z = clamp(nz, -95, 95);
      }
      fireCooldown -= dt;
      if (firing && fireCooldown <= 0) { fireCooldown = FIRE_INTERVAL; shoot(); }
    }

    updateEnemies(dt);
    updateEnemyProjectiles(dt);
    updateParticles(dt);
    updateTracers(dt);

    if (flashLife > 0) {
      flashLife -= dt;
      flash.material.opacity = Math.max(0, flashLife / 0.05);
      flash.scale.setScalar(0.7 + (1 - flashLife / 0.05) * 0.8);
      if (flashLife <= 0) flash.visible = false;
    }
    recoil *= Math.pow(0.0001, dt); if (recoil < 0.001) recoil = 0;
    gun.position.z = GUN_BASE_Z + recoil * 0.18;

    camera.position.set(player.x, EYE, player.z);
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;

    if (damageFlash > 0) { damageFlash = Math.max(0, damageFlash - dt * 1.5); document.getElementById("dmg-flash").style.opacity = damageFlash * 0.6; }

    renderer.render(scene, camera);
  }

  // ---------- 启动 ----------
  spawnWave();
  updateHealthUI();
  updateStatsUI();
  animate(performance.now());

  window.GAME3D = { scene, camera, renderer, player, enemies, obstacles, restart, THREE };
})();
