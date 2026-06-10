import re

file_path = r'C:\Users\irene\Documents\PROYECTOS\WorldOfPromptcraft\world-of-prompcraft\client\src\meshes\buildings\malaka\MalakaChiringuito.ts'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Remove addBarObjects definition
func_pattern = re.compile(r'// ─── Helper: Bar objects ────────────────────────────────────────────────────────\nfunction addBarObjects.*?\}\n', re.DOTALL)
content = func_pattern.sub('', content)

# Remove the call to addBarObjects
call_pattern = re.compile(r'    // Add bar props\n    addBarObjects.*?;\n\n', re.DOTALL)
content = call_pattern.sub('', content)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Bar objects removed.")
