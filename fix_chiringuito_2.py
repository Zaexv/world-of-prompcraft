import re
import sys

file_path = r'C:\Users\irene\Documents\PROYECTOS\WorldOfPromptcraft\world-of-prompcraft\client\src\meshes\buildings\malaka\MalakaChiringuito.ts'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Remove gunwale
gunwale_pattern = re.compile(r'  // Gunwale \(rim\).*?boatGroup\.add\(gunwale\);\n', re.DOTALL)
content = gunwale_pattern.sub('', content)

# 2. Single table
table_pattern = re.compile(r'    for \(let i = 0; i < 3; i\+\+\) \{\n      const tx = 3 \* scale;\n      const tz = -3 \* scale \+ i \* 3 \* scale;', re.DOTALL)
new_table = """    {
      const tx = 3 * scale;
      const tz = 0; // Just one table"""
content = table_pattern.sub(new_table, content)

# 3. Remove palm trees
palm_pattern = re.compile(r'    // ═══════════════════════════════════════════════════════════════════════════\n    // PALM TREES.*?if \(palm2\) g\.add\(palm2\);\n', re.DOTALL)
content = palm_pattern.sub('', content)

# 4. Improve Roof to a beautiful wooden slatted pergola
roof_pattern = re.compile(r'    // Simple flat roof \(cañizo \/ palm leaves\).*?g\.add\(roofPanel\);', re.DOTALL)
new_roof = """    // Beautiful wooden slatted pergola roof
    const slatCount = 24;
    for (let i = 0; i < slatCount; i++) {
      const slat = new THREE.Mesh(
        new THREE.BoxGeometry(roofW + 1 * scale, 0.05 * scale, 0.12 * scale),
        mats.wood
      );
      const zPos = -2 * scale - roofD / 2 + i * (roofD / (slatCount - 1));
      slat.position.set(-2 * scale, groundY + roofH + 0.15 * scale, zPos);
      slat.castShadow = true;
      slat.receiveShadow = true;
      g.add(slat);
    }"""
content = roof_pattern.sub(new_roof, content)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Chiringuito fixed!")
