
import sys
import os
sys.path.insert(0, r'C:\\Users\\bruno\\Desktop\\DCTF WEB\\DCTF_MPC\\python')

from banco_horas_sci import gerar_ficha_horas
from datetime import date

try:
    # Converter datas
    data_inicial_parts = '2025-01-01'.split('-')
    data_final_parts = '2025-03-01'.split('-')
    data_inicial = date(int(data_inicial_parts[0]), int(data_inicial_parts[1]), int(data_inicial_parts[2]))
    data_final = date(int(data_final_parts[0]), int(data_final_parts[1]), int(data_final_parts[2]))
    
    # Gerar relatório
    print("[SCRIPT] Iniciando geracao de relatorio...", flush=True)
    df = gerar_ficha_horas('32401481000133', data_inicial=data_inicial, data_final=data_final)
    
    if df is not None and not df.empty:
        print("SUCCESS", flush=True)
        sys.exit(0)
    else:
        print("ERROR: Falha ao gerar relatório - DataFrame vazio ou None", flush=True)
        sys.exit(1)
except Exception as e:
    print(f"ERROR: {str(e)}", flush=True)
    import traceback
    traceback.print_exc()
    sys.exit(1)
