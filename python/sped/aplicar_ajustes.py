"""
Script para aplicar ajustes no SPED e gerar arquivo ajustado
"""
import sys
import json
from pathlib import Path

# Adicionar diretório pai ao path para imports absolutos
sped_dir = Path(__file__).parent.resolve()
if str(sped_dir) not in sys.path:
    sys.path.insert(0, str(sped_dir))

# Import do módulo ajuste usando import direto do arquivo
import importlib.util
gerador_path = sped_dir / 'ajuste' / 'gerador_sped_ajustado.py'
spec = importlib.util.spec_from_file_location("ajuste.gerador_sped_ajustado", gerador_path)
gerador_module = importlib.util.module_from_spec(spec)
# Adicionar ao sys.modules para que imports internos funcionem
sys.modules["ajuste"] = type(sys)('ajuste')
sys.modules["ajuste.gerador_sped_ajustado"] = gerador_module
spec.loader.exec_module(gerador_module)
GeradorSpedAjustado = gerador_module.GeradorSpedAjustado

def main():
    if len(sys.argv) < 4:
        print(json.dumps({"error": "Argumentos insuficientes"}))
        sys.exit(1)
    
    sped_path = Path(sys.argv[1])
    ajustes_path = Path(sys.argv[2])
    output_path = Path(sys.argv[3])
    
    try:
        # Carregar ajustes selecionados
        ajustes_data = json.loads(ajustes_path.read_text(encoding='utf-8'))
        
        # Gerar SPED ajustado
        gerador = GeradorSpedAjustado(sped_path)
        caminho_ajustado = gerador.aplicar_ajustes(ajustes_data)
        
        # Copiar para o caminho de saída esperado
        import shutil
        shutil.copy2(caminho_ajustado, output_path)
        
        print(json.dumps({
            "success": True,
            "message": f"SPED ajustado gerado com sucesso",
            "output": str(output_path)
        }))
        
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()

