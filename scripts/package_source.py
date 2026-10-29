from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
root=Path(__file__).resolve().parents[1]
target=root/'dist/codigo-fonte.zip'
with ZipFile(target,'w',ZIP_DEFLATED) as z:
 for folder in ['dist','scripts','docs','.vscode']:
  for p in sorted((root/folder).rglob('*')):
   if p.is_file() and p!=target and '__pycache__' not in p.parts and not p.name.endswith('.tmp'):
    z.write(p,p.relative_to(root))
 for name in ['README.md','.gitignore','vercel.json','voto-em-dados.code-workspace']:
  z.write(root/name,name)
print(target)
