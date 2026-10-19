#!/usr/bin/env python3
"""B4b: scripts/prepare-flavour-photos.py on Pillow-generated pictures in a temp folder (no real photos). Run: python3 -I scripts/test-prepare-flavour-photos.py"""
import hashlib
import importlib.util
import io
import json
import random
import sys
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('pf', ROOT / 'scripts/prepare-flavour-photos.py')
pf = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pf)

LIMIT = 1_900_000


def check(cond, what):
    if not cond:
        sys.exit('FAIL: ' + what)
    print('ok  ', what)


def noise(path, w, h, fmt=None, scale=1, **kw):
    """A picture that does not compress: random bytes, so the quality loop has to step down. `scale` blows each pixel up, so a picture
    larger than 1600 px still holds full-entropy detail after it is shrunk."""
    im = Image.frombytes('RGB', (w, h), random.Random(w * 7 + h).randbytes(w * h * 3))
    if scale > 1:
        im = im.resize((w * scale, h * scale), Image.NEAREST)
    im.save(path, fmt, **kw)


FLAVOURS = [
    dict(id='dcf', name='Double Choc Fudge'),
    dict(id='dubai', name='Dubai Chocolate'),
    dict(id='rv', name='Red Velvet'),
    dict(id='rv2', name='red-velvet'),       # same name once spacing and punctuation are ignored: a file named so is ambiguous
    dict(id='matcha', name='Matcha Latte'),
    dict(id='gooey', name='Gooey Nutella'),  # no picture in the folder
    dict(id='small', name='Tiny One'),
    dict(id='tilt', name='Sideways'),
]

with tempfile.TemporaryDirectory() as t:
    t = Path(t)
    src = t / 'pics'
    src.mkdir()
    noise(src / 'Double Choc Fudge.png', 1600, 1600, 'PNG')                      # big: must shrink under the limit
    exif = Image.Exif()
    exif[0x0112] = 6                                                           # orientation: rotate 90
    exif[0x010F] = 'CameraMaker'
    gps = exif.get_ifd(0x8825)
    gps[1] = 'N'
    gps[2] = (14.0, 35.0, 0.0)
    gps[3] = 'E'
    gps[4] = (121.0, 0.0, 0.0)
    exif[0x8825] = gps
    Image.new('RGB', (200, 100), (200, 30, 30)).save(src / 'SIDEWAYS.jpg', 'JPEG', exif=exif.tobytes(), icc_profile=b'')
    Image.new('RGB', (800, 600), (30, 30, 200)).save(src / 'tiny-one!.PNG')   # smaller than 1600: never upscaled
    Image.new('RGB', (3200, 1600), (10, 160, 10)).save(src / 'dubai  CHOCOLATE.webp', 'WEBP')
    Image.new('RGB', (100, 100)).save(src / 'Mystery.png')                    # no flavour of that name
    Image.new('RGB', (100, 100)).save(src / 'Red Velvet.png')                 # two flavours share the normalised name
    Image.new('RGB', (100, 100)).save(src / 'matcha latte.png')               # two files for one flavour
    Image.new('RGB', (100, 100)).save(src / 'MATCHA-LATTE.jpg')
    (src / 'Red Velvet Cheesecake.psd').write_bytes(b'8BPS' + b'\0' * 50)
    (src / 'Archive.zip').write_bytes(b'PK\x03\x04' + b'\0' * 50)
    (src / 'notes.txt').write_text('not a picture')
    flavours = t / 'flavours.json'
    flavours.write_text(json.dumps(FLAVOURS))

    out = t / 'out'
    man = pf.build(src, FLAVOURS, out)
    by = {f['file']: f for f in man['files']}
    big = by['Double Choc Fudge.png']
    data = (out / big['output']).read_bytes()
    im = Image.open(io.BytesIO(data))
    check(big['status'] == 'ready' and big['flavour_id'] == 'dcf' and big['output'] == 'dcf.webp', 'a matching file is written as <flavour id>.webp')
    check(im.format == 'WEBP' and max(im.size) == 1600 and im.size == (1600, 1600), 'the longest side is 1600 px')
    check(len(data) <= LIMIT and big['bytes_after'] == len(data), 'a big picture ends up at most 1,900,000 bytes (the app limit is 2,097,152)')
    check(big['quality'] < 85 and big['quality'] >= 20, 'quality stepped down from 85 until it fit')
    check(big['bytes_before'] == (src / 'Double Choc Fudge.png').stat().st_size and big['pixels_before'] == [1600, 1600] and big['pixels_after'] == [1600, 1600],
          'bytes and pixels before and after are in the manifest')
    check(big['source_sha256'] == hashlib.sha256((src / 'Double Choc Fudge.png').read_bytes()).hexdigest(), 'the source SHA-256 is in the manifest')

    side = by['SIDEWAYS.jpg']
    sdata = (out / side['output']).read_bytes()
    sim = Image.open(io.BytesIO(sdata))
    check(side['flavour_id'] == 'tilt' and sim.size == (100, 200), 'matching ignores case; the EXIF orientation is applied before the metadata goes')
    check(len(sim.getexif()) == 0 and not any(k in sim.info for k in ('exif', 'icc_profile', 'xmp')), 'EXIF, GPS, ICC and XMP are gone from the picture')
    check(not any(tag in sdata for tag in (b'EXIF', b'XMP ', b'ICCP', b'CameraMaker')), 'and from the bytes of the file')
    check(side['quality'] == 85, 'a picture that fits keeps quality 85')

    tiny = by['tiny-one!.PNG']
    check(tiny['flavour_id'] == 'small' and tiny['pixels_after'] == [800, 600], 'a picture smaller than 1600 px is never upscaled; punctuation is ignored in the match')
    check(by['dubai  CHOCOLATE.webp']['flavour_id'] == 'dubai' and by['dubai  CHOCOLATE.webp']['pixels_after'] == [1600, 800], 'spacing and case are ignored in the match; proportions hold when shrinking')

    check(by['Mystery.png']['status'] == 'unmatched' and 'no flavour' in by['Mystery.png']['reason'] and 'output' not in by['Mystery.png'], 'a name that matches no flavour is listed, not written')
    check(by['Red Velvet.png']['status'] == 'ambiguous' and by['Red Velvet.png']['candidates'] == ['rv', 'rv2'], 'a name that matches several flavours is listed with them, not guessed')
    check(by['matcha latte.png']['status'] == 'ambiguous' and by['MATCHA-LATTE.jpg']['status'] == 'ambiguous'
          and 'more than one file' in by['matcha latte.png']['reason'], 'two files for one flavour are both listed, neither written')
    check(by['Red Velvet Cheesecake.psd']['status'] == 'skipped' and by['Archive.zip']['status'] == 'skipped' and by['notes.txt']['status'] == 'skipped'
          and 'Photoshop' in by['Red Velvet Cheesecake.psd']['reason'], '.psd and .zip (and anything else that is not a finished image) are skipped and listed')
    check(len(by['Archive.zip']['source_sha256']) == 64, 'a skipped file still has its source hash')
    check(sorted(p.name for p in out.iterdir()) == ['dcf.webp', 'dubai.webp', 'manifest.json', 'small.webp', 'tilt.webp'], 'the output folder holds the resized copies and the manifest only')
    tot = man['totals']
    check(tot['ready'] == 4 and tot['unmatched'] == 1 and tot['ambiguous'] == 3 and tot['skipped'] == 3 and tot['files'] == 11, 'totals count each outcome')
    check(tot['bytes_after'] == sum(f['bytes_after'] for f in man['files'] if f['status'] == 'ready') and tot['bytes_before'] > tot['bytes_after'], 'totals sum the bytes before and after')
    check(man['flavours_without_picture'] == [dict(id='rv', name='Red Velvet'), dict(id='rv2', name='red-velvet'), dict(id='matcha', name='Matcha Latte'), dict(id='gooey', name='Gooey Nutella')],
          'flavours that end with no picture are listed')
    check(json.loads((out / 'manifest.json').read_text()) == man, 'manifest.json is the returned manifest')

    out2 = t / 'out2'
    man2 = pf.build(src, FLAVOURS, out2)
    check(all(hashlib.sha256((out / n).read_bytes()).hexdigest() == hashlib.sha256((out2 / n).read_bytes()).hexdigest() for n in ('dcf.webp', 'tilt.webp', 'small.webp', 'dubai.webp'))
          and man == man2, 'deterministic: the same folder gives the same output hashes and manifest')

    try:
        pf.build(src, FLAVOURS, src / 'inside')
        check(False, 'an --out inside the picture folder is refused')
    except SystemExit:
        check(True, 'an --out inside the picture folder is refused')

    o3 = t / 'out3'
    pf.main(['--folder', str(src), '--flavours', str(flavours), '--out', str(o3)])
    check((o3 / 'manifest.json').exists() and (o3 / 'dcf.webp').exists(), 'the command line writes the copies and the manifest')

    # A picture that cannot get under the limit is listed as failed, never written over the limit.
    tight = t / 'tight'
    tight.mkdir()
    noise(tight / 'Double Choc Fudge.png', 1600, 1600, 'PNG')
    mt = pf.build(tight, FLAVOURS, t / 'out4', limit=50_000, min_quality=60)
    f = mt['files'][0]
    check(f['status'] == 'failed' and 'limit' in f['reason'] and not (t / 'out4' / 'dcf.webp').exists(), 'a picture that cannot be made small enough is listed as failed, not written')
print('prepare-flavour-photos: all passed')
