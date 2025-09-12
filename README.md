# Animace ČEPRO

Projekt pro vizualizaci pohybu na mapě pomocí **Leaflet + AdminLTE**.  
Obsahuje:
- `adminlte/dist/renderer.js` – hlavní logika animace
- `adminlte/dist/index.html` – dashboard s mapou
- `adminlte/dist/FUSED_GPS.js` – výpočet GPS dat
- datasety (`RENDERERDATA1.js`, `RENDERERDATA1.json`)
- styly (`assets.css`)

## Jak spustit
1. Otevři `index.html` v prohlížeči
2. Animace se načte s datasetem a zobrazí na mapě

## Poznámky
- `.env` obsahuje privátní klíče → není součástí repozitáře
- Projekt využívá GitHub + Continue/Claude pro orchestraci kódu
