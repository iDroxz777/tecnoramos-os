"""Builds the Tecnoramos brand files (logo, app icons, favicon, wordmark module).

Run from this folder with fontTools installed and Montserrat.ttf (Google Fonts, OFL)
next to it: the tagline is converted to outlines so the SVGs need no fonts."""
import math
import sys

sys.path.insert(0, "py")
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

H = 100.0          # cap height of the wordmark
SW = 17.0          # stroke width
HS = SW / 2
RC = 12.0          # centerline corner radius
GAP = 27.0         # space between letters


def fmt(v):
    return f"{v:.2f}".rstrip("0").rstrip(".")


def stroke(d):
    return ("stroke", d)


def fill(d):
    return ("fill", d)


def rect(x, y, w, h):
    return fill(f"M{fmt(x)} {fmt(y)}h{fmt(w)}v{fmt(h)}h{fmt(-w)}z")


def poly(points):
    return fill("M" + " L".join(f"{fmt(x)} {fmt(y)}" for x, y in points) + "z")


def diag_thickness(width_run, rise=H):
    """Horizontal thickness of a slanted bar with perpendicular thickness SW."""
    tx = SW
    for _ in range(50):
        theta = math.atan2(rise, width_run - tx)
        tx = SW / math.sin(theta)
    return tx


def letter_T(W=128):
    return W, [stroke(f"M0 {HS}H{W}"), stroke(f"M{W/2} {HS}V{H}")]


def letter_E(W=112):
    top, bot = HS, H - HS
    return W, [
        stroke(f"M{W} {top}H{HS+RC}A{RC} {RC} 0 0 0 {HS} {top+RC}V{bot-RC}A{RC} {RC} 0 0 0 {HS+RC} {bot}H{W}"),
        stroke(f"M{HS} {H/2}H{W*0.82}"),
    ]


def letter_C(W=116):
    top, bot = HS, H - HS
    return W, [stroke(f"M{W} {top}H{HS+RC}A{RC} {RC} 0 0 0 {HS} {top+RC}V{bot-RC}A{RC} {RC} 0 0 0 {HS+RC} {bot}H{W}")]


def letter_N(W=124):
    tx = diag_thickness(W)
    return W, [rect(0, 0, SW, H), rect(W - SW, 0, SW, H), poly([(0, 0), (tx, 0), (W, H), (W - tx, H)])]


def letter_O(W=128):
    return W, [stroke(
        f"M{HS+RC} {HS}H{W-HS-RC}A{RC} {RC} 0 0 1 {W-HS} {HS+RC}V{H-HS-RC}"
        f"A{RC} {RC} 0 0 1 {W-HS-RC} {H-HS}H{HS+RC}A{RC} {RC} 0 0 1 {HS} {H-HS-RC}V{HS+RC}A{RC} {RC} 0 0 1 {HS+RC} {HS}z"
    )]


def letter_R(W=122):
    mid = H / 2 + 2
    leg_end_x = W - SW / math.sin(math.atan2(H - mid, W * 0.45)) / 2
    leg_start_x = W * 0.48
    slope = (leg_end_x - leg_start_x) / (H - mid)
    return W, [
        stroke(f"M{HS} {H}V{HS+RC}A{RC} {RC} 0 0 1 {HS+RC} {HS}H{W-HS-RC}A{RC} {RC} 0 0 1 {W-HS} {HS+RC}"
               f"V{mid-RC}A{RC} {RC} 0 0 1 {W-HS-RC} {mid}H{HS}"),
        stroke(f"M{fmt(leg_start_x)} {mid}L{fmt(leg_end_x + slope*8)} {H+8}"),
    ]


def letter_A(W=136):
    half = W / 2
    alpha = math.atan2(half, H)              # leg angle from vertical
    t = SW / math.cos(alpha)
    a = t * 0.42                             # half of the small flat apex
    # inner edges run parallel to the outer ones, shifted by t horizontally
    k = (half - a) / H
    y_in = H - (half - t) / k
    return W, [poly([(0, H), (half - a, 0), (half + a, 0), (W, H), (W - t, H), (half, y_in), (t, H)])]


def letter_M(W=148, depth=70):
    half = W / 2
    tx = SW / math.sin(math.atan2(depth, half))
    y_in = (half - tx) * depth / half
    return W, [rect(0, 0, SW, H), rect(W - SW, 0, SW, H),
               poly([(0, 0), (tx, 0), (half, y_in), (W - tx, 0), (W, 0), (half, depth)])]


def letter_S(W=118):
    top, mid, bot = HS, H / 2, H - HS
    return W, [stroke(
        f"M{W} {top}H{HS+RC}A{RC} {RC} 0 0 0 {HS} {top+RC}V{mid-RC}A{RC} {RC} 0 0 0 {HS+RC} {mid}"
        f"H{W-HS-RC}A{RC} {RC} 0 0 1 {W-HS} {mid+RC}V{bot-RC}A{RC} {RC} 0 0 1 {W-HS-RC} {bot}H0"
    )]


def build_wordmark():
    first = [letter_T, letter_E, letter_C, letter_N, letter_O]
    second = [letter_R, letter_A, letter_M, letter_O, letter_S]
    x = 0.0
    groups = []
    for builders in (first, second):
        parts = []
        for build in builders:
            w, shapes = build()
            parts.append((x, shapes))
            x += w + GAP
        groups.append(parts)
    return groups, x - GAP


def render_group(parts):
    strokes, fills = [], []
    for x, shapes in parts:
        for kind, d in shapes:
            (strokes if kind == "stroke" else fills).append(f'<path transform="translate({fmt(x)} 0)" d="{d}"/>')
    out = ""
    if strokes:
        out += f'<g fill="none" stroke="currentColor" stroke-width="{fmt(SW)}" stroke-linejoin="round">{"".join(strokes)}</g>'
    if fills:
        out += f'<g fill="currentColor">{"".join(fills)}</g>'
    return out


def tagline_paths(text, cap_height, tracking_em):
    font = TTFont("Montserrat.ttf")
    font = instancer.instantiateVariableFont(font, {"wght": 500})
    upm = font["head"].unitsPerEm
    cap = font["OS/2"].sCapHeight
    scale = cap_height / cap
    glyphs = font.getGlyphSet()
    cmap = font.getBestCmap()
    hmtx = font["hmtx"]
    x = 0.0
    paths = []
    for ch in text:
        name = cmap[ord(ch)]
        adv = hmtx[name][0]
        pen = SVGPathPen(glyphs)
        # font units are y-up; flip into SVG space with the baseline at y=cap_height
        glyphs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, x, cap_height)))
        d = pen.getCommands()
        if d:
            paths.append(d)
        x += adv * scale + tracking_em * upm * scale
    width = x - tracking_em * upm * scale
    return paths, width


def build(navy, blue, tag_color, line_color, with_tagline=True):
    groups, wm_width = build_wordmark()
    tagline = ""
    height = H
    if with_tagline:
        cap = 29.0
        top = H + 46
        paths, tw = tagline_paths("REFRIGERAÇÃO COMERCIAL E INDUSTRIAL", cap, 0.165)
        tx = (wm_width - tw) / 2
        line_gap = 34
        ly = top + cap / 2
        tagline = (
            f'<g fill="{tag_color}" transform="translate({fmt(tx)} {fmt(top)})">'
            + "".join(f'<path d="{d}"/>' for d in paths) + "</g>"
            f'<g stroke="{line_color}" stroke-width="3.2">'
            f'<path d="M0 {fmt(ly)}H{fmt(tx - line_gap)}"/><path d="M{fmt(tx + tw + line_gap)} {fmt(ly)}H{fmt(wm_width)}"/></g>'
        )
        height = top + cap + 6
    body = (
        f'<clipPath id="cap"><rect x="-1" y="0" width="{fmt(wm_width + 2)}" height="{fmt(H)}"/></clipPath>'
        f'<g clip-path="url(#cap)"><g style="color:{navy}">{render_group(groups[0])}</g>'
        f'<g style="color:{blue}">{render_group(groups[1])}</g></g>{tagline}'
    )
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{fmt(wm_width)}" height="{fmt(height)}" '
            f'viewBox="0 0 {fmt(wm_width)} {fmt(height)}" '
            f'role="img" aria-label="Tecnoramos — Refrigeração comercial e industrial">{body}</svg>\n')


def letters_svg(builders, x, y, scale, color, clip_id):
    """Places a run of letters at (x, y); returns the markup and its width."""
    cx = 0.0
    parts = []
    for build_letter in builders:
        w, shapes = build_letter()
        parts.append((cx, shapes))
        cx += w + GAP
    width = cx - GAP
    return (
        f'<clipPath id="{clip_id}"><rect x="-1" y="0" width="{fmt(width + 2)}" height="{fmt(H)}"/></clipPath>'
        f'<g transform="translate({fmt(x)} {fmt(y)}) scale({scale})" clip-path="url(#{clip_id})" style="color:{color}">'
        f'{render_group(parts)}</g>'
    ), width * scale


TECNO = [letter_T, letter_E, letter_C, letter_N, letter_O]
RAMOS = [letter_R, letter_A, letter_M, letter_O, letter_S]


def app_icon(art_width=330, bg="#FFFFFF", top="#0B1B44", bottom="#1F4FD6"):
    """Chosen app icon (option C): the stacked wordmark with the tagline rule."""
    size = 512
    _, w_tecno = letters_svg(TECNO, 0, 0, 1, top, "m1")
    _, w_ramos = letters_svg(RAMOS, 0, 0, 1, bottom, "m2")
    widest = max(w_tecno, w_ramos)
    scale = art_width / widest
    x = (size - widest * scale) / 2
    line_h = H * scale
    gap = 34 * scale
    y1 = (size - (2 * line_h + gap)) / 2 - 10
    y2 = y1 + line_h + gap
    a, _ = letters_svg(TECNO, x, y1, scale, top, "it")
    b, _ = letters_svg(RAMOS, x, y2, scale, bottom, "ir")
    rule_y = y2 + line_h + 30
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}"><rect width="{size}" height="{size}" fill="{bg}"/>'
            f'{a}{b}<path d="M{fmt(x)} {fmt(rule_y)}H{fmt(x + 120 * art_width / 330)}" stroke="{bottom}" stroke-width="7"/></svg>\n')


def favicon():
    """T and R side by side; the stacked icon is unreadable at 16-32 px."""
    size = 512
    _, w_t = letters_svg([letter_T], 0, 0, 1, "#000", "f1")
    _, w_r = letters_svg([letter_R], 0, 0, 1, "#000", "f2")
    scale = 400 / (w_t + GAP + w_r)
    total = (w_t + GAP + w_r) * scale
    x = (size - total) / 2
    y = (size - H * scale) / 2
    a, _ = letters_svg([letter_T], x, y, scale, "#0B1B44", "ft")
    b, _ = letters_svg([letter_R], x + (w_t + GAP) * scale, y, scale, "#1F4FD6", "fr")
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}">'
            f'<rect width="{size}" height="{size}" rx="96" fill="#FFFFFF"/>{a}{b}</svg>\n')


def emit_wordmark_module(path):
    """Writes the wordmark geometry as a TypeScript module for inline rendering."""
    import json
    groups, width = build_wordmark()
    data = []
    for parts in groups:
        strokes, fills = [], []
        for x, shapes in parts:
            for kind, d in shapes:
                (strokes if kind == "stroke" else fills).append({"x": round(x, 2), "d": d})
        data.append({"strokes": strokes, "fills": fills})
    with open(path, "w") as out:
        out.write("// Generated by scripts/brand/make_logo.py — do not edit by hand.\n")
        out.write(f"export const WORDMARK_WIDTH = {fmt(width)};\n")
        out.write(f"export const WORDMARK_HEIGHT = {fmt(H)};\n")
        out.write(f"export const WORDMARK_STROKE = {fmt(SW)};\n")
        out.write("export const WORDMARK_GROUPS = ")
        out.write(json.dumps(data, ensure_ascii=False, indent=2))
        out.write(" as const;\n")


if __name__ == "__main__":
    NAVY, BLUE = "#0B1B44", "#1F4FD6"
    outputs = {
        "logo-tecnoramos.svg": build(NAVY, BLUE, BLUE, BLUE),
        "logo-tecnoramos-white.svg": build("#FFFFFF", "#7FA4FF", "#C9D6FF", "#7FA4FF"),
        "app-icon.svg": app_icon(),
        # Android crops maskable icons to a circle, so the art stays inside the safe zone.
        "app-icon-maskable.svg": app_icon(art_width=270),
        "favicon.svg": favicon(),
    }
    for name, svg in outputs.items():
        with open(name, "w") as out:
            out.write(svg)
    emit_wordmark_module("wordmark-geometry.ts")
    print("ok")
