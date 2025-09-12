import os
import pandas as pd
import numpy as np
import math

# --- KONFIGURACE SOUBORŮ --------------------------------------------
input_file = r"C:\Users\mspan\Desktop\CEPRO_04062025_robot\Podklad pro výpočet Compass angle z akcelerometru_04062025.xlsx"
output_file = r"C:\Users\mspan\Desktop\CEPRO_04062025_robot\CONVERSION_ACC_COMPASS.xlsx"
if not os.path.exists(input_file):
    raise FileNotFoundError(f"Input file not found: {input_file}")

# --- 1) NAČTENÍ DAT A PŘEVOD ČASU ------------------------------
df = pd.read_excel(input_file, engine='openpyxl')
# Očekáváme sloupce: TIME, SPEED, X, Y
df.columns = df.columns.str.strip()
df['TIME'] = pd.to_datetime(df['TIME'], format='%H:%M:%S')
base_date = df['TIME'].dt.normalize().iloc[0]
df['TIME'] = df['TIME'].apply(lambda t: t.replace(
    year=base_date.year, month=base_date.month, day=base_date.day
))

# --- 2) DEFINICE ČASOVÝCH SEGMENTŮ ---------------------------------
# Použijeme stejnou časovou sekvenci jako v parametrizaci
segment_seq = ['ENTRY','A','B','B_mezanin','C','D','E','F','B_return','G','B_final','A_return','ENTRY_return']
time_strs   = ['06:54:44','06:55:35','06:57:00','06:58:10','06:58:47',
               '07:00:40','07:03:21','07:06:16','07:08:46','07:09:48',
               '07:12:04','07:13:11','07:15:48']
times = [pd.to_datetime(ts, format='%H:%M:%S').replace(
    year=base_date.year, month=base_date.month, day=base_date.day
) for ts in time_strs]
intervals = list(zip(segment_seq, times, times[1:]+[None]))
mapping = {'B_return':'B','B_final':'B','A_return':'A','ENTRY_return':'ENTRY'}

def assign_raw_segment(ts):
    for name, start, end in intervals:
        if end is None and ts >= start:
            return name
        if start <= ts < end:
            return name
    return None

# Aplikace segmentace
df['seg_raw'] = df['TIME'].apply(assign_raw_segment)
df['segment'] = df['seg_raw'].map(lambda s: mapping.get(s, s))

# --- 3) KALIBRACE AKCELEROMETRU -------------------------------------
offset_X = df.loc[0, 'X']
offset_Y = df.loc[0, 'Y']
# Startovní Z není v tomto datovém souboru

df['X_cal'] = df['X'] - offset_X
df['Y_cal'] = df['Y'] - offset_Y

# --- 4) GPS-VEKTOR A ZAROVNÁNÍ DLE FIXNÍCH BEARINGŮ -----------------
# Nemáme GPS zde, proto použijeme orientaci segmentu pro zarovnání
bearing_base = {
    'ENTRY':272,'A':293,'B':270,'B_mezanin':354,
    'C':270,'D':200,'E':114,'F':64,'G':200
}

def compute_theta(raw):
    b = bearing_base.get(mapping.get(raw, raw), np.nan)
    if raw.endswith('_return'):
        b = (b + 180) % 360
    return np.deg2rad(b)

# Theta pro každý řádek podle segmentu
df['theta'] = df['seg_raw'].apply(compute_theta)
# Zarovnáme akceleraci: boční složku X_cal a Y_cal otáčíme o -theta
# Využijeme komplexní číslo vec = X_cal + i*Y_cal
vec = df['X_cal'] + 1j * df['Y_cal']
df['vec_aligned'] = vec * np.exp(-1j * df['theta'])

# --- 5) VÝPOČET BOČNÍ RYCHLOSTI A ZRYCHLENÍ -------------------------
# lat_vel = imaginární část vec_aligned v m/s
# protože X,Y v m/s²? Původně jsou v m/s², bereme je jako akceleraci
# pro yaw_rate integraci využijeme Y_cal přímo (boční accel)

# Nově: lat_accel = imag(vec_aligned) je boční akcelerace v m/s²
df['lat_accel'] = df['vec_aligned'].apply(lambda v: v.imag)
# Yaw rate [rad/s] ~ lat_accel / speed

df['yaw_rate'] = df.apply(
    lambda r: r['lat_accel'] / r['SPEED'] if r['SPEED'] > 0 else 0.0,
    axis=1
)

# --- 6) INTEGRACE YAW_RATE PRO HEADING -------------------------------
df['dt'] = df['TIME'].diff().dt.total_seconds().fillna(0)
df['dtheta_int'] = df['yaw_rate'] * df['dt']
df['theta_int'] = df['dtheta_int'].cumsum()
# konečný heading v rad

# --- 7) KLASIFIKACE ZATÁČEK DEPENDING ON TRANSITIONS ----------------
transitions = {('C','D'),('D','E'),('E','F'),('F','B'),('B','G'),('G','B')}
df['next_raw'] = df['seg_raw'].shift(-1)
df['is_turn_seg'] = df.apply(lambda r: (r['seg_raw'], r['next_raw']) in transitions, axis=1)

small_thr = 0.5  # drobné odchylky boční akcelerace

def classify(r):
    v = r['lat_accel']
    if r['is_turn_seg']:
        # U ostrých přechodů použijeme opačné znaménko lat_accel, aby odpovídalo skutečnému směru
        return 'turn_left' if v > 0 else 'turn_right'
    # V rámci segmentu jen drobné driftování
    if v > small_thr:
        return 'slightly_right'
    if v < -small_thr:
        return 'slightly_left'
    return 'straight'

# --- 8) VÝPOČET FINÁLNÍHO KOMPAS KONTINUALLY --- ------------------------
# Základ = fixní bearing base_bearing + integrované yaw
# Přepočet intheading na stupně
df['compass_angle'] = (np.degrees(df['theta_int']) +
                        df['segment'].map(bearing_base)) % 360

# --- 9) ULOŽENÍ VÝSLEDKŮ ---------------------------------------------
cols_out = ['TIME','SPEED','segment','X_cal','Y_cal','lat_accel',
            'turn_dir','compass_angle']
df[cols_out].to_excel(output_file, index=False)
print(f"Výsledky uloženy do: {output_file}")
