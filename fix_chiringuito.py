import sys
import re

file_path = r'C:\Users\irene\Documents\PROYECTOS\WorldOfPromptcraft\world-of-prompcraft\client\src\meshes\buildings\malaka\MalakaChiringuito.ts'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Replace createJabegaBoat
jabega_pattern = re.compile(r'// ─── Helper: Andalusian jábega boat.*?return boatGroup;\n}', re.DOTALL)

new_jabega = """// ─── Helper: Andalusian jábega boat (espetero) ─────────────────────────────────
function createJabegaBoat(scale: number, mats: MedMaterials): THREE.Group {
  const boatGroup = new THREE.Group();

  const boatLength = 4.5 * scale;
  const boatWidth = 1.6 * scale;
  const boatDepth = 0.7 * scale; // slightly shallower
  
  // A simple stretched hemisphere for the hull
  const hullGeo = new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  hullGeo.scale(boatWidth / 2, boatDepth, boatLength / 2);
  
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x4a2818, roughness: 0.9, side: THREE.DoubleSide });
  const hull = new THREE.Mesh(hullGeo, hullMat);
  // The sphere is centered at 0, goes from y=0 to y=boatDepth.
  // Rotate 180 degrees on X to make it a bowl (y=0 to y=-boatDepth).
  hull.rotation.x = Math.PI; 
  hull.position.y = boatDepth; // bring it up so bottom is at ground level
  hull.castShadow = true;
  boatGroup.add(hull);

  // Gunwale (rim)
  const gunwaleGeo = new THREE.TorusGeometry(1, 0.05, 8, 32);
  gunwaleGeo.scale(boatWidth / 2, 1, boatLength / 2);
  const gunwale = new THREE.Mesh(gunwaleGeo, new THREE.MeshStandardMaterial({ color: 0x1a4a7a, roughness: 0.75 })); // blue rim
  gunwale.position.y = boatDepth;
  gunwale.rotation.x = Math.PI / 2;
  boatGroup.add(gunwale);

  // Sand bed for espetos
  const sandMat = new THREE.MeshStandardMaterial({ color: 0xe3cda4, roughness: 1.0 });
  const sand = new THREE.Mesh(
    new THREE.BoxGeometry(boatWidth * 0.7, 0.2 * scale, boatLength * 0.6),
    sandMat
  );
  sand.position.set(0, boatDepth - 0.1 * scale, 0); // At the top of the boat
  boatGroup.add(sand);

  // Fire / charcoal embers
  const fireMat = new THREE.MeshStandardMaterial({
    color: 0xff4400,
    emissive: new THREE.Color(0xff2200),
    emissiveIntensity: 1.5,
  });
  const charcoalMat = new THREE.MeshStandardMaterial({
    color: 0x2a2a2a,
    emissive: new THREE.Color(0x551100),
    emissiveIntensity: 0.3,
    roughness: 1.0,
  });

  // Charcoal bed
  for (let i = 0; i < 12; i++) {
    const coal = new THREE.Mesh(
      new THREE.SphereGeometry(0.1 * scale, 5, 4),
      i % 3 === 0 ? fireMat : charcoalMat
    );
    coal.scale.set(1.2, 0.5, 1.0);
    coal.position.set(
      (Math.random() - 0.5) * 0.8 * scale,
      boatDepth,
      (Math.random() - 0.5) * 1.5 * scale
    );
    coal.userData.noCollision = true;
    boatGroup.add(coal);
  }

  // Ember particles
  boatGroup.add(createEmberParticles({
    scale, count: 20, radius: 0.4,
    baseY: boatDepth + 0.1 * scale, rise: 1.5, speed: 1.2, size: 0.1,
  }));

  // Espetos (skewers with sardines)
  const skewerMat = mats.wood;
  const fishMat = new THREE.MeshStandardMaterial({ color: 0xc0c0c0, metalness: 0.8, roughness: 0.4 });
  const fishGrilledMat = new THREE.MeshStandardMaterial({ color: 0x8a7a5a, metalness: 0.3, roughness: 0.7 });
  
  for (let i = 0; i < 6; i++) {
    const skewer = new THREE.Group();
    const stick = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015 * scale, 0.01 * scale, 1.6 * scale),
      skewerMat
    );
    // Skewer center is at 0, goes from -0.8 to 0.8 on Y axis
    stick.position.y = 0.8 * scale; 
    skewer.add(stick);

    // Add fishes along the stick
    for (let f = 0; f < 4; f++) {
      const fish = new THREE.Mesh(
        new THREE.SphereGeometry(0.08 * scale, 8, 4),
        f < 2 ? fishGrilledMat : fishMat
      );
      fish.scale.set(1, 2.5, 0.3); // elongated fish
      // Position along the stick (Y axis)
      fish.position.set(0, 0.4 * scale + f * 0.2 * scale, 0);
      skewer.add(fish);
    }

    const side = i % 2 === 0 ? 1 : -1;
    // Position the skewer base in the sand
    skewer.position.set(
      side * 0.3 * scale,
      boatDepth - 0.2 * scale, // base inside sand
      -0.6 * scale + i * 0.4 * scale
    );
    // Tilt the skewer outward and backward
    skewer.rotation.z = side * Math.PI / 6; // tilt outwards
    skewer.rotation.x = Math.PI / 8; // tilt back slightly
    boatGroup.add(skewer);
  }

  return boatGroup;
}"""

content = jabega_pattern.sub(new_jabega, content)

# 2. Replace Roof
roof_pattern = re.compile(r'    // ═══════════════════════════════════════════════════════════════════════════\n    // PILLARS & IMPROVED ROOF.*?\n    // ═══════════════════════════════════════════════════════════════════════════\n    // ANDALUSIAN TABLES & CHAIRS', re.DOTALL)

new_roof = """    // ═══════════════════════════════════════════════════════════════════════════
    // PILLARS & ROOF (Simple flat roof with dry palm material)
    // ═══════════════════════════════════════════════════════════════════════════
    const roofH = 3.5 * scale;
    const roofW = 8 * scale;
    const roofD = 6 * scale;

    // Wooden pillars
    const pillarGeo = new THREE.BoxGeometry(0.35 * scale, roofH, 0.35 * scale);
    const pillarPos = [
      [-5 * scale, -4 * scale],
      [1 * scale, -4 * scale],
      [-5 * scale, 0],
      [1 * scale, 0],
    ];
    for (const [x, z] of pillarPos) {
      const p = new THREE.Mesh(pillarGeo, mats.wood);
      p.position.set(x, groundY + roofH / 2, z);
      p.castShadow = true;
      p.receiveShadow = true;
      g.add(p);
    }

    // Pergola beams (main supports)
    const beamW_mesh = new THREE.Mesh(new THREE.BoxGeometry(roofW, 0.2 * scale, 0.2 * scale), mats.wood);
    beamW_mesh.position.set(-2 * scale, groundY + roofH, -4 * scale);
    g.add(beamW_mesh);
    const beamW2 = beamW_mesh.clone();
    beamW2.position.set(-2 * scale, groundY + roofH, 0);
    g.add(beamW2);

    const beamD_mesh = new THREE.Mesh(new THREE.BoxGeometry(0.2 * scale, 0.2 * scale, roofD), mats.wood);
    beamD_mesh.position.set(-5 * scale, groundY + roofH, -2 * scale);
    g.add(beamD_mesh);
    const beamD2 = beamD_mesh.clone();
    beamD2.position.set(1 * scale, groundY + roofH, -2 * scale);
    g.add(beamD2);

    // Simple flat roof (cañizo / palm leaves)
    const cannizoMat = new THREE.MeshStandardMaterial({ color: 0xd4b97a, roughness: 1.0 });
    const roofPanel = new THREE.Mesh(
      new THREE.BoxGeometry(roofW + 0.5 * scale, 0.1 * scale, roofD + 0.5 * scale),
      cannizoMat
    );
    roofPanel.position.set(-2 * scale, groundY + roofH + 0.15 * scale, -2 * scale);
    roofPanel.castShadow = true;
    roofPanel.receiveShadow = true;
    g.add(roofPanel);

    // ═══════════════════════════════════════════════════════════════════════════
    // ANDALUSIAN TABLES & CHAIRS"""

content = roof_pattern.sub(new_roof, content)

# 3. Add Table Collisions
table_pattern = re.compile(r'      const tableGroup = createAndalusianTable\(scale, mats\);\n      tableGroup\.position\.set\(tx, groundY, tz\);\n      g\.add\(tableGroup\);\n\n      const tableTopY', re.DOTALL)

new_table = """      const tableGroup = createAndalusianTable(scale, mats);
      tableGroup.position.set(tx, groundY, tz);
      g.add(tableGroup);

      // Table collision
      const tableCollider = boxCollider(1.0 * scale, 0.8 * scale, 1.0 * scale);
      tableCollider.position.set(tx, groundY + 0.4 * scale, tz);
      g.add(tableCollider);

      const tableTopY"""

content = table_pattern.sub(new_table, content)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Done")
