# Design tokens

Taken from the prototype's inline styles. These are exact — use them literally.

## Type

**Onest**, Google Fonts, weights 400 / 500 / 600 / 700.
Fallback stack: `Onest, 'SF Pro Text', -apple-system, system-ui, sans-serif`.

```
Screen title        22–24px / 600 / letter-spacing -.5px
Section heading     18px / 600 / -.3px
Card title          14px / 700
Body                13px / 400 / line-height 1.5
Secondary           12px / 400
Meta, captions      11px / 400–600
Micro labels        9–10px / 600–700 / letter-spacing .04em
Big numbers         20–28px / 600–700 / font-variant-numeric: tabular-nums
```

Every number that can change — money, counts, quantities — uses
`font-variant-numeric: tabular-nums`. Long prose uses `text-wrap: pretty`.

## Colour

### Ink
```
#3A1F14   primary text, near-black brown
#6E574B   secondary text
#66524A   tertiary text / captions
#8A7062   quaternary / disclaimers
#A98A5F   hint text on warm surfaces
```

### Surface
```
#FFFFFF   cards
#FBFAF9   subtle raised
#F8F6F4   inset panel
#F2EEEB   divider fill
#F1EFEE   app background (desktop shell)
#F4F1EE   neutral chip
#FFFDF9   warm card
```

### Line
```
#EDE8E4   default border
#E7E1DC   stronger border
#E4DDD8   scrollbar thumb, muted line
```

### Brand orange — primary action
```
#C24A15   primary button, links
#A93D0F   primary hover / pressed
#E75F23   accent, focus ring, active outline
```

### Customer-facing warm palette
```
#FFF5E5   customer page background
#F0E2CB   customer card border
#EADCC4   warm border
#FFFBF3   warm inset
#FDF3E2   warm highlight
#EFDCB5   warm accent line
#E4D2B4   warm chip border
```

### Semantic
```
success  #1B7A4B text · #14603A strong · #E8F5EE fill · #C6E5D5 border
warning  #95600A text · #7A4E08 strong · #C98A12 dot · #8A5B10 body
danger   #A8231B text · #F2CFCB border
info     #EEF4FE fill · #CFE0FB border
```

## Radius
```
6px    micro tags
8–9px  small chips
11–14px inputs, buttons, small cards
18px   cards
999px  pills, avatars, steppers
```

## Spacing

4 px base. Gaps used: 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 18 px.
Card padding 14 px, screen padding 16 px horizontal / 14 px vertical, 32 px bottom.
Nothing tighter than 44 px tall for anything tappable.

## Shadow
```
0 1px 3px -1px rgba(58,31,20,.22)     resting chip
0 3px 12px -4px rgba(231,95,35,.55)   primary button
0 5px 10px -3px rgba(58,31,20,.28)    hover lift
```

## Motion
```
hcRise     opacity 0 → 1, translateY(8px) → 0, .3s ease-out       screen enter
hcSheet    opacity 0 → 1, translateY(30px) → 0                     bottom sheet
hcFade     opacity 0 → 1, .18s ease-out                            selection ring
hcPop      cubic-bezier(.3,1.5,.5,1), .26s                         item added
hcSpin     rotate 360deg                                           loading
hcBreathe  opacity 1 → .5 → 1                                      live indicator
```
Interaction timing: `transform .14–.16s cubic-bezier(.2,.8,.2,1)`, colour `.18–.2s ease`.
Pressed state is `scale(.9)` on icon buttons, `scale(.98)` on wide buttons.

## Focus

`outline: 2px solid #E75F23; outline-offset: 2px` on `:focus-visible`. Keep it.

## Assets

In `reference/assets/`:
- six product photographs, one per flavour
- three payment QR codes (GCash, Maya, GoTyme) — **live payment details, treat as secrets**
- `mark-solid.png`, `logo-full.png` — current marks. Older `logo.png` / `mark.png` are
  superseded; do not use them.
