import re

file_path = r'C:\Users\irene\Documents\PROYECTOS\WorldOfPromptcraft\world-of-prompcraft\client\src\meshes\buildings\malaka\MalakaChiringuito.ts'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Pillars
pillar_pattern = re.compile(r'    for \(const \[x, z\] of pillarPos\) \{\n      const p = new THREE\.Mesh\(pillarGeo, mats\.wood\);\n      p\.position\.set\(x, groundY \+ roofH / 2, z\);\n      p\.castShadow = true;\n      p\.receiveShadow = true;\n      g\.add\(p\);\n    \}')
new_pillars = """    for (const [x, z] of pillarPos) {
      const p = new THREE.Mesh(pillarGeo, mats.wood);
      p.position.set(x, groundY + roofH / 2, z);
      p.castShadow = true;
      p.receiveShadow = true;
      g.add(p);

      const pCol = boxCollider(0.4 * scale, roofH, 0.4 * scale);
      pCol.position.copy(p.position);
      g.add(pCol);
    }"""
content = pillar_pattern.sub(new_pillars, content)

# 2. Chairs
chair_pattern = re.compile(r'      for \(const off of chairOffsets\) \{\n        const chairGroup = createAndalusianChair\(scale, mats\);\n        chairGroup\.position\.set\(\n          tx \+ off\.x \* scale,\n          groundY,\n          tz \+ off\.z \* scale\n        \);\n        chairGroup\.rotation\.y = off\.rot;\n        g\.add\(chairGroup\);\n      \}')
new_chairs = """      for (const off of chairOffsets) {
        const chairGroup = createAndalusianChair(scale, mats);
        const cx = tx + off.x * scale;
        const cz = tz + off.z * scale;
        chairGroup.position.set(cx, groundY, cz);
        chairGroup.rotation.y = off.rot;
        g.add(chairGroup);

        const chairCol = boxCollider(0.5 * scale, 1.0 * scale, 0.5 * scale);
        chairCol.position.set(cx, groundY + 0.5 * scale, cz);
        chairCol.rotation.y = off.rot;
        g.add(chairCol);
      }"""
content = chair_pattern.sub(new_chairs, content)

# 3. Stools
stool_pattern = re.compile(r'    for \(let i = 0; i < 4; i\+\+\) \{\n      const stool = createBarStool\(scale, mats\);\n      stool\.position\.set\(-4 \* scale \+ i \* 1\.3 \* scale, groundY, -0\.2 \* scale\);\n      g\.add\(stool\);\n    \}')
new_stools = """    for (let i = 0; i < 4; i++) {
      const stool = createBarStool(scale, mats);
      const sx = -4 * scale + i * 1.3 * scale;
      const sz = -0.2 * scale;
      stool.position.set(sx, groundY, sz);
      g.add(stool);

      const stoolCol = boxCollider(0.4 * scale, 0.8 * scale, 0.4 * scale);
      stoolCol.position.set(sx, groundY + 0.4 * scale, sz);
      g.add(stoolCol);
    }"""
content = stool_pattern.sub(new_stools, content)

# 4. Boat proxy
boat_pattern = re.compile(r'    const boatProxy = boxCollider\(1\.6 \* scale, 1\.8 \* scale, 4\.5 \* scale\);\n    boatProxy\.position\.copy\(boatGroup\.position\);\n    boatProxy\.position\.y \+= 0\.45 \* scale;')
new_boat = """    const boatProxy = boxCollider(1.6 * scale, 0.8 * scale, 4.5 * scale);
    boatProxy.position.copy(boatGroup.position);
    boatProxy.position.y += 0.4 * scale;"""
content = boat_pattern.sub(new_boat, content)


with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Collisions improved.")
