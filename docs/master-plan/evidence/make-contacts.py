from pathlib import Path
from PIL import Image, ImageOps, ImageDraw
import json

root = Path(__file__).resolve().parent
for group in ('ui', 'ui-driven'):
    for folder in (root / group).iterdir():
        if not folder.is_dir():
            continue
        files = sorted(folder.glob('*.png'))
        width, height = 360, 460
        canvas = Image.new('RGB', (width * 5, height * ((len(files) + 4) // 5)), '#e3e3e3')
        draw = ImageDraw.Draw(canvas)
        for i, path in enumerate(files):
            im = Image.open(path).convert('RGB')
            im.thumbnail((350, 430))
            x, y = (i % 5) * width, (i // 5) * height
            canvas.paste(im, (x, y + 23))
            draw.text((x + 3, y + 3), path.stem, fill='black')
        canvas.save(root / f'{group}-{folder.name}-contact.png')

out = {}
for file in ('ui-results.json', 'ui-driven-results.json'):
    rows = json.loads((root / file).read_text(encoding='utf-8-sig'))
    out[file] = {'captures': len(rows), 'non_200': sum(r.get('status') != 200 for r in rows),
                 'page_errors': sum(len(r.get('errors', [])) for r in rows),
                 'route_mismatches': sum(r.get('dom', {}).get('url') != r['route'] for r in rows),
                 'broken_images': sum(len(r.get('dom', {}).get('brokenImages', [])) for r in rows)}
(root / 'ui-summary.json').write_text(json.dumps(out, indent=2), encoding='utf-8')
print(json.dumps(out, indent=2))
