import * as fs from 'fs';
// Let's modify PlayerController to console log the number of static meshes once
const path = 'client/src/entities/PlayerController.ts';
let content = fs.readFileSync(path, 'utf8');
content = content.replace(
  'const meshes = this.collisionSystem?.getStaticMeshes() ?? [];',
  'const meshes = this.collisionSystem?.getStaticMeshes() ?? [];\n      if ((window as any)._meshLogCount === undefined) { console.log("Static meshes:", meshes.length); (window as any)._meshLogCount = true; }'
);
fs.writeFileSync(path, content);
