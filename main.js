import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const canvas = document.getElementById('gameCanvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f172a);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 2.5, 7);

const ambient = new THREE.HemisphereLight(0xbfe3ff, 0x12202d, 0.95);
scene.add(ambient);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(8, 12, 5);
scene.add(dirLight);

const floor = new THREE.Mesh(
  new THREE.BoxGeometry(30, 0.5, 30),
  new THREE.MeshStandardMaterial({ color: 0x1f2937 })
);
floor.position.set(0, -0.25, 0);
scene.add(floor);

const state = loadProgress();
const robotDefinitions = {
  starter: { displayName: 'Starter Bot', cost: 0, color: 0x4db9ff, speed: 5.8, maxHealth: 100 },
  scout: { displayName: 'Scout Bot', cost: 75, color: 0x7ef59d, speed: 7.2, maxHealth: 90 },
  brute: { displayName: 'Brute Bot', cost: 120, color: 0xff7b5e, speed: 4.9, maxHealth: 140 },
  vanguard: { displayName: 'Vanguard Bot', cost: 180, color: 0xd88cff, speed: 5.8, maxHealth: 125 }
};

const weaponDefinitions = {
  pulse_gun: { displayName: 'Pulse Gun', damage: 20, cooldown: 0.18, range: 20 },
  shock_saber: { displayName: 'Shock Saber', damage: 32, cooldown: 0.62, range: 3 }
};

const scrapLabel = document.getElementById('scrapLabel');
const healthLabel = document.getElementById('healthLabel');
const robotLabel = document.getElementById('robotLabel');
const infoLabel = document.getElementById('infoLabel');
const robotButtonsEl = document.getElementById('robotButtons');
const colorButtonsEl = document.getElementById('colorButtons');
const weaponButtonsEl = document.getElementById('weaponButtons');

const player = {
  mesh: null,
  velocity: new THREE.Vector3(),
  direction: new THREE.Vector3(),
  onGround: true,
  yaw: 0,
  pitch: -0.4,
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
  isMobile: window.innerWidth <= 768
};

const enemies = [];
const pickups = [];

function hexToColor(hex) {
  return new THREE.Color(hex);
}

function loadProgress() {
  const defaultState = {
    selectedRobot: 'starter',
    selectedColor: '#4db9ff',
    unlockedRobots: ['starter'],
    unlockedWeapons: ['pulse_gun', 'shock_saber'],
    scrap: 0,
    selectedWeapon: 'pulse_gun'
  };

  try {
    const raw = localStorage.getItem('robot-game-progress');
    if (!raw) return defaultState;
    return { ...defaultState, ...JSON.parse(raw) };
  } catch {
    return defaultState;
  }
}

function saveProgress() {
  const progress = {
    selectedRobot: state.selectedRobot,
    selectedColor: state.selectedColor,
    unlockedRobots: state.unlockedRobots,
    unlockedWeapons: state.unlockedWeapons,
    scrap: state.scrap,
    selectedWeapon: state.selectedWeapon
  };
  localStorage.setItem('robot-game-progress', JSON.stringify(progress));
}

function buildPlayer() {
  const root = new THREE.Group();
  scene.add(root);

  const bodyMat = new THREE.MeshStandardMaterial({ color: hexToColor(player.selectedColor), metalness: 0.7, roughness: 0.3 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1.8, 0.8), bodyMat);
  body.position.y = 0.9;
  root.add(body);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.8), bodyMat.clone());
  head.position.y = 1.8;
  root.add(head);

  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 1.1), bodyMat.clone());
  gun.position.set(0.45, 1.35, -0.2);
  root.add(gun);

  root.position.set(0, 0, 0);
  player.mesh = root;
  applyRobotStats();
}

function applyRobotStats() {
  const def = robotDefinitions[player.selectedRobot] || robotDefinitions.starter;
  player.speed = def.speed;
  player.sprintSpeed = def.speed + 2.2;
  player.maxHealth = def.maxHealth;
  player.currentHealth = def.maxHealth;
  player.jumpVelocity = 6;

  if (player.mesh) {
    const color = hexToColor(player.selectedColor);
    player.mesh.children.forEach((part) => {
      if (part.material) part.material.color = color;
    });
  }
}

function spawnEnemy(position) {
  const enemy = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1.5, 1),
    new THREE.MeshStandardMaterial({ color: 0xe53d3d, emissive: 0x2a0202 })
  );
  body.position.y = 0.75;
  enemy.add(body);

  enemy.position.copy(position);
  scene.add(enemy);

  enemies.push({
    mesh: enemy,
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

function setupWorld() {
  buildPlayer();

  for (let i = 0; i < 3; i++) {
    spawnEnemy(new THREE.Vector3(8 + i * 4, 0, -4 + i * 2));
  }

  spawnPickup(new THREE.Vector3(4, 1, 3));
  updateHud();
}

function updateHud() {
  scrapLabel.textContent = `Scrap: ${state.scrap}`;
  healthLabel.textContent = `Health: ${Math.max(0, Math.round(player.currentHealth))}/${player.maxHealth}`;
  robotLabel.textContent = `Robot: ${robotDefinitions[player.selectedRobot].displayName}`;
  infoLabel.textContent = `Collect scrap. Unlock new robots and weapons.`;
}

function renderRobotButtons() {
  robotButtonsEl.innerHTML = '';
  Object.entries(robotDefinitions).forEach(([id, def]) => {
    const button = document.createElement('button');
    const isUnlocked = state.unlockedRobots.includes(id);
    button.textContent = isUnlocked ? `${def.displayName} (Unlocked)` : `${def.displayName} - ${def.cost} scrap`;
    if (player.selectedRobot === id) button.classList.add('selected');
    button.addEventListener('click', () => selectRobot(id));
    robotButtonsEl.appendChild(button);
  });
}

function renderColorButtons() {
  colorButtonsEl.innerHTML = '';
  const palette = ['#4db9ff', '#ff7b5e', '#7ef59d', '#f0e46a', '#d88cff', '#dfe7f6'];

  palette.forEach((colorHex) => {
    const button = document.createElement('button');
    button.classList.add('color-sample');
    button.style.background = colorHex;
    if (player.selectedColor.toLowerCase() === colorHex.toLowerCase()) button.classList.add('selected');
    button.addEventListener('click', () => {
      player.selectedColor = colorHex;
      saveProgress();
      applyRobotStats();
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

function selectRobot(id) {
  const def = robotDefinitions[id];

  if (state.unlockedRobots.includes(id)) {
    player.selectedRobot = id;
    state.selectedRobot = id;
    saveProgress();
    applyRobotStats();
    renderRobotButtons();
    updateHud();
    return;
  }

  if (state.scrap >= def.cost) {
    state.scrap -= def.cost;
    state.unlockedRobots.push(id);
    player.selectedRobot = id;
    state.selectedRobot = id;
    saveProgress();
    applyRobotStats();
    renderRobotButtons();
    renderColorButtons();
    updateHud();
    infoLabel.textContent = `${def.displayName} unlocked!`;
  } else {
    infoLabel.textContent = `Not enough scrap for ${def.displayName}.`;
  }
}

function handleMovement(delta) {
  const move = new THREE.Vector3();
  const keyState = inputState;

  if (keyState.forward) move.z -= 1;
  if (keyState.backward) move.z += 1;
  if (keyState.left) move.x -= 1;
  if (keyState.right) move.x += 1;

  if (move.lengthSq() > 0) {
    move.normalize();
    const yawMatrix = new THREE.Matrix4().makeRotationY(player.yaw);
    const worldMove = move.clone().applyMatrix4(yawMatrix);
    const desiredSpeed = keyState.sprint ? player.sprintSpeed : player.speed;

    player.velocity.x = worldMove.x * desiredSpeed;
    player.velocity.z = worldMove.z * desiredSpeed;
  } else {
    player.velocity.x *= 0.8;
    player.velocity.z *= 0.8;
  }

  if (!player.onGround && player.mesh.position.y > 0.1) {
    player.velocity.y -= player.gravity * delta;
  } else {
    player.velocity.y = 0;
    player.onGround = true;
  }

  if (keyState.jump && player.onGround) {
    player.velocity.y = player.jumpVelocity;
    player.onGround = false;
  }

  player.mesh.position.addScaledVector(player.velocity, delta);
  player.mesh.position.y = Math.max(0, player.mesh.position.y);
  player.mesh.rotation.y = player.yaw;
  camera.position.x = player.mesh.position.x;
  camera.position.z = player.mesh.position.z + 7;
  camera.position.y = player.mesh.position.y + 2.6;
  camera.lookAt(player.mesh.position.x, player.mesh.position.y + 1.3, player.mesh.position.z);
}

function performFire() {
  if (player.fireCooldown > 0) return;
  const weapon = weaponDefinitions[player.selectedWeapon];
  player.fireCooldown = weapon.cooldown;

  const origin = player.mesh.position.clone().add(new THREE.Vector3(0, 1.35, 0));
  const direction = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), player.yaw);
  const end = origin.clone().add(direction.clone().multiplyScalar(weapon.range));

  for (const enemy of enemies) {
    const dist = enemy.mesh.position.distanceTo(origin);
    const toEnemy = enemy.mesh.position.clone().sub(origin);
    const dot = toEnemy.normalize().dot(direction);
    if (dist <= weapon.range && dot > 0.2) {
      enemy.currentHealth -= weapon.damage;
      if (enemy.currentHealth <= 0) {
        state.scrap += 25;
        enemy.mesh.parent.remove(enemy.mesh);
        const index = enemies.indexOf(enemy);
        if (index >= 0) enemies.splice(index, 1);
      }
    }
  }

  saveProgress();
  updateHud();
}

function performMelee() {
  if (player.meleeCooldown > 0) return;
  const weapon = weaponDefinitions[player.selectedWeapon];
  player.meleeCooldown = weapon.cooldown;

  for (const enemy of enemies) {
    const dist = enemy.mesh.position.distanceTo(player.mesh.position);
    if (dist <= weapon.range + 1.8) {
      enemy.currentHealth -= weapon.damage;
      if (enemy.currentHealth <= 0) {
        state.scrap += 25;
        enemy.mesh.parent.remove(enemy.mesh);
        const index = enemies.indexOf(enemy);
        if (index >= 0) enemies.splice(index, 1);
      }
    }
  }

  saveProgress();
  updateHud();
}

function updateEnemies(delta) {
  for (const enemy of enemies) {
    const dir = player.mesh.position.clone().sub(enemy.mesh.position);
    const distance = dir.length();
    if (distance > 0.01) {
      dir.normalize();
      enemy.mesh.position.addScaledVector(dir, enemy.speed * delta);
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
      const index = pickups.indexOf(pickup);
      if (index >= 0) pickups.splice(index, 1);
      saveProgress();
      updateHud();
      infoLabel.textContent = 'Scrap collected!';
    }
  }
}

const inputState = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  sprint: false,
  jump: false
};

window.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() === 'w') inputState.forward = true;
  if (event.key.toLowerCase() === 's') inputState.backward = true;
  if (event.key.toLowerCase() === 'a') inputState.left = true;
  if (event.key.toLowerCase() === 'd') inputState.right = true;
  if (event.key === 'Shift') inputState.sprint = true;
  if (event.code === 'Space') inputState.jump = true;
  if (event.key === '1') player.selectedWeapon = 'pulse_gun';
  if (event.key === '2') player.selectedWeapon = 'shock_saber';
  state.selectedWeapon = player.selectedWeapon;
  saveProgress();
  renderWeaponButtons();
});

window.addEventListener('keyup', (event) => {
  if (event.key.toLowerCase() === 'w') inputState.forward = false;
  if (event.key.toLowerCase() === 's') inputState.backward = false;
  if (event.key.toLowerCase() === 'a') inputState.left = false;
  if (event.key.toLowerCase() === 'd') inputState.right = false;
  if (event.key === 'Shift') inputState.sprint = false;
  if (event.code === 'Space') inputState.jump = false;
});

window.addEventListener('pointerdown', (event) => {
  if (event.button === 0) performFire();
  if (event.button === 2) performMelee();
});

window.addEventListener('contextmenu', (event) => event.preventDefault());

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

const fireButton = document.getElementById('fireButton');
const meleeButton = document.getElementById('meleeButton');
fireButton.addEventListener('click', performFire);
meleeButton.addEventListener('click', performMelee);

const joystickArea = document.getElementById('joystickArea');
const joystickKnob = document.getElementById('joystickKnob');
let joystickPointerId = null;
let joystickVector = new THREE.Vector2();

joystickArea.addEventListener('pointerdown', (event) => {
  joystickPointerId = event.pointerId;
  joystickArea.setPointerCapture(event.pointerId);
  updateJoystick(event);
});

joystickArea.addEventListener('pointermove', (event) => {
  if (joystickPointerId !== event.pointerId) return;
  updateJoystick(event);
});

joystickArea.addEventListener('pointerup', () => {
  joystickPointerId = null;
  joystickVector.set(0, 0);
  joystickKnob.style.transform = 'translate(-50%, -50%)';
  inputState.forward = false;
  inputState.backward = false;
  inputState.left = false;
  inputState.right = false;
});

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

  joystickVector.set(dx / 42, dy / 42);
  inputState.forward = joystickVector.y < -0.2;
  inputState.backward = joystickVector.y > 0.2;
  inputState.left = joystickVector.x < -0.2;
  inputState.right = joystickVector.x > 0.2;
}

function resizeRenderer() {
  player.isMobile = window.innerWidth <= 768;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('resize', resizeRenderer);

setupWorld();
renderRobotButtons();
renderColorButtons();
renderWeaponButtons();

let lastTime = performance.now();
function animate(now) {
  const delta = Math.min((now - lastTime) / 1000, 0.033);
  lastTime = now;

  player.fireCooldown = Math.max(0, player.fireCooldown - delta);
  player.meleeCooldown = Math.max(0, player.meleeCooldown - delta);

  handleMovement(delta);
  updateEnemies(delta);
  updatePickups(delta);

  if (enemies.length < 3) {
    spawnEnemy(new THREE.Vector3(
      (Math.random() - 0.5) * 20,
      0,
      (Math.random() - 0.5) * 18
    ));
  }

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);
