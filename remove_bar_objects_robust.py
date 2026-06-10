file_path = r'C:\Users\irene\Documents\PROYECTOS\WorldOfPromptcraft\world-of-prompcraft\client\src\meshes\buildings\malaka\MalakaChiringuito.ts'

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
skip = False
for i, line in enumerate(lines):
    # Skip addBarObjects definition
    if "// ─── Helper: Bar objects" in line:
        skip = True
    
    # We know the function ends before the boat helper
    if skip and "// ─── Helper: Andalusian jábega boat" in line:
        skip = False

    # Skip the call
    if "addBarObjects(g," in line or "// Add bar props" in line:
        continue

    if not skip:
        new_lines.append(line)

with open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print("Bar objects permanently removed by line matching.")
