import * as THREE from 'three';
// Original SpaceMind flight scene, with bounded rendering and lifecycle controls.
  (() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let prefs = {scene:'universe',motion:true,speed:.5,brightness:.7,quality:'auto'};
    let raf = null, last = 0, elapsed = 0, contextLost = false;
    const mobile = innerWidth < 700;
    const light = () => prefs.quality === 'low' || (prefs.quality === 'auto' && innerWidth < 700);
    // --- THREE.JS SCENE SETUP ---
    const canvas = document.getElementById('universe');
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x010105, 0.0035);
 
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 0);
 
    let renderer;
    try { renderer = new THREE.WebGLRenderer({canvas, antialias: !mobile, alpha:false, powerPreference:'low-power'}); }
    catch { canvas.style.background = '#010105'; window.SpaceUniverse = {configure(){}}; return; }
    renderer.setClearColor(0x010105);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
 
    // Lighting
    const ambientLight = new THREE.AmbientLight(0x222233, 0.7);
    scene.add(ambientLight);
 
    const sunLight = new THREE.DirectionalLight(0xfff5ea, 2.5);
    sunLight.position.set(50, 40, -30);
    scene.add(sunLight);
 
    const fillLight = new THREE.DirectionalLight(0x0088ff, 0.8);
    fillLight.position.set(-40, -20, 20);
    scene.add(fillLight);
 
    // --- PROCEDURAL CANVAS TEXTURE GENERATORS ---
    
    // 1. Organic Rock Texture (Asteroid Surface)
    function generateRockTexture() {
      const cv = document.createElement('canvas');
      cv.width = 512; cv.height = 512;
      const ctx = cv.getContext('2d');
 
      ctx.fillStyle = '#38383e';
      ctx.fillRect(0, 0, 512, 512);
 
      // Noise
      const imgData = ctx.getImageData(0, 0, 512, 512);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        const n = (Math.random() - 0.5) * 50;
        d[i] = Math.min(255, Math.max(0, d[i] + n));
        d[i+1] = Math.min(255, Math.max(0, d[i+1] + n));
        d[i+2] = Math.min(255, Math.max(0, d[i+2] + n));
      }
      ctx.putImageData(imgData, 0, 0);
 
      // Craters
      for (let i = 0; i < 40; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        const r = 4 + Math.random() * 25;
        const grad = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
        grad.addColorStop(0, '#151518');
        grad.addColorStop(0.7, '#484852');
        grad.addColorStop(1, '#38383e');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
 
      const tex = new THREE.CanvasTexture(cv);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      return tex;
    }
 
    // 2. Gas Giant Planet Surface Texture
    function generateGasGiantTexture() {
      const cv = document.createElement('canvas');
      cv.width = 1024; cv.height = 512;
      const ctx = cv.getContext('2d');
 
      const grad = ctx.createLinearGradient(0, 0, 0, 512);
      grad.addColorStop(0.0, '#0c1a2b');
      grad.addColorStop(0.2, '#1e385c');
      grad.addColorStop(0.4, '#3b5e8c');
      grad.addColorStop(0.6, '#244168');
      grad.addColorStop(0.8, '#4a6d9c');
      grad.addColorStop(1.0, '#122238');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1024, 512);
 
      // Cloud Band Ribbons
      for (let y = 0; y < 512; y += 2) {
        const wave = Math.sin(y * 0.03) * 20;
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.08})`;
        ctx.fillRect(0, y + wave, 1024, 2);
      }
 
      // Great Vortex Oval
      ctx.fillStyle = 'rgba(120, 190, 255, 0.3)';
      ctx.beginPath();
      ctx.ellipse(350, 260, 90, 45, 0.1, 0, Math.PI * 2);
      ctx.fill();
 
      return new THREE.CanvasTexture(cv);
    }
 
    const rockTex = generateRockTexture();
    const planetTex = generateGasGiantTexture();
 
    // --- REALISTIC SMOOTH ASTEROID CREATION ---
    function createSmoothAsteroid(radius = 1.5) {
      // High detail icosahedron to avoid sharp crystal faces
      const geometry = new THREE.IcosahedronGeometry(radius, mobile ? 1 : 2);
      const posAttr = geometry.attributes.position;
 
      // Multi-octave trigonometric noise for smooth craters & organic deform
      for (let i = 0; i < posAttr.count; i++) {
        const x = posAttr.getX(i);
        const y = posAttr.getY(i);
        const z = posAttr.getZ(i);
 
        const n1 = Math.sin(x * 1.2) * Math.cos(y * 1.2) * Math.sin(z * 1.2) * 0.3;
        const n2 = (Math.sin(x * 3.5) + Math.cos(y * 3.5) + Math.sin(z * 3.5)) * 0.08;
        const factor = 1 + n1 + n2;
 
        posAttr.setXYZ(i, x * factor, y * factor, z * factor);
      }
 
      geometry.computeVertexNormals();
 
      const material = new THREE.MeshStandardMaterial({
        map: rockTex,
        bumpMap: rockTex,
        bumpScale: 0.25,
        roughness: 0.9,
        metalness: 0.1,
        flatShading: false // Smooth organic look, no sharp crystals!
      });
 
      return new THREE.Mesh(geometry, material);
    }
 
    // Object pool for endless asteroid streaming
    const ASTEROID_COUNT = mobile ? 12 : 24;
    const asteroids = [];
 
    for (let i = 0; i < ASTEROID_COUNT; i++) {
      const scale = 1.0 + Math.random() * 2.5;
      const mesh = createSmoothAsteroid(scale);
      
      // Spawn spread in front of camera (-Z)
      mesh.position.set(
        (Math.random() - 0.5) * 80,
        (Math.random() - 0.5) * 50,
        -50 - Math.random() * 300
      );
 
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      
      const rotSpeed = [
        (Math.random() - 0.5) * 0.015,
        (Math.random() - 0.5) * 0.015,
        (Math.random() - 0.5) * 0.015
      ];
 
      scene.add(mesh);
      asteroids.push({ mesh, rotSpeed, radius: scale });
    }
 
    // --- 3D METALLIC UFO SPACECRAFT ---
    function buildUFO() {
      const ufoGroup = new THREE.Group();
 
      // Shiny metallic saucer body
      const bodyGeo = new THREE.CylinderGeometry(3.5, 1.2, 0.8, 32);
      const metalMat = new THREE.MeshStandardMaterial({
        color: 0x99aacc,
        metalness: 0.95,
        roughness: 0.15
      });
      const bodyMesh = new THREE.Mesh(bodyGeo, metalMat);
      ufoGroup.add(bodyMesh);
 
      // Glass Cockpit Dome
      const domeGeo = new THREE.SphereGeometry(1.6, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
      const domeMat = new THREE.MeshPhysicalMaterial({
        color: 0x00f0ff,
        transmission: 0.8,
        opacity: 0.9,
        transparent: true,
        roughness: 0.1
      });
      const domeMesh = new THREE.Mesh(domeGeo, domeMat);
      domeMesh.position.y = 0.35;
      ufoGroup.add(domeMesh);
 
      // Glowing Neon Energy Ring
      const ringGeo = new THREE.TorusGeometry(3.6, 0.12, 16, 32);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = Math.PI / 2;
      ufoGroup.add(ringMesh);
 
      // Bottom Thruster Glow Point
      const lightGeo = new THREE.CylinderGeometry(0.8, 1.2, 0.2, 16);
      const lightMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
      const lightMesh = new THREE.Mesh(lightGeo, lightMat);
      lightMesh.position.y = -0.45;
      ufoGroup.add(lightMesh);
 
      ufoGroup.scale.set(0.7, 0.7, 0.7);
      ufoGroup.position.set(200, 200, 200); // Initial off-screen hiding position
      scene.add(ufoGroup);
 
      return {
        group: ufoGroup,
        active: false,
        time: 0,
        startX: 0, startY: 0, startZ: -180,
        targetX: 0, targetY: 0,
        speed: 0.8
      };
    }
 
    const ufoData = buildUFO();
 
    // Trigger UFO Encounters Periodically
    function triggerUFOEncounter() {
      if (ufoData.active) return;
      ufoData.active = true;
      ufoData.time = 0;
      ufoData.startX = (Math.random() - 0.5) * 60;
      ufoData.startY = (Math.random() - 0.5) * 30;
      ufoData.startZ = -220;
 
      ufoData.group.position.set(ufoData.startX, ufoData.startY, ufoData.startZ);
    }
 
    // --- BACKGROUND DEEP SPACE OBJECTS ---
    const planetGroup = new THREE.Group();
    planetGroup.position.set(45, -15, -280);
    scene.add(planetGroup);
 
    // Planet
    const planetGeo = new THREE.SphereGeometry(16, 40, 24);
    const planetMat = new THREE.MeshStandardMaterial({ map: planetTex, roughness: 0.8 });
    const planetMesh = new THREE.Mesh(planetGeo, planetMat);
    planetGroup.add(planetMesh);
 
    // Planet Rings
    const ringGeo = new THREE.RingGeometry(22, 34, 64);
    ringGeo.rotateX(Math.PI / 2.2);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x88aabb,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.6
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    planetGroup.add(ringMesh);
 
    // --- CONTINUOUS STARFIELD & DUST ---
    const STAR_COUNT = 3000;
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(STAR_COUNT * 3);
    const starCol = new Float32Array(STAR_COUNT * 3);
 
    for (let i = 0; i < STAR_COUNT; i++) {
      starPos[i * 3]     = (Math.random() - 0.5) * 350;
      starPos[i * 3 + 1] = (Math.random() - 0.5) * 350;
      starPos[i * 3 + 2] = -Math.random() * 400;
 
      const shade = 0.7 + Math.random() * 0.3;
      starCol[i * 3]     = shade;
      starCol[i * 3 + 1] = shade + 0.1;
      starCol[i * 3 + 2] = 1.0;
    }
 
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(starCol, 3));
 
    const starMat = new THREE.PointsMaterial({
      size: 0.45,
      vertexColors: true,
      transparent: true,
      opacity: 0.9
    });
 
    const starParticles = new THREE.Points(starGeo, starMat);
    scene.add(starParticles);
 
    // --- BLACK HOLE PLACEMENT (deep background, far behind the asteroid/star field) ---
    // BH_SCALE sets how big it looks; BH_X / BH_Y move it on screen.
    const BH_DIST = 650, BH_SCALE = 26, BH_X = -190, BH_Y = 70;
    const blackHoleWorld = new THREE.Group();
    blackHoleWorld.position.set(BH_X, BH_Y, -BH_DIST);
    blackHoleWorld.scale.setScalar(BH_SCALE);
    blackHoleWorld.rotation.x = THREE.MathUtils.degToRad(9); // tilt so the disk is seen from slightly above
    scene.add(blackHoleWorld);

 
    // --- Relativistic Realistic Black Hole ---
    // This uses multiple objects and a complex shader pass to simulate lensing
 
    const blackHoleGroup = new THREE.Group();
    blackHoleGroup.position.set(0, 0, 0); // Position at center for this example
    blackHoleWorld.add(blackHoleGroup);
 
    // 1. The Core (Event Horizon) - Perfect dark sphere
    const coreGeo = new THREE.SphereGeometry(3.0, 40, 24);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    blackHoleGroup.add(coreMesh);
 
    // 2. Lensed halo: glowing arc around the horizon (faces the camera, sits behind the core)
    const haloMat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: `
        varying vec2 vP;
        void main() {
          vP = position.xy;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vP;
        uniform float time;
        void main() {
          float r = length(vP);
          float d = max(r - 3.0, 0.0);
          float glow = exp(-d * 1.6) * 1.4;
          // brighter above and below, like light bent over the top and bottom of the disk
          float topBottom = 0.45 + 0.55 * abs(vP.y) / max(r, 0.001);
          float pulse = 0.95 + 0.05 * sin(time * 0.8);
          vec3 col = mix(vec3(1.0, 0.45, 0.1), vec3(1.0, 0.85, 0.5), exp(-d * 3.0));
          gl_FragColor = vec4(col * glow * topBottom * pulse, glow * topBottom);
        }
      `,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false
    });
    const haloMesh = new THREE.Mesh(new THREE.RingGeometry(2.0, 9, 128, 1), haloMat);
    haloMesh.position.z = -3.5;
    blackHoleGroup.add(haloMesh);
 
    // 3. Accretion disk: flat ring seen at a shallow angle
    function createDiskTexture() {
      const cv = document.createElement('canvas');
      cv.width = 1024; cv.height = 256;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, 1024, 256);
      for (let i = 0; i < 2500; i++) {
        const x = Math.random() * 1024;
        const y = Math.random() * 256;
        const len = 20 + Math.random() * 120;
        const alpha = Math.random() * 0.35 + 0.1;
        const c = [`rgba(255,120,30,${alpha})`, `rgba(255,190,100,${alpha})`, `rgba(255,235,200,${alpha})`];
        ctx.fillStyle = c[Math.floor(Math.random() * 3)];
        ctx.fillRect(x, y, len, 1 + Math.random() * 2);
      }
      const t = new THREE.CanvasTexture(cv);
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      return t;
    }
    const diskTex = createDiskTexture();
 
    const diskMat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, diskTexture: { value: diskTex } },
      vertexShader: `
        varying vec2 vUv;
        varying float vDoppler;
        void main() {
          vUv = uv;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          // approaching side (left) is brighter, receding side (right) is dimmer
          vDoppler = 1.0 + 0.9 * clamp(-wp.x / 10.0, -1.0, 1.0);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform sampler2D diskTexture;
        varying vec2 vUv;
        varying float vDoppler;
        void main() {
          // inner gas orbits faster than outer gas
          float speed = 0.06 / (0.25 + vUv.y);
          vec4 tex = texture2D(diskTexture, vec2(vUv.x * 3.0 + time * speed, vUv.y));
          float heat = 1.0 - vUv.y;
          vec3 col = mix(vec3(1.0, 0.4, 0.08), vec3(1.0, 0.9, 0.65), heat * heat);
          float intensity = (0.35 + tex.r * 1.6) * vDoppler * (0.4 + heat * 1.4);
          float edge = smoothstep(0.0, 0.08, vUv.y) * (1.0 - smoothstep(0.7, 1.0, vUv.y));
          gl_FragColor = vec4(col * intensity, edge);
        }
      `,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });
 
    const DISK_IN = 3.6, DISK_OUT = 11;
    const diskGeo = new THREE.RingGeometry(DISK_IN, DISK_OUT, 160, 12);
    const dp = diskGeo.attributes.position, du = diskGeo.attributes.uv;
    for (let i = 0; i < dp.count; i++) {
      const x = dp.getX(i), y = dp.getY(i);
      du.setXY(i, Math.atan2(y, x) / (Math.PI * 2) + 0.5, (Math.hypot(x, y) - DISK_IN) / (DISK_OUT - DISK_IN));
    }
    diskGeo.rotateX(-Math.PI / 2);
    const diskMesh = new THREE.Mesh(diskGeo, diskMat);
    blackHoleGroup.rotation.z = THREE.MathUtils.degToRad(-12);
    blackHoleGroup.position.x = 2;
    blackHoleGroup.add(diskMesh);
 
    // 4. Foreground Planetesimal Object (Tiny dark sphere on the left disk edge)
    const bhPlanetGeo = new THREE.SphereGeometry(0.12, 16, 16);
    const bhPlanetMat = new THREE.MeshStandardMaterial({
        color: 0x050505, 
        roughness: 0.9, 
        metalness: 0.1
    });
    const bhPlanetMesh = new THREE.Mesh(bhPlanetGeo, bhPlanetMat);
    // Position on the front-left edge of the disk
    bhPlanetMesh.position.set(-6, 0.1, 4); 
    blackHoleGroup.add(bhPlanetMesh);
 
    
    // Parallax mouse / touch control
    let mouseX = 0, mouseY = 0;
    window.addEventListener('mousemove', (e) => {
      mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
      mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
    });
 
    // Flight speed (1.0 = cruise). Change to 0.35 for drift or 3.2 for warp.

 
    // --- MAIN CONTINUOUS MOTION ANIMATION LOOP ---
    function animate(now) {
      raf = null;
      if (document.hidden || !prefs.motion || reduced.matches || contextLost) { last = 0; return; }
      raf = requestAnimationFrame(animate);
      if (!last) { last = now; return; }
      const interval = 1000 / (light() ? 30 : 45);
      if (now - last < interval) return;
      const dt = Math.min((now - last) / 1000, .075); last = now;
      const step = dt * 60 * prefs.speed * 2;
      elapsed += dt * prefs.speed * 2;
 
      const currentZSpeed = 1.2 * step;
 
      // 1. Camera Mouse Parallax
      camera.position.x += (mouseX * 5 - camera.position.x) * (1 - Math.pow(.95, step));
      camera.position.y += (-mouseY * 4 - camera.position.y) * (1 - Math.pow(.95, step));
      camera.lookAt(0, 0, -50);
 
      // 2. Endless Asteroid Streaming Engine
      asteroids.forEach(a => {
        a.mesh.position.z += currentZSpeed;
        a.mesh.rotation.x += a.rotSpeed[0] * step;
        a.mesh.rotation.y += a.rotSpeed[1] * step;
 
        // Recycle asteroid once it flies past camera (+Z)
        if (a.mesh.position.z > 20) {
          a.mesh.position.z = -250 - Math.random() * 100;
          a.mesh.position.x = (Math.random() - 0.5) * 90;
          a.mesh.position.y = (Math.random() - 0.5) * 60;
        }
      });
 
      // 3. Continuous Starfield Motion
      const positions = starParticles.geometry.attributes.position.array;
      for (let i = 0; i < STAR_COUNT; i++) {
        positions[i * 3 + 2] += currentZSpeed * 2.2;
        if (positions[i * 3 + 2] > 20) {
          positions[i * 3 + 2] = -350;
        }
      }
      starParticles.geometry.attributes.position.needsUpdate = true;
 
      // 4. Background Planet Drift
      planetGroup.position.z += currentZSpeed * 0.08;
      planetMesh.rotation.y += 0.0008 * step;
      if (planetGroup.position.z > 50) {
        planetGroup.position.z = -320;
      }
 
      // 5. UFO Encounter AI Logic
      if (ufoData.active) {
        ufoData.time += 0.015 * step;
        
        // Curved swooping path across view
        ufoData.group.position.z += currentZSpeed * 1.4;
        ufoData.group.position.x = ufoData.startX + Math.sin(ufoData.time * 2) * 35;
        ufoData.group.position.y = ufoData.startY + Math.cos(ufoData.time * 1.5) * 15;
        ufoData.group.rotation.y += 0.03 * step;
 
        if (ufoData.group.position.z > 30) {
          ufoData.active = false;
          ufoData.group.position.set(200, 200, 200); // Hide
        }
      } else {
        // Random chance to spawn UFO encounter
        if (Math.random() < 1 - Math.pow(.999, step)) {
          triggerUFOEncounter();
        }
      }
 
      // Black hole shader animation
      const bhTime = elapsed;
      diskMat.uniforms.time.value = bhTime;
      haloMat.uniforms.time.value = bhTime;
 
      renderer.render(scene, camera);
    }
 
    function render() { if (!contextLost) renderer.render(scene, camera); }
    function restart() {
      if (raf !== null) cancelAnimationFrame(raf);
      raf = null; last = 0;
      if (document.hidden || contextLost) return;
      render();
      if (prefs.motion && !reduced.matches && prefs.speed > 0) raf = requestAnimationFrame(animate);
    }
    function resize() {
      const w = innerWidth, h = innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, light() ? 1 : prefs.quality === 'high' ? 2 : 1.5));
      renderer.setSize(w, h);
      // Keep the original composition visible on narrow phone screens.
      blackHoleWorld.position.x = w < 700 ? -95 : -190;
      blackHoleWorld.scale.setScalar(w < 700 ? 18 : 26);
      planetGroup.position.x = w < 700 ? 30 : 45;
      starGeo.setDrawRange(0, light() ? 1200 : STAR_COUNT);
      asteroids.forEach((a,i) => { a.mesh.visible = prefs.scene !== 'galaxy' && prefs.scene !== 'nebula' && (!light() || i < 12); });
      planetGroup.visible = prefs.scene === 'universe' || prefs.scene === 'solar';
      blackHoleWorld.visible = prefs.scene !== 'solar' && prefs.scene !== 'nebula';
      ufoData.group.visible = prefs.scene === 'universe';
      renderer.toneMappingExposure = .35 + prefs.brightness * 1.2;
      restart();
    }
    window.SpaceUniverse = {configure(next) { prefs = {...prefs,...next}; resize(); }};
    addEventListener('resize', resize);
    document.addEventListener('visibilitychange', restart);
    reduced.addEventListener('change', restart);
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); contextLost = true; if (raf !== null) cancelAnimationFrame(raf); raf = null; });
    canvas.addEventListener('webglcontextrestored', () => { contextLost = false; resize(); });
    resize();
  })();
