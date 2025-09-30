#!/usr/bin/env python3
"""
GPS Data Converter - Basic Format
Konvertuje timestamp GPS data do Excel formátu s časem a souřadnicemi
"""

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import os
from pathlib import Path

def convert_timestamp_to_time(timestamp_ms):
    """
    Konvertuje timestamp v milisekundách na čas HH:MM:SS
    
    Args:
        timestamp_ms (int): Timestamp v milisekundách
    
    Returns:
        str: Čas ve formátu HH:MM:SS
    """
    try:
        # Konvertuj timestamp na datetime
        dt = datetime.fromtimestamp(timestamp_ms / 1000)
        return dt.strftime("%H:%M:%S")
    except Exception as e:
        print(f"⚠️ Chyba při konverzi timestampu {timestamp_ms}: {e}")
        return "00:00:00"

def convert_coordinates(lat_raw, lng_raw):
    """
    Konvertuje surové GPS souřadnice do standardního formátu
    
    Args:
        lat_raw (int): Surová zeměpisná šířka
        lng_raw (int): Surová zeměpisná délka
    
    Returns:
        tuple: (lat, lng) jako float hodnoty
    """
    try:
        # Konvertuj na standardní GPS formát
        # Předpokládáme, že data jsou v nějakém interním formátu
        # Potřebujeme zjistit správný převod
        
        # Možnost 1: Data jsou v mikrostupních (microdegrees)
        if lat_raw > 1000000 and lng_raw > 1000000:
            lat = lat_raw / 1000000.0
            lng = lng_raw / 1000000.0
        # Možnost 2: Data jsou v nějakém jiném formátu
        elif lat_raw > 100000 and lng_raw > 100000:
            lat = lat_raw / 1000000.0
            lng = lng_raw / 1000000.0
        # Možnost 3: Data jsou už v správném formátu
        else:
            lat = float(lat_raw)
            lng = float(lng_raw)
        
        return lat, lng
        
    except Exception as e:
        print(f"⚠️ Chyba při konverzi souřadnic {lat_raw}, {lng_raw}: {e}")
        return 0.0, 0.0

def convert_basic_data(input_path, output_path):
    """
    Konvertuje základní GPS data do Excel formátu
    
    Args:
        input_path (str): Cesta k vstupnímu Excel souboru
        output_path (str): Cesta k výstupnímu Excel souboru
    """
    try:
        print(f"🔄 Načítám Excel soubor: {input_path}")
        
        # Načti Excel soubor
        df = pd.read_excel(input_path)
        
        print(f"✅ Excel soubor načten: {len(df)} řádků")
        print(f"📊 Sloupce: {list(df.columns)}")
        
        # Zkontroluj požadované sloupce
        required_columns = ['Timestamp', 'LONG', 'LAT']
        missing_columns = [col for col in required_columns if col not in df.columns]
        
        if missing_columns:
            print(f"❌ Chybí sloupce: {missing_columns}")
            print(f"📋 Dostupné sloupce: {list(df.columns)}")
            return False
        
        # Konvertuj data
        converted_data = []
        
        for index, row in df.iterrows():
            try:
                # Získej hodnoty z řádku
                timestamp_ms = int(row['Timestamp'])
                lng_raw = int(row['LONG'])
                lat_raw = int(row['LAT'])
                
                # Konvertuj timestamp na čas
                time_str = convert_timestamp_to_time(timestamp_ms)
                
                # Konvertuj souřadnice
                lat, lng = convert_coordinates(lat_raw, lng_raw)
                
                # Přidej do výsledku
                converted_data.append({
                    'TIME': time_str,
                    'LAT': lat,
                    'LONG': lng
                })
                
            except Exception as e:
                print(f"⚠️ Chyba při zpracování řádku {index + 1}: {e}")
                continue
        
        print(f"✅ Zpracováno {len(converted_data)} záznamů")
        
        # Vytvoř DataFrame
        result_df = pd.DataFrame(converted_data)
        
        # Ulož do Excel souboru
        result_df.to_excel(output_path, index=False, engine='openpyxl')
        
        print(f"✅ Excel soubor uložen: {output_path}")
        print(f"📊 Celkem záznamů: {len(converted_data)}")
        
        # Zobraz ukázku dat
        if converted_data:
            print(f"\n📋 Ukázka dat:")
            for i, record in enumerate(converted_data[:5]):
                print(f"  {i+1}. {record['TIME']} - {record['LAT']:.6f}, {record['LONG']:.6f}")
            
            if len(converted_data) > 5:
                print(f"  ... a dalších {len(converted_data) - 5} záznamů")
        
        # Zobraz statistiky
        if converted_data:
            lats = [record['LAT'] for record in converted_data]
            lngs = [record['LONG'] for record in converted_data]
            
            print(f"\n📊 Statistiky:")
            print(f"  LAT rozsah: {min(lats):.6f} - {max(lats):.6f}")
            print(f"  LONG rozsah: {min(lngs):.6f} - {max(lngs):.6f}")
        
        return True
        
    except FileNotFoundError:
        print(f"❌ Soubor nenalezen: {input_path}")
        return False
    except Exception as e:
        print(f"❌ Chyba při konverzi: {e}")
        return False

def main():
    """Hlavní funkce"""
    print("🚀 GPS Basic Data Converter")
    print("=" * 50)
    
    # Cesty k souborům
    input_path = r"C:\Users\mspan\Desktop\22072025\RAWDATA_BASIC_ALL.xlsx"
    output_path = r"C:\Users\mspan\Desktop\demo_zony_app1\EXCEL podklady\Podklad pro RENDERER6_22072025.xlsx"
    
    # Zkontroluj existenci vstupního souboru
    if not os.path.exists(input_path):
        print(f"❌ Vstupní soubor neexistuje: {input_path}")
        return
    
    # Zkontroluj výstupní adresář
    output_dir = os.path.dirname(output_path)
    if not os.path.exists(output_dir):
        print(f"📁 Vytvářím výstupní adresář: {output_dir}")
        os.makedirs(output_dir, exist_ok=True)
    
    # Proved konverzi
    success = convert_basic_data(input_path, output_path)
    
    if success:
        print(f"\n🎉 Konverze úspěšně dokončena!")
        print(f"📁 Výstupní soubor: {output_path}")
    else:
        print(f"\n❌ Konverze selhala!")

if __name__ == "__main__":
    main()