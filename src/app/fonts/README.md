# Onest font files

The app's typeface, [Onest](https://fonts.google.com/specimen/Onest), is kept in this folder
so that a build never has to download it. Before 5 October 2026 `next/font/google` fetched
these same files from Google during every build, and a failed download failed the build.

## What is here

| File                       | Subset       | Bytes | SHA256                                                             |
| -------------------------- | ------------ | ----- | ------------------------------------------------------------------ |
| `onest-latin.woff2`        | latin        | 33808 | `cc61cbd632bb677cd55f0eec9ebdd3e1525c5f30904cbf0769e2ac50d0fba992` |
| `onest-latin-ext.woff2`    | latin-ext    | 28428 | `f72bdc75595bf844f68b15e18dae7eb4f5829b633c402201c8e036d1dfc5f17b` |
| `onest-symbols.woff2`      | symbols      | 18164 | `5977fb8a281a636793b099a3929ad9919e38af52c494a45603930e4a3b4ecc7c` |
| `onest-math.woff2`         | math         | 25460 | `27a244d81d9faa46ec5167cb642167e1dce0e60a240ba203c93aff1b6bdad899` |
| `onest-vietnamese.woff2`   | vietnamese   | 12436 | `505038d86b7b8f24704b1376f3485d60fadda767eb1c2196c3b07a9855c68d93` |
| `onest-cyrillic.woff2`     | cyrillic     | 15828 | `c3f4223046fb9623a0e92414d2834745cbebb260742e049aff103018b991fd47` |
| `onest-cyrillic-ext.woff2` | cyrillic-ext | 10504 | `8b55db3131aa41d0b0f25dd923c9e1494d7c930d4ca5a1b438b0badcc158f55e` |

They are variable fonts (weight axis). The app uses weights 400 to 700.

- `onest-latin.woff2` is declared in `../layout.tsx` with `next/font/local`, which also
  preloads it.
- The other six are declared in `onest.css` and load only when a page uses a character in
  their range. The peso sign is in `latin-ext` and arrows are in `symbols`.
- `OFL.txt` is the SIL Open Font License 1.1 under which Onest is distributed.

## Where the files came from

Google Fonts, Onest v11, downloaded on 5 October 2026 from the URLs that
`https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700&display=swap` returns
to the request identity Next.js 16.3.3 uses. Each file is byte-identical to the one inside
the last build that downloaded it.

- latin: <https://fonts.gstatic.com/s/onest/v11/gNMKW3F-SZuj7xmf-HYoEoey.woff2>
- latin-ext: <https://fonts.gstatic.com/s/onest/v11/gNMKW3F-SZuj7xmR-HYoEoeyxMI.woff2>
- symbols: <https://fonts.gstatic.com/s/onest/v11/gNMKW3F-SZuj7xnx-HYoEoeyxMI.woff2>
- math: <https://fonts.gstatic.com/s/onest/v11/gNMKW3F-SZuj7xnj-HYoEoeyxMI.woff2>
- vietnamese: <https://fonts.gstatic.com/s/onest/v11/gNMKW3F-SZuj7xmQ-HYoEoeyxMI.woff2>
- cyrillic: <https://fonts.gstatic.com/s/onest/v11/gNMKW3F-SZuj7xmb-HYoEoeyxMI.woff2>
- cyrillic-ext: <https://fonts.gstatic.com/s/onest/v11/gNMKW3F-SZuj7xmS-HYoEoeyxMI.woff2>

`OFL.txt`: <https://github.com/google/fonts/blob/main/ofl/onest/OFL.txt>

## Updating

Replace the files, update the table, and check every `unicode-range` in `onest.css` and
`../layout.tsx` against Google's stylesheet. Then run the Docker visual suite
(`docs/TESTING.md`); a changed glyph shows up there.
