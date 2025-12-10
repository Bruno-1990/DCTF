"""
Script para processar ajustes identificados no cruzamento XML x SPED
"""
import sys
import json
from pathlib import Path

# Adicionar diretório pai ao path para imports absolutos
sped_dir = Path(__file__).parent.resolve()
if str(sped_dir) not in sys.path:
    sys.path.insert(0, str(sped_dir))

# Importar módulos necessários
from reconcile import build_dataframes

# Import do módulo ajuste usando import direto do arquivo
import importlib.util
ajuste_path = sped_dir / 'ajuste' / 'cruzamento_inteligente.py'
spec = importlib.util.spec_from_file_location("ajuste.cruzamento_inteligente", ajuste_path)
cruzamento_module = importlib.util.module_from_spec(spec)
# Adicionar ao sys.modules para que imports internos funcionem
sys.modules["ajuste"] = type(sys)('ajuste')
sys.modules["ajuste.cruzamento_inteligente"] = cruzamento_module
spec.loader.exec_module(cruzamento_module)
MotorCruzamentoInteligente = cruzamento_module.MotorCruzamentoInteligente

def main():
    if len(sys.argv) < 4:
        print(json.dumps({"error": "Argumentos insuficientes"}))
        sys.exit(1)
    
    sped_path = Path(sys.argv[1])
    xml_dir = Path(sys.argv[2])
    output_path = Path(sys.argv[3])
    
    try:
        # Carregar dados
        print(json.dumps({"progress": 10, "message": "Carregando dados SPED e XMLs..."}))
        materiais = build_dataframes(sped_path, xml_dir)
        
        # Executar cruzamento inteligente
        print(json.dumps({"progress": 50, "message": "Analisando divergências com regras fiscais..."}))
        motor = MotorCruzamentoInteligente(materiais)
        ajustes = motor.analisar_divergencias()
        
        # Salvar resultado
        print(json.dumps({"progress": 90, "message": "Salvando ajustes identificados..."}))
        output_path.write_text(
            json.dumps(ajustes, default=str, ensure_ascii=False, indent=2),
            encoding='utf-8'
        )
        
        print(json.dumps({
            "progress": 100,
            "message": "Ajustes identificados com sucesso",
            "total": len(ajustes)
        }))
        
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()

