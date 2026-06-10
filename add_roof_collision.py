import re

file_path = r'C:\Users\irene\Documents\PROYECTOS\WorldOfPromptcraft\world-of-prompcraft\client\src\meshes\buildings\malaka\MalakaChiringuito.ts'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Add roof collision after the slat loop
slats_pattern = re.compile(r'      slat\.castShadow = true;\n      slat\.receiveShadow = true;\n      g\.add\(slat\);\n    \}')
new_slats_and_col = """      slat.castShadow = true;
      slat.receiveShadow = true;
      g.add(slat);
    }

    // Roof collision
    const roofCol = boxCollider(roofW + 1 * scale, 0.4 * scale, roofD + 1 * scale);
    roofCol.position.set(-2 * scale, groundY + roofH + 0.1 * scale, -2 * scale);
    g.add(roofCol);"""
content = slats_pattern.sub(new_slats_and_col, content)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Roof collisions added.")
