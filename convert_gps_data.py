#!/usr/bin/env python3
"""
GPS Data Converter
Konvertuje Excel GPS data do JavaScript formátu pro RENDERER
"""

import pandas as pd
import json
from datetime import datetime, timedelta
import os
from pathlib import Path

def convert_time_to_iso(time_str, base_date="2025-06-04"):
    """
    Konvertuje čas ve formátu HH:MM:SS na ISO timestamp
    
    Args:
        time_str (str): Čas ve formátu "6:38:05" nebo "06:38:05"
        base_date (str): Základní datum pro timestamp
    
    Returns:
        str: ISO timestamp string
    """
    try:
        # Parse čas
        if ':' in time_str:
            time_parts = time_str.split(':')
            if len(time_parts) == 3:
                hours, minutes, seconds = map(int, time_parts)
                
                # Vytvoř datetime objekt
                dt = datetime.strptime(f"{base_date} {hours:02d}:{minutes:02d}:{seconds:02d}", "%Y-%m-%d %H:%M:%S")
                
                # Konvertuj na ISO format
                return dt.isoformat() + "Z"
            else:
                print(f"⚠️ Neplatný časový formát: {time_str}")
                return None
        else:
            print(f"⚠️ Neplatný časový formát: {time_str}")
            return None
    except Exception as e:
        print(f"❌ Chyba při konverzi času {time_str}: {e}")
        return None

def convert_excel_to_js(input_path, output_path):
    """
    Konvertuje Excel GPS data do JavaScript formátu
    
    Args:
        input_path (str): Cesta k Excel souboru
        output_path (str): Cesta k výstupnímu JS souboru
    """
    try:
        print(f"🔄 Načítám Excel soubor: {input_path}")
        
        # Načti Excel soubor
        df = pd.read_excel(input_path)
        
        print(f"✅ Excel soubor načten: {len(df)} řádků")
        print(f"📊 Sloupce: {list(df.columns)}")
        
        # Zkontroluj požadované sloupce
        required_columns = ['TIME', 'LAT', 'LONG']
        missing_columns = [col for col in required_columns if col not in df.columns]
        
        if missing_columns:
            print(f"❌ Chybí sloupce: {missing_columns}")
            print(f"📋 Dostupné sloupce: {list(df.columns)}")
            return False
        
        # Konvertuj data
        js_data = []
        
        for index, row in df.iterrows():
            try:
                # Získej hodnoty z řádku
                time_str = str(row['TIME']).strip()
                lat = float(row['LAT'])
                lng = float(row['LONG'])
                
                # Konvertuj čas na ISO timestamp
                timestamp = convert_time_to_iso(time_str)
                
                if timestamp:
                    js_data.append({
                        "timestamp": timestamp,
                        "lat": lat,
                        "lng": lng
                    })
                else:
                    print(f"⚠️ Přeskočen řádek {index + 1} kvůli neplatnému času: {time_str}")
                    
            except Exception as e:
                print(f"⚠️ Chyba při zpracování řádku {index + 1}: {e}")
                continue
        
        print(f"✅ Zpracováno {len(js_data)} platných záznamů")
        
        # Vytvoř JavaScript obsah
        js_content = f"""// RENDERER GPS Data - Generated on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
// Source: {os.path.basename(input_path)}
// Records: {len(js_data)}

window.realData_RENDERER = {json.dumps(js_data, indent=2)};

// Export pro kompatibilitu
if (typeof module !== 'undefined' && module.exports) {{
    module.exports = window.realData_RENDERER;
}}
"""
        
        # Ulož do souboru
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(js_content)
        
        print(f"✅ JavaScript soubor uložen: {output_path}")
        print(f"📊 Celkem záznamů: {len(js_data)}")
        
        # Zobraz ukázku dat
        if js_data:
            print(f"\n📋 Ukázka dat:")
            for i, record in enumerate(js_data[:3]):
                print(f"  {i+1}. {record['timestamp']} - {record['lat']:.6f}, {record['lng']:.6f}")
            
            if len(js_data) > 3:
                print(f"  ... a dalších {len(js_data) - 3} záznamů")
        
        return True
        
    except FileNotFoundError:
        print(f"❌ Soubor nenalezen: {input_path}")
        return False
    except Exception as e:
        print(f"❌ Chyba při konverzi: {e}")
        return False

def main():
    """Hlavní funkce"""
    print("🚀 GPS Data Converter")
    print("=" * 50)
    
    # Cesty k souborům
    input_path = r"C:\Users\mspan\Desktop\demo_zony_app1\EXCEL podklady\Podklad pro RENDERER1_10042025.xlsx"
    output_path = r"C:\Users\mspan\Desktop\demo_zony_app1\EXCEL podklady\RENDERER.js"
    
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
    success = convert_excel_to_js(input_path, output_path)
    
    if success:
        print(f"\n🎉 Konverze úspěšně dokončena!")
        print(f"📁 Výstupní soubor: {output_path}")
    else:
        print(f"\n❌ Konverze selhala!")

if __name__ == "__main__":
    main()
