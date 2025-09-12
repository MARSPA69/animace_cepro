import folium
import os

# 1. Získání 9 souřadnic od uživatele
points = []
print("Zadej 9 GPS souřadnic ve formátu lat,lng (např. 50.0,15.0):")
for i in range(9):
    while True:
        try:
            user_input = input(f"Souřadnice {i+1}: ").strip()
            lat, lng = map(float, user_input.split(","))
            points.append((lat, lng))
            break
        except Exception:
            print("❌ Neplatný formát. Zadej znovu ve formátu lat,lng")

# 2. Uzavření polygonu (první bod na konec)
if points[0] != points[-1]:
    points.append(points[0])

# 3. Vytvoření mapy a vykreslení polygonu
center_lat, center_lng = points[0]
m = folium.Map(location=[center_lat, center_lng], zoom_start=17)

# Vykreslit polygon
folium.Polygon(points, color="blue", fill=True, fill_opacity=0.4).add_to(m)

# Očíslované body
for i, (lat, lng) in enumerate(points[:-1]):  # poslední je stejný jako první
    folium.CircleMarker(location=(lat, lng), radius=4, color="red", fill=True, fill_opacity=1,
                        tooltip=f"Bod {i+1}").add_to(m)

# 4. Uložit výstup
output_path = r"C:\Users\mspan\Downloads\mapa.html"
m.save(output_path)
print(f"✅ Mapa polygonu uložena do: {output_path}")
