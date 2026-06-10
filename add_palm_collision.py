import re

file_path = r'C:\Users\irene\Documents\PROYECTOS\WorldOfPromptcraft\world-of-prompcraft\client\src\meshes\vegetation\MalakaPalmTree.ts'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add import
import_pattern = re.compile(r'import \{ registerMesh \} from \'../core/MeshRegistry\';')
new_import = """import { registerMesh } from '../core/MeshRegistry';
import { boxCollider } from '../../systems/worldbuilder/colliderProxy';"""
content = import_pattern.sub(new_import, content)

# 2. Add boxCollider to buildTreeGroup
trunk_pattern = re.compile(r'  trunkGroup\.userData\.isCollider = true;\n  g\.add\(trunkGroup\);')
new_trunk = """  trunkGroup.userData.isCollider = true;
  g.add(trunkGroup);

  const trunkCol = boxCollider(0.8 * scale, tH, 0.8 * scale);
  trunkCol.position.set(bendX / 2, tH / 2, bendZ / 2);
  g.add(trunkCol);"""
content = trunk_pattern.sub(new_trunk, content)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Palm tree collisions added.")
