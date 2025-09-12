# dl_9tiles_openzu.py
import pathlib, io, zipfile, requests, urllib3

urllib3.disable_warnings()                  # potlačí TLS warningy
OUT = pathlib.Path(r"C:\Users\mspan\Desktop\CUZK_TILES")
OUT.mkdir(parents=True, exist_ok=True)

TILES = {
    "Z2_1M_N50d01m00s_E013d20m00s": "190_2770",
    "Z2_1M_N50d01m00s_E014d20m00s": "226_2770",
    "Z2_1M_N50d01m00s_E015d20m00s": "261_2770",
    "Z2_1M_N50d02m00s_E013d20m00s": "190_2771",
    "Z2_1M_N50d02m00s_E014d20m00s": "226_2771",   # center
    "Z2_1M_N50d02m00s_E015d20m00s": "261_2771",
    "Z2_1M_N50d03m00s_E013d20m00s": "190_2772",
    "Z2_1M_N50d03m00s_E014d20m00s": "226_2772",
    "Z2_1M_N50d03m00s_E015d20m00s": "261_2772",
}

BASE = "https://openzu.cuzk.gov.cz/opendata/OI"

def fetch(url):
    try:
        return requests.get(url, timeout=120,
                            headers={"User-Agent": "Mozilla/5.0"},
                            verify=False)          # TLS bez kontroly CA
    except requests.exceptions.RequestException as e:
        print("   ⚠️", e)
        return None

for tid, code in TILES.items():
    zip_url = f"{BASE}/{code}.zip"
    jp2 = OUT / f"{tid}.jp2"
    j2w = OUT / f"{tid}.j2w"

    if jp2.exists() and j2w.exists():
        print(f"✓ {tid} už uložen")
        continue

    print("⬇", tid, "→", zip_url)
    r = fetch(zip_url)
    if not r or r.status_code != 200:
        print("   ⚠️ ZIP nedostupný, kód:", r.status_code if r else "žádný")
        continue

    with zipfile.ZipFile(io.BytesIO(r.content)) as z:
        for n in z.namelist():
            if n.lower().endswith(".jp2"):
                jp2.write_bytes(z.read(n))
            elif n.lower().endswith(".j2w"):
                j2w.write_bytes(z.read(n))
    print("   ✓ uložen JP2 + J2W")

print("\nHotovo – devět dlaždic v", OUT)
