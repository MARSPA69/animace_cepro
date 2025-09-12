import pandas as pd
from geopy.distance import distance
import math

# Parametry
soubor = r"C:\Users\mspan\Desktop\SEGMENT.xlsx"
šířka_obdélníku = 8  # v metrech

# Načti data
df = pd.read_excel(soubor, sheet_name=0)
if 'LAT' not in df.columns or 'LON' not in df.columns:
    raise ValueError("Soubor musí obsahovat sloupce 'LAT' a 'LON'.")

# Pomocná funkce – výpočet rohů
def vypocet_rohu(p1, p2, šířka):
    lat1, lon1 = p1
    lat2, lon2 = p2
    # azimut
    dx = lon2 - lon1
    dy = lat2 - lat1
    bearing = math.degrees(math.atan2(dx, dy))

    # kolmice na bearing (±90°)
    bearingL = (bearing - 90) % 360
    bearingR = (bearing + 90) % 360

    bodL1 = distance(meters=šířka / 2).destination((lat1, lon1), bearingL)
    bodR1 = distance(meters=šířka / 2).destination((lat1, lon1), bearingR)
    bodL2 = distance(meters=šířka / 2).destination((lat2, lon2), bearingL)
    bodR2 = distance(meters=šířka / 2).destination((lat2, lon2), bearingR)

    # A, B, C, D = L1, L2, R2, R1
    return {
        'A_lat': bodL1.latitude, 'A_lon': bodL1.longitude,
        'B_lat': bodL2.latitude, 'B_lon': bodL2.longitude,
        'C_lat': bodR2.latitude, 'C_lon': bodR2.longitude,
        'D_lat': bodR1.latitude, 'D_lon': bodR1.longitude
    }

# Výpočet pro každý segment mezi dvěma po sobě jdoucími body
rohy = []
for i in range(len(df) - 1):
    stred1 = (df.loc[i, 'LAT'], df.loc[i, 'LON'])
    stred2 = (df.loc[i + 1, 'LAT'], df.loc[i + 1, 'LON'])
    rohy.append(vypocet_rohu(stred1, stred2, šířka_obdélníku))

# Výstupní tabulka
df_rohy = pd.DataFrame(rohy)

# Ulož výstup do nového listu ve stejném souboru
with pd.ExcelWriter(soubor, mode='a', engine='openpyxl', if_sheet_exists='replace') as writer:
    df_rohy.to_excel(writer, sheet_name='ROHY', index=False)

print("Hotovo. Souřadnice rohů uloženy v listu 'ROHY'.")
