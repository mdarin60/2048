// 3D actuator: renders the 4x4x4 2048 cube with Three.js.
// Drag to orbit the cube, scroll to zoom in and look inside. Score / messages are
// delegated to the original HTMLActuator so the rest of the page keeps working.
function ThreeActuator() {
  this.html = new HTMLActuator();
  this.size = 4;
  this.tileSize = 1;
  this.gap = 0.18;
  this.tiles = {};        // "x,y,z" -> { mesh, value, target }
  this.textures = {};     // value -> CanvasTexture
  this.colors = {
    2: "#eee4da", 4: "#ede0c8", 8: "#f2b179", 16: "#f59563", 32: "#f67c5f",
    64: "#f65e3b", 128: "#edcf72", 256: "#edcc61", 512: "#edc850",
    1024: "#edc53f", 2048: "#edc22e"
  };
  this.view = { xray: false, explode: false, layer: null, labels: true }; // layer: null = all, 0..3 = focus one
  window.__actuator = this;
  this.setupScene();
  this.setupViewControls();
  this.animate();
}

ThreeActuator.prototype.setupScene = function () {
  var container = document.querySelector(".game-container");
  var width = container.clientWidth, height = container.clientHeight;

  this.scene = new THREE.Scene();
  this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
  this.camera.position.set(6, 6.5, 9.5);

  this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  this.renderer.setPixelRatio(window.devicePixelRatio || 1);
  this.renderer.setSize(width, height);
  this.renderer.domElement.className = "three-canvas";
  container.insertBefore(this.renderer.domElement, container.firstChild);

  this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
  this.controls.enableDamping = true;
  this.controls.dampingFactor = 0.08;
  this.controls.minDistance = 0.3;   // allow zooming inside the cube
  this.controls.maxDistance = 25;
  this.controls.target.set(0, 0, 0);

  this.scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  var key = new THREE.DirectionalLight(0xffffff, 0.7);
  key.position.set(5, 10, 7);
  this.scene.add(key);
  var fill = new THREE.DirectionalLight(0xffffff, 0.35);
  fill.position.set(-5, -4, -6);
  this.scene.add(fill);

  var span = this.size * this.tileSize + (this.size + 1) * this.gap;
  var half = span / 2;

  // Base board under the cube
  var board = new THREE.Mesh(
    new THREE.BoxGeometry(span, 0.3, span),
    new THREE.MeshStandardMaterial({ color: 0xbbada0, roughness: 0.8 })
  );
  board.position.y = -half - 0.15;
  this.scene.add(board);

  // Floor slots for the bottom layer
  var cellGeo = new THREE.BoxGeometry(this.tileSize, 0.05, this.tileSize);
  var cellMat = new THREE.MeshStandardMaterial({ color: 0xcdc1b4, roughness: 0.9 });
  for (var x = 0; x < this.size; x++) {
    for (var y = 0; y < this.size; y++) {
      var cell = new THREE.Mesh(cellGeo, cellMat);
      var p = this.cellPosition(x, y, 0);
      cell.position.set(p.x, -half + 0.03, p.z);
      this.scene.add(cell);
    }
  }

  // Faint wireframe for every cell so the empty layers are readable
  var slotEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(this.tileSize, this.tileSize, this.tileSize));
  var slotMat = new THREE.LineBasicMaterial({ color: 0x8f7a66, transparent: true, opacity: 0.12 });
  this.layerGroups = [];
  for (var sz = 0; sz < this.size; sz++) {
    var group = new THREE.Group();
    for (var sx = 0; sx < this.size; sx++)
      for (var sy = 0; sy < this.size; sy++) {
        var ln = new THREE.LineSegments(slotEdges, slotMat);
        var sp = this.cellPosition(sx, sy, sz);
        ln.position.set(sp.x, 0, sp.z);
        group.add(ln);
      }
    this.scene.add(group);
    this.layerGroups.push(group);
  }

  // Glass enclosure you can look into
  var glass = new THREE.Mesh(
    new THREE.BoxGeometry(span, span, span),
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff, transparent: true, opacity: 0.1, roughness: 0.05,
      metalness: 0, side: THREE.DoubleSide, depthWrite: false
    })
  );
  this.scene.add(glass);
  var edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(glass.geometry),
    new THREE.LineBasicMaterial({ color: 0x8f7a66, transparent: true, opacity: 0.7 })
  );
  this.scene.add(edges);
  this.glass = glass;
  this.glassEdges = edges;
  this.board = board;

  this.addOrientationMarkers(half);

  this.tileGeo = new THREE.BoxGeometry(this.tileSize, this.tileSize, this.tileSize);

  var self = this;
  window.addEventListener("resize", function () {
    var w = container.clientWidth, h = container.clientHeight;
    self.camera.aspect = w / h;
    self.camera.updateProjectionMatrix();
    self.renderer.setSize(w, h);
  });
};

// Grid (x, y, z): x = left/right, y = back/forward (depth), z = layer (height)
ThreeActuator.prototype.layerY = function (z) {
  var step = this.tileSize + this.gap;
  var spread = this.view && this.view.explode ? 2.3 : 1;
  return (z - (this.size - 1) / 2) * step * spread;
};

ThreeActuator.prototype.cellPosition = function (x, y, z) {
  var step = this.tileSize + this.gap;
  var offset = ((this.size - 1) * step) / 2;
  return { x: x * step - offset, y: this.layerY(z), z: y * step - offset };
};

// Always-facing-the-camera text label
ThreeActuator.prototype.makeLabel = function (text, color, scale) {
  var canvas = document.createElement("canvas");
  canvas.width = 512; canvas.height = 128;
  var ctx = canvas.getContext("2d");
  ctx.font = "bold 64px 'Clear Sans', Helvetica, Arial, sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.lineWidth = 10; ctx.strokeStyle = "rgba(250,248,239,0.9)";
  ctx.strokeText(text, 256, 64);
  ctx.fillStyle = color; ctx.fillText(text, 256, 64);
  var tex = new THREE.CanvasTexture(canvas);
  var sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sprite.scale.set(2.4 * (scale || 1), 0.6 * (scale || 1), 1);
  sprite.renderOrder = 10;
  return sprite;
};

// Arrows + labels around the cube so you always know which key moves which way.
ThreeActuator.prototype.addOrientationMarkers = function (half) {
  var self = this;
  var out = half + 0.9;
  this.markerGroup = new THREE.Group();
  this.scene.add(this.markerGroup);
  var markers = [
    { dir: [ 1, 0, 0], color: 0xf67c5f, text: "RIGHT  \u2192 key" },
    { dir: [-1, 0, 0], color: 0xf67c5f, text: "\u2190 key  LEFT" },
    { dir: [ 0, 0,-1], color: 0x8f7a66, text: "BACK  \u2191 key" },
    { dir: [ 0, 0, 1], color: 0x8f7a66, text: "FRONT  \u2193 key" },
    { dir: [ 0, 1, 0], color: 0x5b9bd5, text: "UP  Q" },
    { dir: [ 0,-1, 0], color: 0x5b9bd5, text: "DOWN  E" }
  ];
  markers.forEach(function (m) {
    var d = new THREE.Vector3(m.dir[0], m.dir[1], m.dir[2]);
    var arrow = new THREE.ArrowHelper(d, d.clone().multiplyScalar(half + 0.1), 0.8, m.color, 0.3, 0.2);
    self.markerGroup.add(arrow);
    var label = self.makeLabel(m.text, "#" + m.color.toString(16).padStart(6, "0"));
    label.position.copy(d.clone().multiplyScalar(out + 0.5));
    if (m.dir[1] === 0) label.position.y = -half + 0.2; // side labels hug the base edge
    if (m.dir[1] === -1) label.position.y = -half - 1.6; // keep DOWN clear of the board
    self.markerGroup.add(label);
  });
};

ThreeActuator.prototype.setupViewControls = function () {
  var self = this;
  var bar = document.querySelector(".view-controls");
  if (!bar) return;
  function sync() {
    bar.querySelectorAll("[data-view]").forEach(function (btn) {
      var v = btn.getAttribute("data-view"), on = false;
      if (v === "xray") on = self.view.xray;
      else if (v === "explode") on = self.view.explode;
      else if (v === "labels") on = self.view.labels;
      else if (v === "all") on = self.view.layer === null;
      else on = self.view.layer === parseInt(v, 10);
      btn.classList.toggle("active", on);
    });
  }
  this.applyView = function (v) {
    if (v === "xray") self.view.xray = !self.view.xray;
    else if (v === "labels") self.view.labels = !self.view.labels;
    else if (v === "explode") {
      self.view.explode = !self.view.explode;
      self.camera.position.multiplyScalar(self.view.explode ? 1.4 : 1 / 1.4); // keep all layers in frame
    }
    else if (v === "all") self.view.layer = null;
    else {
      var n = parseInt(v, 10);
      self.view.layer = self.view.layer === n ? null : n;
    }
    sync();
  };
  bar.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-view]");
    if (btn) self.applyView(btn.getAttribute("data-view"));
  });
  document.addEventListener("keydown", function (e) {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.which === 88) self.applyView("xray");        // X
    else if (e.which === 71) self.applyView("labels");  // G  hide/show direction markers
    else if (e.which === 70) self.applyView("explode"); // F
    else if (e.which === 48) self.applyView("all");     // 0
    else if (e.which >= 49 && e.which <= 52) self.applyView(String(e.which - 49)); // 1-4
  });
  sync();
};

ThreeActuator.prototype.textureFor = function (value) {
  if (this.textures[value]) return this.textures[value];
  var canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  var ctx = canvas.getContext("2d");
  ctx.fillStyle = this.colors[value] || "#3c3a32";
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = value <= 4 ? "#776e65" : "#f9f6f2";
  var fontSize = value < 100 ? 140 : value < 1000 ? 110 : 84;
  ctx.font = "bold " + fontSize + "px 'Clear Sans', Helvetica, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(value), 128, 136);
  var tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  this.textures[value] = tex;
  return tex;
};

ThreeActuator.prototype.materialFor = function (value) {
  return new THREE.MeshStandardMaterial({
    map: this.textureFor(value), roughness: 0.6, metalness: 0.05,
    transparent: true, opacity: 1
  });
};

ThreeActuator.prototype.keyOf = function (p) {
  return p.x + "," + p.y + "," + p.z;
};

ThreeActuator.prototype.actuate = function (grid, metadata) {
  var self = this;

  this.html.updateScore(metadata.score);
  this.html.updateBestScore(metadata.bestScore);
  if (metadata.terminated) {
    if (metadata.over) this.html.message(false);
    else if (metadata.won) this.html.message(true);
  }

  // Build the new tile map from the old one without mutating the old one
  // mid-walk, so tiles sliding through each other's cells never collide.
  var old = this.tiles;
  var next = {};

  // Any merge leftovers from the previous move are gone now, animation or not.
  this.dying.forEach(function (d) { self.removeEntry(d); });
  this.dying = [];

  grid.eachCell(function (x, y, z, cell) {
    if (!cell) return;
    var key = self.keyOf(cell);

    if (cell.mergedFrom) {
      // Sources slide into the target, then vanish as the merged block pops in.
      cell.mergedFrom.forEach(function (m) {
        var src = m.previousPosition ? old[self.keyOf(m.previousPosition)] : null;
        if (src) {
          delete old[self.keyOf(m.previousPosition)];
          src.cell = { x: cell.x, y: cell.y, z: cell.z };
          src.dieAt = performance.now() + 110;
          self.dying.push(src);
        }
      });
      var merged = self.spawn(cell.value, cell.x, cell.y, cell.z, next);
      merged.scale.set(0.01, 0.01, 0.01);
      merged.userData.pop = 1.25;
      merged.userData.delay = performance.now() + 100;
    } else if (cell.previousPosition) {
      var fromKey = self.keyOf(cell.previousPosition);
      var entry = old[fromKey];
      if (entry && entry.value === cell.value) {
        delete old[fromKey];
        entry.cell = { x: cell.x, y: cell.y, z: cell.z };
        next[key] = entry;
      } else {
        self.spawn(cell.value, cell.x, cell.y, cell.z, next);
      }
    } else {
      var fresh = self.spawn(cell.value, cell.x, cell.y, cell.z, next);
      fresh.scale.set(0.01, 0.01, 0.01);
      fresh.userData.pop = 1.0;
    }
  });

  // Anything left in the old map no longer exists on the board.
  Object.keys(old).forEach(function (k) { self.removeEntry(old[k]); });
  this.tiles = next;
};

ThreeActuator.prototype.dying = [];

ThreeActuator.prototype.spawn = function (value, x, y, z, map) {
  var mesh = new THREE.Mesh(this.tileGeo, this.materialFor(value));
  var p = this.cellPosition(x, y, z);
  mesh.position.set(p.x, p.y, p.z);
  mesh.userData.pop = 0;
  this.scene.add(mesh);
  map[x + "," + y + "," + z] = { mesh: mesh, value: value, cell: { x: x, y: y, z: z } };
  return mesh;
};

ThreeActuator.prototype.removeEntry = function (entry) {
  if (!entry) return;
  this.scene.remove(entry.mesh);
  entry.mesh.material.dispose();
};

ThreeActuator.prototype.continueGame = function () {
  this.html.continueGame();
};

ThreeActuator.prototype.stepEntry = function (e) {
  var m = e.mesh, t = this.cellPosition(e.cell.x, e.cell.y, e.cell.z);
  m.position.x += (t.x - m.position.x) * 0.3;
  m.position.y += (t.y - m.position.y) * 0.3;
  m.position.z += (t.z - m.position.z) * 0.3;

  // X-ray / layer focus: fade tiles so the inside of a full cube stays visible.
  var target = this.view.xray ? 0.45 : 1;
  if (this.view.layer !== null && e.cell.z !== this.view.layer) target = 0.08;
  var mat = m.material;
  mat.opacity += (target - mat.opacity) * 0.2;
  mat.depthWrite = mat.opacity > 0.9;
};

ThreeActuator.prototype.animate = function () {
  var self = this;
  var now = performance.now();
  window.requestAnimationFrame(function () { self.animate(); });

  Object.keys(this.tiles).forEach(function (key) {
    var e = self.tiles[key], m = e.mesh;
    self.stepEntry(e);
    if (m.userData.delay && now < m.userData.delay) return; // hold until sources arrive
    var goal = m.userData.pop > 1 ? m.userData.pop : 1;
    if (m.userData.pop > 1 && m.scale.x > m.userData.pop - 0.05) m.userData.pop = 1;
    var s = m.scale.x + (goal - m.scale.x) * 0.25;
    m.scale.set(s, s, s);
  });

  for (var i = this.dying.length - 1; i >= 0; i--) {
    var d = this.dying[i];
    this.stepEntry(d);
    if (now >= d.dieAt) {
      this.removeEntry(d);
      this.dying.splice(i, 1);
    }
  }

  for (var z = 0; z < this.size; z++) {
    var g = this.layerGroups[z], gy = this.layerY(z);
    g.position.y += (gy - g.position.y) * 0.3;
    g.visible = this.view.layer === null || this.view.layer === z;
  }
  this.glass.visible = this.glassEdges.visible = !this.view.explode;
  this.markerGroup.visible = this.view.labels;
  var boardY = this.layerY(0) - this.tileSize / 2 - 0.15;
  this.board.position.y += (boardY - this.board.position.y) * 0.3;

  this.controls.update();
  this.renderer.render(this.scene, this.camera);
};
