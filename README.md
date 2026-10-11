const defaultState = {
  selectedRobot: 'starter',
  selectedColor: '#4db9ff',
  unlockedRobots: ['starter'],
  unlockedWeapons: ['pulse_gun', 'shock_saber'],
  scrap: 0,
  selectedWeapon: 'pulse_gun'
};

const STORAGE_KEY = 'robot-game-progress';
const robotDefinitions = {
  starter: { displayName: 'Starter Bot', cost: 0, color: '#4db9ff', speed: 5.8, maxHealth: 100 },
  scout: { displayName: 'Scout Bot', cost: 75, color: '#7ef59d', speed: 7.2, maxHealth: 90 },
  brute: { displayName: 'Brute Bot', cost: 120, color: '#ff7b5e', speed: 4.9, maxHealth: 140 },
  vanguard: { displayName: 'Vanguard Bot', cost: 180, color: '#d88cff', speed: 5.8, maxHealth: 125 }
};

const weaponDefinitions = {
  pulse_gun: { displayName: 'Pulse Gun', damage: 20, cooldown: 0.18, range: 20 },
  shock_saber: { displayName: 'Shock Saber', damage: 32, cooldown: 0.62, range: 3 }
};

const canvas = document.getElementById('gameCanvas');
if (!canvas) {
  throw new Error('Canvas not found');
}

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f172a);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 2.8, 8);

const ambient = new THREE.HemisphereLight(0xbfe3ff, 0x12202d, 0.95);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(8, 12, 5);
scene.add(sun);

const floor = new THREE.Mesh(
  new THREE.BoxGeometry(30, 0.5, 30),
  new THREE.MeshStandardMaterial({ color: 0x1f2937 })
);
floor.position.set(0, -0.25, 0);
scene.add(floor);

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultState };
    const parsed = JSON.parse(raw);
    return {
      ...defaultState,
      ...parsed,
      unlockedRobots: Array.isArray(parsed.unlockedRobots) ? parsed.unlockedRobots : defaultState.unlockedRobots,
      unlockedWeapons: Array.isArray(parsed.unlockedWeapons) ? parsed.unlockedWeapons : defaultState.unlockedWeapons
    };
  } catch {
    return { ...defaultState };
  }
}

const state = loadState();

const player = {
  mesh: null,
  velocity: new THREE.Vector3(),
  yaw: 0,
  pitch: -0.42,
  speed: 5.8,
  sprintSpeed: 8.2,
  jumpVelocity: 6,
  gravity: 16,
  maxHealth: 100,
  currentHealth: 100,
  selectedRobot: state.selectedRobot || 'starter',
  selectedColor: state.selectedColor || '#4db9ff',
  selectedWeapon: state.selectedWeapon || 'pulse_gun',
  fireCooldown: 0,
  meleeCooldown: 0,
  onGround: true,
  isMobile: window.innerWidth <= 768
};

const enemies = [];
const pickups = [];

const scrapLabel = document.getElementById('scrapLabel');
const healthLabel = document.getElementById('healthLabel');
const robotLabel = document.getElementById('robotLabel');
const infoLabel = document.getElementById('infoLabel');
const robotButtonsEl = document.getElementById('robotButtons');
const colorButtonsEl = document.getElementById('colorButtons');
const weaponButtonsEl = document.getElementById('weaponButtons');
const fireButton = document.getElementById('fireButton');
const meleeButton = document.getElementById('meleeButton');
const joystickArea = document.getElementById('joystickArea');
const joystickKnob = document.getElementById('joystickKnob');

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    selectedRobot: state.selectedRobot,
    selectedColor: state.selectedColor,
    unlockedRobots: state.unlockedRobots,
    unlockedWeapons: state.unlockedWeapons,
    scrap: state.scrap,
    selectedWeapon: state.selectedWeapon
  }));
}

function applyRobotVisuals() {
  const def = robotDefinitions[player.selectedRobot] || robotDefinitions.starter;
  player.speed = def.speed;
  player.sprintSpeed = def.speed + 2.2;
  player.maxHealth = def.maxHealth;
  player.currentHealth = def.maxHealth;
  player.jumpVelocity = 5.8;

  if (!player.mesh) return;
  const color = new THREE.Color(player.selectedColor);
  player.mesh.children.forEach((part) => {
    if (part.material) {
      part.material.color = color;
    }
  });
}

function buildPlayer() {
  const root = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(player.selectedColor),
    metalness: 0.7,
    roughness: 0.3
  });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1.8, 0.8), bodyMaterial);
  body.position.y = 0.9;
  root.add(body);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.8), bodyMaterial.clone());
  head.position.y = 1.8;
  root.add(head);

  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 1.1), bodyMaterial.clone());
  gun.position.set(0.45, 1.35, -0.2);
  root.add(gun);

  root.position.set(0, 0, 0);
  scene.add(root);
  player.mesh = root;
  applyRobotVisuals();
}

function spawnEnemy(position) {
  const enemyGroup = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1.5, 1),
    new THREE.MeshStandardMaterial({ color: 0xe53d3d, emissive: 0x2a0202 })
  );
  body.position.y = 0.75;
  enemyGroup.add(body);
  enemyGroup.position.copy(position);
  scene.add(enemyGroup);

  enemies.push({
    mesh: enemyGroup,
    speed: 3.5,
    damage: 12,
    maxHealth: 50,
    currentHealth: 50,
    attackCooldown: 0
  });
}

function spawnPickup(position) {
  const pickup = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.35, 0),
    new THREE.MeshStandardMaterial({ color: 0xe6d55f, emissive: 0x3a3300 })
  );
  pickup.position.copy(position);
  scene.add(pickup);
  pickups.push({ mesh: pickup, value: 15, bob: Math.random() * Math.PI * 2 });
}

function updateHud() {
  if (!scrapLabel || !healthLabel || !robotLabel || !infoLabel) return;
  scrapLabel.textContent = `Scrap: ${state.scrap}`;
  healthLabel.textContent = `Health: ${Math.max(0, Math.round(player.currentHealth))}/${player.maxHealth}`;
  robotLabel.textContent = `Robot: ${robotDefinitions[player.selectedRobot || 'starter'].displayName}`;
}

function renderRobotButtons() {
  robotButtonsEl.innerHTML = '';
  Object.entries(robotDefinitions).forEach(([id, def]) => {
    const button = document.createElement('button');
    const unlocked = state.unlockedRobots.includes(id);
    button.textContent = unlocked ? `${def.displayName} (Unlocked)` : `${def.displayName} - ${def.cost} scrap`;
    if (player.selectedRobot === id) button.classList.add('selected');
    button.addEventListener('click', () => {
      if (state.unlockedRobots.includes(id)) {
        player.selectedRobot = id;
        state.selectedRobot = id;
        saveProgress();
        applyRobotVisuals();
        renderRobotButtons();
        updateHud();
      } else if (state.scrap >= def.cost) {
        state.scrap -= def.cost;
        state.unlockedRobots.push(id);
        player.selectedRobot = id;
        state.selectedRobot = id;
        saveProgress();
        applyRobotVisuals();
        renderRobotButtons();
        updateHud();
        infoLabel.textContent = `${def.displayName} unlocked!`;
      } else {
        infoLabel.textContent = `Not enough scrap for ${def.displayName}.`;
      }
    });
    robotButtonsEl.appendChild(button);
  });
}

function renderColorButtons() {
  colorButtonsEl.innerHTML = '';
  const palette = ['#4db9ff', '#ff7b5e', '#7ef59d', '#f0e46a', '#d88cff', '#dfe7f6'];
  palette.forEach((hex) => {
    const button = document.createElement('button');
    button.classList.add('color-sample');
    button.style.background = hex;
    if (player.selectedColor.toLowerCase() === hex.toLowerCase()) {
      button.classList.add('selected');
    }
    button.addEventListener('click', () => {
      player.selectedColor = hex;
      state.selectedColor = hex;
      saveProgress();
      applyRobotVisuals();
      renderColorButtons();
      updateHud();
    });
    colorButtonsEl.appendChild(button);
  });
}

function renderWeaponButtons() {
  weaponButtonsEl.innerHTML = '';
  Object.entries(weaponDefinitions).forEach(([id, def]) => {
    const button = document.createElement('button');
    const unlocked = state.unlockedWeapons.includes(id);
    button.textContent = unlocked ? def.displayName : `${def.displayName} (Locked)`;
    if (player.selectedWeapon === id) button.classList.add('selected');
    if (!unlocked) {
      button.disabled = true;
      button.style.opacity = '0.5';
    }
    button.addEventListener('click', () => {
      if (unlocked) {
        player.selectedWeapon = id;
        state.selectedWeapon = id;
        saveProgress();
        renderWeaponButtons();
      }
    });
    weaponButtonsEl.appendChild(button);
  });
}

function setupWorld() {
  buildPlayer();
  for (let i = 0; i < 3; i++) {
    spawnEnemy(new THREE.Vector3(8 + i * 4, 0, -4 + i * 2));
  }
  spawnPickup(new THREE.Vector3(4, 1, 3));
  updateHud();
  renderRobotButtons();
  renderColorButtons();
  renderWeaponButtons();
}

function fireWeapon() {
  if (player.fireCooldown > 0) return;
  const weapon = weaponDefinitions[player.selectedWeapon] || weaponDefinitions.pulse_gun;
  player.fireCooldown = weapon.cooldown;

  const origin = player.mesh.position.clone().add(new THREE.Vector3(0, 1.35, 0));
  const direction = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), player.yaw);

  let hit = false;
  for (const enemy of enemies) {
    const toEnemy = enemy.mesh.position.clone().sub(origin);
    const dist = toEnemy.length();
    if (dist <= weapon.range) {
      const normToEnemy = toEnemy.clone().normalize();
      const dot = direction.dot(normToEnemy);
      if (dot > 0.2) {
        enemy.currentHealth -= weapon.damage;
        hit = true;
        if (enemy.currentHealth <= 0) {
          state.scrap += 25;
          scene.remove(enemy.mesh);
          const idx = enemies.indexOf(enemy);
          if (idx >= 0) enemies.splice(idx, 1);
        }
      }
    }
  }

  if (hit || player.selectedWeapon === 'pulse_gun') {
    saveProgress();
  }
  updateHud();
}

function meleeAttack() {
  if (player.meleeCooldown > 0) return;
  const weapon = weaponDefinitions[player.selectedWeapon] || weaponDefinitions.shock_saber;
  player.meleeCooldown = weapon.cooldown;

  let hit = false;
  for (const enemy of enemies) {
    const dist = enemy.mesh.position.distanceTo(player.mesh.position);
    if (dist <= weapon.range + 1.8) {
      enemy.currentHealth -= weapon.damage;
      hit = true;
      if (enemy.currentHealth <= 0) {
        state.scrap += 25;
        scene.remove(enemy.mesh);
        const idx = enemies.indexOf(enemy);
        if (idx >= 0) enemies.splice(idx, 1);
      }
    }
  }

  if (hit) saveProgress();
  updateHud();
}

const inputState = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  sprint: false,
  jump: false
};

function movePlayer(delta) {
  const move = new THREE.Vector3();
  if (inputState.forward) move.z -= 1;
  if (inputState.backward) move.z += 1;
  if (inputState.left) move.x -= 1;
  if (inputState.right) move.x += 1;

  if (move.lengthSq() > 0) {
    move.normalize();
    const yawMatrix = new THREE.Matrix4().makeRotationY(player.yaw);
    const worldMove = move.clone().applyMatrix4(yawMatrix);
    const speed = inputState.sprint ? player.sprintSpeed : player.speed;
    player.velocity.x = worldMove.x * speed;
    player.velocity.z = worldMove.z * speed;
  } else {
    player.velocity.x *= 0.82;
    player.velocity.z *= 0.82;
  }

  if (player.onGround && inputState.jump) {
    player.velocity.y = player.jumpVelocity;
    player.onGround = false;
  }

  if (!player.onGround) {
    player.velocity.y -= player.gravity * delta;
  } else {
    player.velocity.y = 0;
  }

  player.mesh.position.x += player.velocity.x * delta;
  player.mesh.position.z += player.velocity.z * delta;
  player.mesh.position.y += player.velocity.y * delta;

  if (player.mesh.position.y <= 0) {
    player.mesh.position.y = 0;
    player.onGround = true;
    player.velocity.y = 0;
  }

  player.mesh.rotation.y = player.yaw;

  const cameraOffset = new THREE.Vector3(0, 2.7, 7.5);
  const rotatedOffset = cameraOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), player.yaw);
  camera.position.copy(player.mesh.position).add(rotatedOffset);
  camera.lookAt(player.mesh.position.x, player.mesh.position.y + 1.3, player.mesh.position.z);
}

function updateEnemies(delta) {
  for (const enemy of enemies) {
    const direction = player.mesh.position.clone().sub(enemy.mesh.position);
    const distance = direction.length();
    if (distance > 0.01) {
      direction.normalize();
      enemy.mesh.position.addScaledVector(direction, enemy.speed * delta);
      enemy.mesh.lookAt(player.mesh.position.x, enemy.mesh.position.y + 1, player.mesh.position.z);
    }

    if (distance < 1.7) {
      player.currentHealth -= enemy.damage * delta;
      if (player.currentHealth <= 0) {
        player.currentHealth = player.maxHealth;
        player.mesh.position.set(0, 0, 0);
      }
    }
  }
  updateHud();
}

function updatePickups(delta) {
  for (const pickup of pickups) {
    pickup.mesh.position.y = 1 + Math.sin(performance.now() * 0.003 + pickup.bob) * 0.25;
    pickup.mesh.rotation.y += delta * 2;
    if (pickup.mesh.position.distanceTo(player.mesh.position) < 1.3) {
      state.scrap += pickup.value;
      scene.remove(pickup.mesh);
      const idx = pickups.indexOf(pickup);
      if (idx >= 0) pickups.splice(idx, 1);
      saveProgress();
      updateHud();
      infoLabel.textContent = 'Scrap collected!';
    }
  }
}

function maybeSpawnEnemy() {
  if (enemies.length >= 3) return;
  const x = (Math.random() - 0.5) * 20;
  const z = (Math.random() - 0.5) * 18;
  spawnEnemy(new THREE.Vector3(x, 0, z));
}

window.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  if (key === 'w') inputState.forward = true;
  if (key === 's') inputState.backward = true;
  if (key === 'a') inputState.left = true;
  if (key === 'd') inputState.right = true;
  if (event.key === 'Shift') inputState.sprint = true;
  if (event.code === 'Space') inputState.jump = true;
  if (event.key === '1') {
    player.selectedWeapon = 'pulse_gun';
    state.selectedWeapon = 'pulse_gun';
    saveProgress();
    renderWeaponButtons();
  }
  if (event.key === '2') {
    player.selectedWeapon = 'shock_saber';
    state.selectedWeapon = 'shock_saber';
    saveProgress();
    renderWeaponButtons();
  }
});

window.addEventListener('keyup', (event) => {
  const key = event.key.toLowerCase();
  if (key === 'w') inputState.forward = false;
  if (key === 's') inputState.backward = false;
  if (key === 'a') inputState.left = false;
  if (key === 'd') inputState.right = false;
  if (event.key === 'Shift') inputState.sprint = false;
  if (event.code === 'Space') inputState.jump = false;
});

window.addEventListener('mousemove', (event) => {
  if (!player.isMobile && document.pointerLockElement === canvas) {
    player.yaw -= event.movementX * 0.0035;
    player.pitch -= event.movementY * 0.0025;
    player.pitch = THREE.MathUtils.clamp(player.pitch, -1.2, 1.2);
  }
});

canvas.addEventListener('click', () => {
  if (!player.isMobile) canvas.requestPointerLock();
});

window.addEventListener('contextmenu', (event) => event.preventDefault());
window.addEventListener('pointerdown', (event) => {
  if (event.button === 0) fireWeapon();
  if (event.button === 2) meleeAttack();
});

if (fireButton) fireButton.addEventListener('click', fireWeapon);
if (meleeButton) meleeButton.addEventListener('click', meleeAttack);

function updateJoystick(event) {
  const rect = joystickArea.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const dx = event.clientX - centerX;
  const dy = event.clientY - centerY;
  const len = Math.min(34, Math.hypot(dx, dy));
  const angle = Math.atan2(dy, dx);
  const nx = Math.cos(angle) * len;
  const ny = Math.sin(angle) * len;
  joystickKnob.style.left = `${50 + nx}px`;
  joystickKnob.style.top = `${50 + ny}px`;

  inputState.forward = dy < -12;
  inputState.backward = dy > 12;
  inputState.left = dx < -12;
  inputState.right = dx > 12;
}

if (joystickArea && joystickKnob) {
  let pointerId = null;
  joystickArea.addEventListener('pointerdown', (event) => {
    pointerId = event.pointerId;
    joystickArea.setPointerCapture(pointerId);
    updateJoystick(event);
  });
  joystickArea.addEventListener('pointermove', (event) => {
    if (pointerId !== event.pointerId) return;
    updateJoystick(event);
  });
  joystickArea.addEventListener('pointerup', () => {
    pointerId = null;
    joystickKnob.style.left = '40px';
    joystickKnob.style.top = '40px';
    inputState.forward = false;
    inputState.backward = false;
    inputState.left = false;
    inputState.right = false;
  });
}

function resizeRenderer() {
  player.isMobile = window.innerWidth <= 768;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('resize', resizeRenderer);

setupWorld();

let previous = performance.now();
function animate(now) {
  const delta = Math.min((now - previous) / 1000, 0.033);
  previous = now;

  player.fireCooldown = Math.max(0, player.fireCooldown - delta);
  player.meleeCooldown = Math.max(0, player.meleeCooldown - delta);

  movePlayer(delta);
  updateEnemies(delta);
  updatePickups(delta);
  maybeSpawnEnemy();

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);

resizeRenderer();
