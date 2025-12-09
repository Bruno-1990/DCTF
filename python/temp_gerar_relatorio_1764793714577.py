
import sys
import os
sys.path.insert(0, r'C:\\Users\\bruno\\Desktop\\DCTF WEB\\DCTF_MPC\\python')

from banco_horas_sci import gerar_ficha_horas
from datetime import date

try:
    # Converter datas
    data_inicial_parts = '2023-01-01'.split('-')
    data_final_parts = '2025-12-31'.split('-')
    data_inicial = date(int(data_inicial_parts[0]), int(data_inicial_parts[1]), int(data_inicial_parts[2]))
    data_final = date(int(data_final_parts[0]), int(data_final_parts[1]), int(data_final_parts[2]))
    
    # Gerar relatório
    df = gerar_ficha_horas('09471676000138', data_inicial=data_inicial, data_final=data_final)
    
    if df is not None:
        print("SUCCESS")
        sys.exit(0)
    else:
        print("ERROR: Falha ao gerar relatório")
        sys.exit(1)
except Exception as e:
    print(f"ERROR: {str(e)}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
