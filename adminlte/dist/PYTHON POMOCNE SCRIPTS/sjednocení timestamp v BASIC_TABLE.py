import pandas as pd

# Vstupní a výstupní cesty
path_in = r"C:\Users\mspan\Desktop\ČEPRO DATA\30042025\CEPRO_30042025\BASIC_TABLE_30042025_1.xlsx"
path_out = r"C:\Users\mspan\Desktop\ČEPRO DATA\30042025\CEPRO_30042025\BASIC_TABLE_30042025.xlsx"

# Načíst soubor
df = pd.read_excel(path_in, dtype=str)

# Funkce: vybere první neprázdnou hodnotu ve skupině
def first_nonnull(series):
    for val in series:
        if pd.notna(val) and str(val).strip() != "":
            return val
    return None

# Group by TIME a sloučit hodnoty
df_merged = df.groupby("TIME", as_index=False).agg(first_nonnull)

# Uložit výsledek
df_merged.to_excel(path_out, index=False)
print(f"Hotovo, výstup uložen do: {path_out}")
