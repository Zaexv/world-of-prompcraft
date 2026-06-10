import re

file_path = r'C:\Users\irene\Documents\PROYECTOS\WorldOfPromptcraft\world-of-prompcraft\client\src\meshes\buildings\malaka\MalakaChiringuito.ts'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Remove addKitchenUtilities definition
func_pattern = re.compile(r'// ─── Helper: Kitchen / bar back utilities ──────────────────────────────────────\nfunction addKitchenUtilities.*?\}\n', re.DOTALL)
content = func_pattern.sub('', content)

# Remove the call to addKitchenUtilities
call_pattern = re.compile(r'    // ═══════════════════════════════════════════════════════════════════════════\n    // KITCHEN UTILITIES \(behind/on the bar\)\n    // ═══════════════════════════════════════════════════════════════════════════\n    addKitchenUtilities.*?;\n\n', re.DOTALL)
content = call_pattern.sub('', content)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Kitchen items removed.")
