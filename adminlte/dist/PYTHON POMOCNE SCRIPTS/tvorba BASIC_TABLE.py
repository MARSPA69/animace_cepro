import pandas as pd
import re
from datetime import time, datetime, timedelta

# --- Cesty ---
path_gnss = r"C:\Users\mspan\Desktop\ČEPRO DATA\30042025\CEPRO_30042025\GNSS_30042025_Velocity.xlsx"
path_basic_before = r"C:\Users\mspan\Desktop\ČEPRO DATA\30042025\CEPRO_30042025\BASIC_TABLE_30042025_before.xlsx"
path_out = r"C:\Users\mspan\Desktop\ČEPRO DATA\30042025\CEPRO_30042025\BASIC_TABLE_30042025.xlsx"

# --- Pomocné funkce ---
def extract_hms_str(s: str):
    """Z libovolného textu vytáhne první výskyt H:MM:SS nebo HH:MM:SS a vrátí jako 'HH:MM:SS'."""
    if s is None:
        return None
    s = str(s).strip()
    m = re.search(r'(\d{1,2}):(\d{2}):(\d{2})', s)
    if not m:
        return None
    h = int(m.group(1))
    m2 = int(m.group(2))
    s2 = int(m.group(3))
    if not (0 <= h <= 99 and 0 <= m2 < 60 and 0 <= s2 < 60):
        return None
    return f"{h:02d}:{m2:02d}:{s2:02d}"

def excel_time_to_hms_str(v):
    """
    Pokud je v Excelu čas uložený jako číslo (zlomek dne), převede ho na 'HH:MM:SS'.
    Jinak vrátí None.
    """
    try:
        fv = float(v)
    except:
        return None
    # Excel time = zlomek dne
    if 0 <= fv < 1.5:  # tolerance (někdy může být 1.000xxx = 24:00:xx)
        total_seconds = int(round((fv % 1) * 24 * 3600))
        h = (total_seconds // 3600) % 24
        m = (total_seconds % 3600) // 60
        s = total_seconds % 60
        return f"{h:02d}:{m:02d}:{s:02d}"
    return None

def normalize_time_series(series: pd.Series) -> pd.Series:
    """
    Snaží se robustně převést různé formáty času na přesné 'HH:MM:SS'.
    Zkouší Timestamp/time, přesný formát, regex i Excel-čas jako číslo.
    """
    out = []
    for v in series:
        # 1) Pokud je to pandas Timestamp / datetime / time
        if isinstance(v, pd.Timestamp):
            out.append(v.strftime("%H:%M:%S"))
            continue
        if isinstance(v, datetime):
            out.append(v.strftime("%H:%M:%S"))
            continue
        if isinstance(v, time):
            out.append(v.strftime("%H:%M:%S"))
            continue

        # 2) Zkus přímý parse přes to_datetime s více formáty
        parsed = None
        for fmt in ("%H:%M:%S", "%H:%M", "%H.%M.%S", "%H.%M"):
            try:
                dt = pd.to_datetime(str(v), format=fmt)
                parsed = dt.strftime("%H:%M:%S")
                break
            except Exception:
                pass

        if parsed:
            out.append(parsed)
            continue

        # 3) Zkus regex z textu
        hms = extract_hms_str(v)
        if hms:
            out.append(hms)
            continue

        # 4) Zkus Excel-čas jako číslo
        hms = excel_time_to_hms_str(v)
        if hms:
            out.append(hms)
            continue

        # 5) Jako úplně poslední pokus: free parser (může být pomalý)
        try:
            dt = pd.to_datetime(str(v))
            out.append(dt.strftime("%H:%M:%S"))
        except Exception:
            out.append(None)

    return pd.Series(out, index=series.index, dtype="object")

def find_time_column(df: pd.DataFrame):
    """Najde sloupec s časem – podporuje různé názvy."""
    candidates = [c for c in df.columns if str(c).strip().lower() in ("time", "timestamp", "čas", "cas")]
    if candidates:
        return candidates[0]
    # fallback: hledej sloupec, kde aspoň půlka hodnot obsahuje ':' (typické pro čas)
    colon_cols = []
    for c in df.columns:
        s = df[c].astype(str)
        frac = (s.str.contains(":")).mean()
        if frac >= 0.5:
            colon_cols.append(c)
    return colon_cols[0] if colon_cols else None

# --- Načtení ---
df_gnss = pd.read_excel(path_gnss, dtype=str)   # načti jako text, ať si formát pohlídáme sami
df_basic = pd.read_excel(path_basic_before, dtype=str)

# --- Najdi časové sloupce ---
col_time_gnss = find_time_column(df_gnss)
col_time_basic = find_time_column(df_basic)

if col_time_gnss is None or col_time_basic is None:
    raise RuntimeError(f"Nenalezen časový sloupec. GNSS má: {df_gnss.columns.tolist()}  BASIC má: {df_basic.columns.tolist()}")

# --- Normalizace času na 'HH:MM:SS' ---
df_gnss["__TIME_NORM__"] = normalize_time_series(df_gnss[col_time_gnss])
df_basic["__TIME_NORM__"] = normalize_time_series(df_basic[col_time_basic])

# --- Velocity: převod desetinné čárky, název sloupce ---
vel_col = None
for c in df_gnss.columns:
    if str(c).strip().lower() in ("velocity_m_s", "velocity", "speed", "v"):
        vel_col = c
        break
if vel_col is None:
    # Pokud je sloupec označený jako 'D' apod., zkusíme najít číselný sloupec s nenulovými hodnotami
    # (poslední možnost – uprav podle reality souboru)
    raise RuntimeError(f"Nenalezen sloupec s rychlostí v GNSS. Sloupce: {df_gnss.columns.tolist()}")

# vyrob čistě numerickou rychlost
vel_series = df_gnss[vel_col].astype(str).str.replace(",", ".", regex=False)
vel_series = pd.to_numeric(vel_series, errors="coerce")
gnss_map = (
    pd.DataFrame({"__TIME_NORM__": df_gnss["__TIME_NORM__"], "velocity_m_s": vel_series})
    .dropna(subset=["__TIME_NORM__"])
    .drop_duplicates(subset=["__TIME_NORM__"], keep="first")  # kdyby byly duplicitní časy v GNSS, vezmeme první
    .set_index("__TIME_NORM__")["velocity_m_s"]
    .to_dict()
)

# --- Připrav SPEED jen pro první po sobě jdoucí výskyt stejného času ---
df_basic["SPEED"] = pd.NA
is_first_occurrence = df_basic["__TIME_NORM__"].ne(df_basic["__TIME_NORM__"].shift(1))

assigned = 0
for idx, (t_norm, first_flag) in enumerate(zip(df_basic["__TIME_NORM__"], is_first_occurrence)):
    if first_flag and pd.notna(t_norm):
        v = gnss_map.get(t_norm, pd.NA)
        if pd.notna(v):
            df_basic.at[idx, "SPEED"] = v
            assigned += 1

# --- Diagnostika ---
n_basic_times = df_basic["__TIME_NORM__"].notna().sum()
n_gnss_times = df_gnss["__TIME_NORM__"].notna().sum()
intersect = len(set(df_basic["__TIME_NORM__"].dropna().unique()) & set(df_gnss["__TIME_NORM__"].dropna().unique()))
print(f"[INFO] BASIC: {n_basic_times} parsovaných časů; GNSS: {n_gnss_times} parsovaných časů; průnik unikátních časů: {intersect}")
print(f"[INFO] Přiřazených SPEED na prvních výskytech: {assigned}")

# --- Seřazení sloupců ve výstupu ---
desired = ["TIME", "SPEED", "X", "Y", "Z", "KOTVA1", "KOTVA2", "KOTVA3", "KOTVA4", "KOTVA5", "KOTVA6"]
# Přemapuj, pokud vstup nepoužíval 'TIME' jako název
if "TIME" not in df_basic.columns:
    # vytvoříme 'TIME' z normalizace, aby byl ve výstupu jasný sloupec
    df_basic["TIME"] = df_basic["__TIME_NORM__"]

# zachovej pouze existující + požadované pořadí
cols_out = [c for c in desired if c in df_basic.columns]
# přidej zbytek sloupců, které existují, ale nejsou v desired (na konec)
cols_out += [c for c in df_basic.columns if c not in cols_out and not c.startswith("__")]

# --- Uložit ---
df_basic[cols_out].to_excel(path_out, index=False)
print(f"[OK] Uloženo: {path_out}")
