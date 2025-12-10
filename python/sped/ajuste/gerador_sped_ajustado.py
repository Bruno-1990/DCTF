"""
Gerador de SPED Ajustado
Aplica correções identificadas no arquivo SPED original
"""
from pathlib import Path
from typing import List, Dict, Optional
import logging
import sys
from decimal import Decimal, ROUND_HALF_UP

# Ajustar imports para funcionar tanto como módulo quanto como script
try:
    from .cruzamento_inteligente import DivergenciaAjustavel
except (ImportError, ValueError):
    # Se import relativo falhar, tentar absoluto (quando usado como script)
    parent_dir = Path(__file__).parent.parent.resolve()
    if str(parent_dir) not in sys.path:
        sys.path.insert(0, str(parent_dir))
    # Importar diretamente
    from ajuste.cruzamento_inteligente import DivergenciaAjustavel

logger = logging.getLogger(__name__)


class GeradorSpedAjustado:
    """
    Gera arquivo SPED ajustado aplicando correções identificadas
    """
    
    def __init__(self, caminho_sped_original: Path):
        self.caminho_original = caminho_original
        self.linhas_sped: List[str] = []
        self._carregar_sped()
    
    def _carregar_sped(self):
        """Carrega todas as linhas do SPED original"""
        try:
            with open(self.caminho_original, 'r', encoding='latin-1') as f:
                self.linhas_sped = f.readlines()
        except UnicodeDecodeError:
            # Tentar com UTF-8
            with open(self.caminho_original, 'r', encoding='utf-8') as f:
                self.linhas_sped = f.readlines()
    
    def aplicar_ajustes(self, ajustes: List[Dict]) -> Path:
        """
        Aplica ajustes no SPED e retorna caminho do arquivo ajustado
        ajustes: Lista de dicionários com as divergências ajustáveis
        """
        # Converter para objetos DivergenciaAjustavel
        divergencias = []
        for a in ajustes:
            if a.get('pode_ajustar', False):
                divergencias.append(DivergenciaAjustavel(**a))
        
        # Mapear ajustes por chave NF e campo
        ajustes_por_chave: Dict[str, Dict[str, DivergenciaAjustavel]] = {}
        for ajuste in divergencias:
            if ajuste.pode_ajustar:
                if ajuste.chave_nf not in ajustes_por_chave:
                    ajustes_por_chave[ajuste.chave_nf] = {}
                ajustes_por_chave[ajuste.chave_nf][ajuste.campo] = ajuste
        
        # Processar linha por linha
        linhas_ajustadas = []
        c100_atual = None
        c190_ajustes_acumulados: Dict[str, float] = {}  # Acumular ajustes por campo no C190
        
        for linha in self.linhas_sped:
            linha_original = linha.rstrip('\n\r')
            linha_ajustada = linha_original
            
            if linha_original.startswith("|C100|"):
                # Extrair chave NF do C100
                campos = linha_original.split("|")
                if len(campos) > 9:
                    chave_nf = campos[9].strip()
                    c100_atual = chave_nf
                    c190_ajustes_acumulados = {}  # Resetar acumuladores
                    
                    # Ajustar campos do C100 se necessário
                    if chave_nf in ajustes_por_chave:
                        ajustes_c100 = ajustes_por_chave[chave_nf]
                        linha_ajustada = self._ajustar_linha_c100(
                            linha_original, ajustes_c100
                        )
            
            elif linha_original.startswith("|C190|") and c100_atual:
                # Ajustar valores do C190
                if c100_atual in ajustes_por_chave:
                    linha_ajustada, novos_ajustes = self._ajustar_linha_c190(
                        linha_original, ajustes_por_chave[c100_atual], c190_ajustes_acumulados
                    )
                    # Acumular ajustes aplicados
                    for campo, valor in novos_ajustes.items():
                        c190_ajustes_acumulados[campo] = c190_ajustes_acumulados.get(campo, 0) + valor
            
            elif linha_original.startswith("|C170|") and c100_atual:
                # Se houver ajustes no C100 que afetam C170, aplicar aqui se necessário
                # Por enquanto, C170 não é ajustado diretamente
                pass
            
            linhas_ajustadas.append(linha_ajustada + '\n')
        
        # Salvar arquivo ajustado
        caminho_ajustado = self.caminho_original.parent / f"{self.caminho_original.stem}_AJUSTADO{self.caminho_original.suffix}"
        try:
            with open(caminho_ajustado, 'w', encoding='latin-1') as f:
                f.writelines(linhas_ajustadas)
        except UnicodeEncodeError:
            # Tentar com UTF-8
            with open(caminho_ajustado, 'w', encoding='utf-8') as f:
                f.writelines(linhas_ajustadas)
        
        logger.info(f"SPED ajustado salvo em: {caminho_ajustado}")
        return caminho_ajustado
    
    def _ajustar_linha_c100(self, linha: str, ajustes: Dict[str, DivergenciaAjustavel]) -> str:
        """
        Ajusta valores em uma linha C100
        Layout C100: REG(1), IND_OPER(2), IND_EMIT(3), COD_PART(4), COD_MOD(5),
                     COD_SIT(6), SER(7), NUM_DOC(8), CHV_NFE(9), DT_DOC(10),
                     DT_E(11), VL_DOC(12), IND_PGTO(13), VL_DESC(14), VL_ABAT_NT(15),
                     VL_MERC(16), IND_FRT(17), VL_FRT(18), VL_SEG(19), VL_OUT_DA(20),
                     VL_BC_ICMS(21), VL_ICMS(22), VL_BC_ICMS_ST(23), VL_ICMS_ST(24),
                     VL_IPI(25), VL_PIS(26), VL_COFINS(27), VL_PIS_ST(28), VL_COFINS_ST(29)
        """
        campos = linha.split("|")
        
        # Mapear índices dos campos C100 (após split, fs[0]="", fs[1]="C100", ...)
        # VL_DOC está em fs[12] (posição 12 do layout, índice 12 após split)
        # VL_DESC está em fs[14] (índice 14)
        # VL_FRT está em fs[18] (índice 18)
        
        if "VL_DOC" in ajustes:
            ajuste = ajustes["VL_DOC"]
            if len(campos) > 12:
                valor_atual = self._parse_decimal(campos[12] or "0")
                novo_valor = valor_atual + ajuste.valor_ajuste
                campos[12] = self._formatar_decimal(novo_valor)
        
        if "VL_DESC" in ajustes:
            ajuste = ajustes["VL_DESC"]
            if len(campos) > 14:
                valor_atual = self._parse_decimal(campos[14] or "0")
                novo_valor = valor_atual + ajuste.valor_ajuste
                campos[14] = self._formatar_decimal(novo_valor)
        
        if "VL_FRT" in ajustes:
            ajuste = ajustes["VL_FRT"]
            if len(campos) > 18:
                valor_atual = self._parse_decimal(campos[18] or "0")
                novo_valor = valor_atual + ajuste.valor_ajuste
                campos[18] = self._formatar_decimal(novo_valor)
        
        return "|".join(campos)
    
    def _ajustar_linha_c190(self, linha: str, ajustes: Dict[str, DivergenciaAjustavel],
                           acumulados: Dict[str, float]) -> tuple:
        """
        Ajusta valores em uma linha C190
        Retorna (linha_ajustada, dict com ajustes aplicados)
        Layout C190: REG(1), CST_ICMS(2), CFOP(3), ALIQ_ICMS(4), VL_OPR(5),
                     VL_BC_ICMS(6), VL_ICMS(7), VL_BC_ICMS_ST(8), VL_ICMS_ST(9),
                     VL_RED_BC(10), COD_OBS(11), VL_IPI(12)
        Após split: fs[0]="", fs[1]="C190", fs[2]=CST_ICMS, fs[3]=CFOP, fs[4]=ALIQ_ICMS,
                    fs[5]=VL_OPR, fs[6]=VL_BC_ICMS, fs[7]=VL_ICMS, fs[8]=VL_BC_ICMS_ST,
                    fs[9]=VL_ICMS_ST, fs[10]=VL_RED_BC, fs[11]=COD_OBS, fs[12]=VL_IPI
        """
        campos = linha.split("|")
        ajustes_aplicados = {}
        
        # Verificar se este C190 corresponde aos ajustes (por CFOP/CST)
        cfop_c190 = campos[3] if len(campos) > 3 else ""
        cst_c190 = campos[2] if len(campos) > 2 else ""
        
        # Aplicar ajustes que correspondem a este CFOP/CST
        for campo, ajuste in ajustes.items():
            if ajuste.cfop == cfop_c190 and ajuste.cst == cst_c190:
                if campo == "VL_BC_ICMS" and len(campos) > 6:
                    valor_atual = self._parse_decimal(campos[6] or "0")
                    novo_valor = valor_atual + ajuste.valor_ajuste
                    campos[6] = self._formatar_decimal(novo_valor)
                    ajustes_aplicados[campo] = ajuste.valor_ajuste
                
                elif campo == "VL_ICMS" and len(campos) > 7:
                    valor_atual = self._parse_decimal(campos[7] or "0")
                    novo_valor = valor_atual + ajuste.valor_ajuste
                    campos[7] = self._formatar_decimal(novo_valor)
                    ajustes_aplicados[campo] = ajuste.valor_ajuste
                
                elif campo == "VL_BC_ICMS_ST" and len(campos) > 8:
                    valor_atual = self._parse_decimal(campos[8] or "0")
                    novo_valor = valor_atual + ajuste.valor_ajuste
                    campos[8] = self._formatar_decimal(novo_valor)
                    ajustes_aplicados[campo] = ajuste.valor_ajuste
                
                elif campo == "VL_ICMS_ST" and len(campos) > 9:
                    valor_atual = self._parse_decimal(campos[9] or "0")
                    novo_valor = valor_atual + ajuste.valor_ajuste
                    campos[9] = self._formatar_decimal(novo_valor)
                    ajustes_aplicados[campo] = ajuste.valor_ajuste
                
                elif campo == "VL_IPI" and len(campos) > 12:
                    valor_atual = self._parse_decimal(campos[12] or "0")
                    novo_valor = valor_atual + ajuste.valor_ajuste
                    campos[12] = self._formatar_decimal(novo_valor)
                    ajustes_aplicados[campo] = ajuste.valor_ajuste
        
        return ("|".join(campos), ajustes_aplicados)
    
    def _parse_decimal(self, valor: str) -> float:
        """Parse decimal considerando vírgula como separador"""
        if not valor or valor.strip() == "":
            return 0.0
        # Substituir vírgula por ponto
        valor_limpo = str(valor).strip().replace(",", ".")
        try:
            return float(valor_limpo)
        except ValueError:
            return 0.0
    
    def _formatar_decimal(self, valor: float) -> str:
        """Formata decimal com 2 casas decimais, usando vírgula"""
        # Arredondar para 2 casas decimais
        valor_arredondado = Decimal(str(valor)).quantize(
            Decimal('0.01'), rounding=ROUND_HALF_UP
        )
        # Converter para string e substituir ponto por vírgula
        return str(valor_arredondado).replace(".", ",")

