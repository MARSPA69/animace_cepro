import pandas as pd
import numpy as np
from math import radians, degrees, sin, cos, atan2
import os

# Funkce pro výpočet azimutu
def calculate_bearing(lat1, lon1, lat2, lon2):
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    dlon = lon2 - lon1
    x = cos(lat2) * sin(dlon)
    y = cos(lat1) * sin(lat2) - sin(lat1) * cos(lat2) * cos(dlon)
    initial_bearing = atan2(x, y)
    initial_bearing_deg = degrees(initial_bearing)
    compass_bearing = (initial_bearing_deg + 360) % 360
    return compass_bearing

# Definice segmentů s doplněným segmentem E
segments = {
    'ENTRY': {'length': 54, 'forward_angle': 272.0, 'backward_angle': 92.0},
    'A': {'length': 68, 'forward_angle': 293.0, 'backward_angle': 113.0},
    'B': {'length': 57, 'forward_angle': 270.0, 'backward_angle': 90.0},
    'B_mezanin': {'length': 24, 'forward_angle': 354.0, 'backward_angle': 174.0},
    'C': {'length': 105, 'forward_angle': 270.0, 'backward_angle': 90.0},
    'D': {'length': 147, 'forward_angle': 200.0, 'backward_angle': 20.0},
    'E': {'length': 160, 'forward_angle': 114.0, 'backward_angle': 294.0},  # Nový segment
    'F': {'length': 132, 'forward_angle': 64.0, 'backward_angle': 244.0},
    'G': {'length': 58, 'forward_angle': 200.0, 'backward_angle': 20.0}
}

# Aktualizované pořadí segmentů podle trasy
segment_sequence = [
    'ENTRY', 'A', 'B', 'B_mezanin', 'C', 'D', 'E', 'F', 'G',  # Cesta tam
    'G', 'F', 'E', 'D', 'C', 'B_mezanin', 'B',  # Návrat z G
    'B', 'A', 'ENTRY'  # Návrat do výchozího bodu
]

# Délka celé trasy
total_track_length = sum(segments[seg]['length'] for seg in set(segment_sequence))

# Kalibrační body
calibration_points = [
    (50.04387796, 15.07550428),
    (50.04387699, 15.07550485),
    (50.04387437, 15.0755053),
    (50.04387368, 15.07550482),
    (50.04387244, 15.07550402)
]

# Načtení dat
input_file = r"C:\Users\mspan\Desktop\CEPRO_04062025_robot\Podklad pro výpočet Compass angle z akcelerometru_04062025.xlsx"
if not os.path.exists(input_file):
    raise FileNotFoundError(f"Vstupní soubor nebyl nalezen: {input_file}")

df = pd.read_excel(input_file)

# Kontrola potřebných sloupců
required_columns = ['TIME', 'SPEED', 'X', 'Y']
for col in required_columns:
    if col not in df.columns:
        raise ValueError(f"Chybějící sloupec: {col}")

# Výpočet počátečního azimutu z kalibračních bodů
start_bearing = calculate_bearing(
    calibration_points[0][0], calibration_points[0][1],
    calibration_points[-1][0], calibration_points[-1][1]
)
calibration_diff = segments['ENTRY']['forward_angle'] - start_bearing

# Zpracování času
df['TIME'] = pd.to_datetime(df['TIME'], format='%H:%M:%S', errors='coerce')
if df['TIME'].isnull().any():
    raise ValueError("Neplatný formát času")
df['time_diff'] = df['TIME'].diff().dt.total_seconds().fillna(0)

# Výpočet vzdálenosti
df['distance'] = df['SPEED'] * df['time_diff']
df['cumulative_distance'] = df['distance'].cumsum()

# Inicializace sloupců
df['segment'] = 'ENTRY'
df['compass_angle'] = float(segments['ENTRY']['forward_angle'])
df['direction'] = 'forward'

# Detekce obratů
df['acc_magnitude'] = np.sqrt(df['X']**2 + df['Y']**2)
turn_threshold = df['acc_magnitude'].quantile(0.9)

# Hlavní výpočet s aktualizovanou trasou
current_direction = 'forward'
current_segment = 'ENTRY'
segment_start_distance = 0.0
segment_index = 0
segment_transitions = []  # Pro sledování změn segmentů
total_sequence_length = sum(segments[seg]['length'] for seg in segment_sequence)

for i in range(len(df)):
    cumulative_dist = df.at[i, 'cumulative_distance']
    
    # Detekce obratu
    if df.at[i, 'acc_magnitude'] > turn_threshold and df.at[i, 'SPEED'] < 0.5:
        current_direction = 'backward' if current_direction == 'forward' else 'forward'
        segment_transitions.append((i, cumulative_dist, current_direction))
    
    # Určení aktuálního segmentu na základě ujeté vzdálenosti
    # Normalizace vzdálenosti na délku celé sekvence
    normalized_dist = cumulative_dist % total_sequence_length
    accumulated_length = 0
    
    # Najdeme aktuální segment v sekvenci
    for seg in segment_sequence:
        seg_length = segments[seg]['length']
        if accumulated_length <= normalized_dist < accumulated_length + seg_length:
            current_segment = seg
            break
        accumulated_length += seg_length
    
    # Výpočet úhlu podle směru
    if current_direction == 'forward':
        angle = segments[current_segment]['forward_angle']
    else:
        angle = segments[current_segment]['backward_angle']
    
    # Kalibrace pro úsek ENTRY
    if current_segment == 'ENTRY' and normalized_dist < segments['ENTRY']['length']:
        angle += calibration_diff
    
    # Uložení výsledků
    df.at[i, 'segment'] = current_segment
    df.at[i, 'compass_angle'] = angle % 360
    df.at[i, 'direction'] = current_direction

# Uložení výsledků
output_file = r"C:\Users\mspan\Desktop\CEPRO_04062025_robot\CONVERSION_ACC_COMPASS.xlsx"
df[['TIME', 'compass_angle', 'segment']].to_excel(output_file, index=False)

print("Výpočet úspěšně dokončen. Výstup uložen do:", output_file)
print(f"Celková délka trasy: {total_sequence_length}m")
print("Detekované změny směru:", segment_transitions)