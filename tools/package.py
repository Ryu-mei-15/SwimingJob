from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
root = Path(__file__).resolve().parents[1]
with ZipFile(root / 'スイムノート_Google版セットアップ.zip', 'w', ZIP_DEFLATED) as z:
    for name in ['index.html', 'config.json', 'README.md', '使い方.txt']:
        z.write(root / name, name)
    for folder in ['backend', 'docs']:
        for p in (root / folder).glob('*'):
            if p.is_file(): z.write(p, str(p.relative_to(root)))
print('Packaged Google setup files. Private account material and rosters are excluded.')
