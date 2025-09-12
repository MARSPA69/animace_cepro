# convert_mesh_fixedgps_to_js.py
# ----------------------------------------------------------
import pandas as pd
from pathlib import Path


# ▶ Uprav cesty, pokud je máš jinde
SRC = r"C:\Users\mspan\Desktop\NEW_MASHGPS_FOOTPRINT.xlsx"
DST = r"C:\Users\mspan\Desktop\MESH_FIXEDGPS_ANCHFOOTPRINT.js"


def parse_int_list(value) -> list[int]:
    """'42,47,11,41' → [42, 47, 11, 41] (ignoruje prázdná místa)."""
    if pd.isna(value):
        return []
    return [int(x) for x in str(value).split(",") if x.strip()]


def main(src: str, dst: str) -> None:
    df = pd.read_excel(src, engine="openpyxl")

    lines = ["window.meshFixedGpsAnchFootprint = ["]
    for _, row in df.iterrows():
        lat  = row["FIXED_GPS_LAT"]
        lon  = row["FIXED_GPS_LON"]
        fps  = parse_int_list(row["FOOTPRINT"])
        seg  = str(row["SEGMENT"]).strip()

        lines.append(
            "  {"
            f' "lat": {lat},'
            f' "lon": {lon},'
            f' "Footprints": [{", ".join(map(str, fps))}],'
            f' "Segment": "{seg}"'
            " },"
        )

    lines.append("];")
    Path(dst).write_text("\n".join(lines), encoding="utf-8")
    print(f"✅ Hotovo – uložen soubor:\n{dst}")


if __name__ == "__main__":
    main(SRC, DST)
