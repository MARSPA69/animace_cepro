import json
from datetime import datetime, timezone
import openpyxl
from openpyxl import Workbook

ROBOT_RADIUS_M = 0.3
input_file_path  = r"C:\Users\mspan\Desktop\rychlost_robot.txt"
output_file_path = r"C:\Users\mspan\Desktop\rychlost_robot.xlsx"

wb = Workbook()
ws = wb.active
ws.title = "Rychlost robota"
ws.append(['TIME (hh:mm:ss)', 'SPEED [m/s]', 'TURN SPEED [rad/s]', 'TURN SPEED [m/s]'])

with open(input_file_path, 'r', encoding='utf-8-sig') as f:
    for raw_line in f:
        # odstraň kontrolní znak a obalové uvozovky
        line = raw_line.strip().lstrip('\x1a')
        if not line or "{" not in line:
            continue

        # nejprve jednou rozkóduj JSON
        try:
            data = json.loads(line)
        except json.JSONDecodeError as e:
            print(f"❌ Nelze dekódovat JSON ze řádku: {line}")
            print("   ", e)
            continue

        # pokud to byl string, rozkóduj znovu
        if isinstance(data, str):
            try:
                data = json.loads(data)
            except json.JSONDecodeError as e:
                print(f"❌ Podruhé nelze dekódovat JSON ze stringu: {data}")
                print("   ", e)
                continue

        try:
            ts = float(data['timestamp'])
            hs = float(data['heading_speed'])
            tr = float(data['turn_speed'])
        except (KeyError, ValueError, TypeError) as e:
            print(f"❌ Chybná struktura dat: {data}")
            print("   ", e)
            continue

        time_str = datetime.fromtimestamp(ts, tz=timezone.utc).strftime('%H:%M:%S')
        lin_turn = round(tr * ROBOT_RADIUS_M, 4)

        ws.append([
            time_str,
            round(hs, 4),
            round(tr, 4),
            lin_turn
        ])

wb.save(output_file_path)
print(f"✅ Hotovo, data v {output_file_path}")
