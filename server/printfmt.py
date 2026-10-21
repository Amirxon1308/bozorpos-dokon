"""Termoprinter (ESC/POS) uchun matnli chek: 58 mm = 32 belgi, 80 mm = 48 belgi.

Maxsus belgilar (print-agent ularni ESC/POS buyruqlariga aylantiradi):
  "#B " - ikki karra kenglik va balandlik (qator uzunligi yarmiga tushadi)
  "#H " - ikki karra balandlik
"""
import re
import textwrap

_MAP = {"ʻ": "'", "ʼ": "'", "’": "'", "‘": "'", "`": "'", "´": "'", "“": '"', "”": '"', "«": '"', "»": '"',
        "−": "-", "–": "-", "—": "-", "×": "x", "№": "No", "·": "-", "•": "-", "…": "...", " ": " ", " ": " "}


def clean(s) -> str:
    s = "" if s is None else str(s)
    s = "".join(_MAP.get(ch, ch) for ch in s)
    s = re.sub(r"[\r\n\t]+", " ", s)
    return "".join(ch if (32 <= ord(ch) < 127 or ord(ch) > 159) else "?" for ch in s).strip()


def cols_for(width: int) -> int:
    return 48 if int(width) >= 80 else 32


def money(n) -> str:
    try:
        v = int(round(float(n or 0)))
    except (TypeError, ValueError):
        v = 0
    return f"{v:,}".replace(",", " ")


def qty(n) -> str:
    try:
        f = float(n)
    except (TypeError, ValueError):
        return "1"
    return str(int(f)) if f == int(f) else str(round(f, 3)).replace(".", ",")


def center(s: str, cols: int) -> list[str]:
    return [ln.center(cols).rstrip() for ln in (textwrap.wrap(clean(s), cols) or [""])]


def lr(left: str, right: str, cols: int) -> list[str]:
    left, right = clean(left), clean(right)
    room = cols - len(right) - 1
    if room < 4:
        return textwrap.wrap(left, cols) + [right.rjust(cols)]
    parts = textwrap.wrap(left, room) or [""]
    parts[-1] = parts[-1].ljust(room) + " " + right
    return parts


def line(cols: int) -> str:
    return "-" * cols


def kitchen(p: dict, cols: int) -> list[str]:
    out = []
    big = cols // 2
    out += ["#B " + ln for ln in center(p.get("table", ""), big)]
    if p.get("extra"):
        out += center("*** QO'SHIMCHA ***", cols)
    out += center(" - ".join(x for x in (p.get("waiter"), p.get("when")) if x), cols)
    if p.get("no"):
        out += center(f"Buyurtma No {p['no']}", cols)
    out.append(line(cols))
    for it in p.get("items", []):
        row = f"{qty(it.get('qty', 1))} x {clean(it.get('name'))}"
        out += ["#H " + ln for ln in (textwrap.wrap(row, cols, subsequent_indent="    ") or [""])]
        if it.get("note"):
            out += ["   * " + ln for ln in textwrap.wrap(clean(it["note"]), cols - 5)]
    out.append(line(cols))
    return out


def receipt(p: dict, cols: int) -> list[str]:
    st = p.get("store", {}) or {}
    out = ["#H " + ln for ln in center(st.get("name", ""), cols)]
    for k in ("address", "phone"):
        if st.get(k):
            out += center(st[k], cols)
    out.append(line(cols))
    no = p.get("no")
    out += lr(f"Chek No {str(no).zfill(5)}" if no not in (None, "") else "Chek", p.get("when", ""), cols)
    if p.get("table"):
        out += lr("Stol", p["table"], cols)
    if p.get("cashier"):
        out += lr("Kassir", p["cashier"], cols)
    out.append(line(cols))
    for it in p.get("items", []):
        out += textwrap.wrap(clean(it.get("name")), cols) or [""]
        q, pr = it.get("qty", 1), it.get("price", 0)
        out += lr(f"  {qty(q)} x {money(pr)}", money(round(float(q) * float(pr) / 100) * 100), cols)
    out.append(line(cols))
    if p.get("discount"):
        out += lr("Chegirma", "-" + money(p["discount"]), cols)
    if p.get("service"):
        out += lr("Xizmat haqi", money(p["service"]), cols)
    out += ["#H " + ln for ln in lr("JAMI", money(p.get("total", 0)), cols)]
    if p.get("pay"):
        out += lr("To'lov", clean(p["pay"]), cols)
    out.append(line(cols))
    if st.get("footer"):
        out += center(st["footer"], cols)
    return out


def render(kind: str, payload: dict, width: int) -> str:
    cols = cols_for(width)
    lines = kitchen(payload, cols) if kind == "kitchen" else receipt(payload, cols)
    return "\n".join(lines) + "\n"
