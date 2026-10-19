#!/usr/bin/env python3 -I
"""B4b: her finished flavour pictures, resized for the app's upload limit, with a manifest. OFFLINE: it reads --folder, writes only to --out,
and never connects anywhere.

  python3 -I scripts/prepare-flavour-photos.py --folder <dir> --flavours <json> --out <dir>

--flavours is a JSON list of {"id": "<flavour id>", "name": "<flavour name>"} (query 2 of scripts/b4b-trial-reads.sql). Keep --out outside Git.

For each .png, .jpg, .jpeg or .webp under --folder (sub-folders included): the file's name (without the extension) must equal EXACTLY ONE
flavour name once case, spacing and punctuation are ignored, and no other file may match the same flavour. No match, several flavours, or
several files for one flavour: the file is listed, not written, and nothing is guessed. A .psd, a .zip or any other file is skipped and listed.

Resize rule (the app's browser control uses the same numbers): the longest side is at most 1600 px (never upscaled), the copy is WebP,
every piece of metadata is dropped (EXIF with GPS, XMP, and the ICC profile, after a conversion to sRGB so the colours hold), and the quality
steps down from 85 by 5 until the file is at most 1,900,000 bytes (the app's limit is 2 MB = 2,097,152). The EXIF orientation is applied to
the pixels first. A picture that cannot reach the limit at the lowest quality is listed as failed and not written. The output is
<flavour id>.webp, and the same folder gives the same bytes. manifest.json lists, per file: the source SHA-256, bytes and pixels before and
after, the output name and the flavour it matched, or why it did not; and totals.
"""
import argparse
import hashlib
import io
import json
import re
import sys
import unicodedata
from pathlib import Path

from PIL import Image, ImageCms, ImageOps

MAX_SIDE = 1600
START_QUALITY = 85
STEP = 5
MIN_QUALITY = 20
LIMIT = 1_900_000
APP_LIMIT = 2_097_152
IMAGE_TYPES = {'.png', '.jpg', '.jpeg', '.webp'}
SKIP_REASONS = {'.psd': 'Photoshop file, not a finished image', '.zip': 'archive, not a finished image'}


def norm(s):
    return re.sub(r'[^a-z0-9]', '', unicodedata.normalize('NFKD', str(s)).casefold())


def sha256(b):
    return hashlib.sha256(b).hexdigest()


def pixels_of(path):
    try:
        with Image.open(path) as im:
            return list(im.size)
    except Exception:  # unreadable pictures are reported when (and if) they are processed
        return None


def to_webp(path, limit, min_quality, max_side):
    """(bytes, quality, size, icc, why-not)"""
    with Image.open(path) as src:
        src.load()
        icc = src.info.get('icc_profile')
        im = ImageOps.exif_transpose(src)
        alpha = im.mode in ('RGBA', 'LA', 'PA') or 'transparency' in im.info
        im = im.convert('RGBA' if alpha else 'RGB')
    icc_state = 'none'
    if icc:
        try:
            im = ImageCms.profileToProfile(im, ImageCms.ImageCmsProfile(io.BytesIO(icc)), ImageCms.createProfile('sRGB'), outputMode=im.mode)
            icc_state = 'converted_to_srgb'
        except Exception:
            icc_state = 'dropped'
    w, h = im.size
    longest = max(w, h)
    if longest > max_side:
        im = im.resize((max(1, round(w * max_side / longest)) if w < longest else max_side,
                        max(1, round(h * max_side / longest)) if h < longest else max_side), Image.LANCZOS)
    clean = Image.new(im.mode, im.size)  # a fresh image carries no info, EXIF, XMP or profile
    clean.paste(im)
    q = START_QUALITY
    while True:
        buf = io.BytesIO()
        clean.save(buf, 'WEBP', quality=q, exif=b'', icc_profile=None, xmp=b'')
        if buf.tell() <= limit:
            return buf.getvalue(), q, list(clean.size), icc_state, None
        if q - STEP < min_quality:
            return None, q, list(clean.size), icc_state, 'still %d bytes at quality %d: over the %d byte limit' % (buf.tell(), q, limit)
        q -= STEP


def build(folder, flavours, out, limit=LIMIT, min_quality=MIN_QUALITY, max_side=MAX_SIDE):
    folder, out = Path(folder).resolve(), Path(out).resolve()
    if not folder.is_dir():
        sys.exit('--folder is not a folder')
    if out == folder or folder in out.parents:
        sys.exit('--out must be outside the picture folder')
    ids = [f['id'] for f in flavours]
    if len(set(ids)) != len(ids) or not all(isinstance(f.get('id'), str) and isinstance(f.get('name'), str) for f in flavours):
        sys.exit('--flavours must be a list of {id, name} strings with unique ids')
    by_norm = {}
    for f in flavours:
        if norm(f['name']):
            by_norm.setdefault(norm(f['name']), []).append(f['id'])
    entries = []
    for path in sorted(p for p in folder.rglob('*') if p.is_file()):
        rel = path.relative_to(folder).as_posix()
        raw = path.read_bytes()
        e = dict(file=rel, source_sha256=sha256(raw), bytes_before=len(raw))
        ext = path.suffix.lower()
        if ext not in IMAGE_TYPES:
            entries.append(dict(e, status='skipped', reason=SKIP_REASONS.get(ext, 'not a finished image type (.png, .jpg, .jpeg, .webp)')))
            continue
        e['pixels_before'] = pixels_of(path)
        cands = by_norm.get(norm(path.stem), [])
        if not cands:
            entries.append(dict(e, status='unmatched', reason='no flavour of that name'))
        elif len(cands) > 1:
            entries.append(dict(e, status='ambiguous', candidates=cands, reason='the name matches %d flavours' % len(cands)))
        else:
            entries.append(dict(e, flavour_id=cands[0], status='candidate'))
    for fid in {e['flavour_id'] for e in entries if e['status'] == 'candidate'}:
        same = [e for e in entries if e['status'] == 'candidate' and e['flavour_id'] == fid]
        if len(same) > 1:
            for e in same:
                e.update(status='ambiguous', candidates=[fid], reason='more than one file for this flavour: ' + ', '.join(x['file'] for x in same))
                del e['flavour_id']
    out.mkdir(parents=True, exist_ok=True)
    for e in entries:
        if e['status'] != 'candidate':
            continue
        try:
            data, q, size, icc, why = to_webp(folder / e['file'], limit, min_quality, max_side)
        except Exception as ex:  # a corrupt or unsupported picture
            e.update(status='failed', reason='cannot be read as a picture (%s)' % type(ex).__name__)
            continue
        if why:
            e.update(status='failed', reason=why, pixels_after=size)
            continue
        name = re.sub(r'[^A-Za-z0-9_-]', '_', e['flavour_id']) + '.webp'
        (out / name).write_bytes(data)
        e.update(status='ready', output=name, bytes_after=len(data), pixels_after=size, quality=q, icc=icc, output_sha256=sha256(data))
    ready = [e for e in entries if e['status'] == 'ready']
    have = {e['flavour_id'] for e in ready}
    manifest = dict(
        limits=dict(max_side=max_side, format='WEBP', start_quality=START_QUALITY, step=STEP, min_quality=min_quality, limit_bytes=limit, app_limit_bytes=APP_LIMIT),
        files=entries,
        flavours_without_picture=[dict(id=f['id'], name=f['name']) for f in flavours if f['id'] not in have],
        totals=dict(files=len(entries), **{s: sum(1 for e in entries if e['status'] == s) for s in ('ready', 'unmatched', 'ambiguous', 'skipped', 'failed')},
                    bytes_before=sum(e['bytes_before'] for e in entries), bytes_after=sum(e['bytes_after'] for e in ready)))
    (out / 'manifest.json').write_text(json.dumps(manifest, indent=1, ensure_ascii=False))
    return manifest


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--folder', required=True)
    ap.add_argument('--flavours', required=True)
    ap.add_argument('--out', required=True)
    a = ap.parse_args(argv)
    m = build(a.folder, json.loads(Path(a.flavours).read_text()), a.out)
    print(json.dumps(dict(totals=m['totals'], flavours_without_picture=[f['name'] for f in m['flavours_without_picture']]), indent=1))


if __name__ == '__main__':
    main()
