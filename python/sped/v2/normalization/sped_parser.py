#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Parser de Registros SPED para Motor de Totalização
Extrai C170, C190, C100, E110 de arquivo SPED (EFD ICMS/IPI)
"""

from typing import List, Dict, Any, Optional, Tuple
from decimal import Decimal
from pathlib import Path
from dataclasses import dataclass
import logging
import re

logger = logging.getLogger(__name__)


def split_sped_line(line: str, min_fields: int = 0) -> List[str]:
    """
    Divide linha SPED em campos, preservando pipes
    
    Args:
        line: Linha do arquivo SPED
        min_fields: Número mínimo de campos (preenche com vazios se necessário)
    
    Returns:
        Lista de campos (strings)
    """
    line = line.rstrip("\n\r")
    if line and not line.endswith("|"):
        line = line + "|"
    fields = line.split("|")
    if min_fields > 0 and len(fields) < min_fields:
        fields.extend([""] * (min_fields - len(fields)))
    return fields


def parse_decimal(value: str, default: Decimal = Decimal('0.00')) -> Decimal:
    """
    Converte string para Decimal, tratando vírgulas e vazios
    
    Args:
        value: String com número
        default: Valor padrão se conversão falhar
    
    Returns:
        Decimal
    """
    if not value or not value.strip():
        return default
    
    try:
        # Formato SPED: usa vírgula como separador decimal
        value_clean = value.strip().replace(',', '.')
        return Decimal(value_clean)
    except Exception as e:
        logger.warning(f"Erro ao converter '{value}' para Decimal: {e}")
        return default


def parse_date_sped(date_str: str) -> Optional[str]:
    """
    Converte data SPED (DDMMYYYY) para formato ISO (YYYY-MM-DD)
    
    Args:
        date_str: Data no formato DDMMYYYY
    
    Returns:
        Data no formato YYYY-MM-DD ou None se inválido
    """
    if not date_str or len(date_str) != 8:
        return None
    
    try:
        day = date_str[0:2]
        month = date_str[2:4]
        year = date_str[4:8]
        return f"{year}-{month}-{day}"
    except Exception:
        return None


@dataclass
class RegistroC100:
    """Registro C100 - Documento Fiscal"""
    reg: str  # 'C100'
    ind_oper: str  # 0=Entrada, 1=Saída
    ind_emit: str  # 0=Emissão própria, 1=Terceiros
    cod_part: str  # Código participante
    cod_mod: str  # Código modelo (ex: 55=NF-e)
    cod_sit: str  # 00=Normal, 02=Cancelada, etc.
    ser: str  # Série
    num_doc: str  # Número documento
    chv_nfe: str  # Chave NF-e (44 dígitos)
    dt_doc: str  # Data documento
    dt_e_s: str  # Data entrada/saída
    vl_doc: Decimal  # Valor total documento
    ind_pgto: str  # Indicador pagamento
    vl_desc: Decimal  # Valor desconto
    vl_abat_nt: Decimal  # Valor abatimento não tributado
    vl_merc: Decimal  # Valor mercadoria
    ind_frt: str  # Tipo frete
    vl_frt: Decimal  # Valor frete
    vl_seg: Decimal  # Valor seguro
    vl_out_da: Decimal  # Valor outras despesas
    vl_bc_icms: Decimal  # Base cálculo ICMS
    vl_icms: Decimal  # Valor ICMS
    vl_bc_icms_st: Decimal  # Base cálculo ICMS ST
    vl_icms_st: Decimal  # Valor ICMS ST
    vl_ipi: Decimal  # Valor IPI
    vl_pis: Decimal  # Valor PIS
    vl_cofins: Decimal  # Valor COFINS
    vl_pis_st: Decimal  # Valor PIS ST
    vl_cofins_st: Decimal  # Valor COFINS ST
    linha_original: str  # Linha original do arquivo
    numero_linha: int  # Número da linha no arquivo


@dataclass
class RegistroC170:
    """Registro C170 - Item do Documento Fiscal"""
    reg: str  # 'C170'
    num_item: str  # Número item
    cod_item: str  # Código item
    descr_compl: str  # Descrição complementar
    qtd: Decimal  # Quantidade
    unid: str  # Unidade
    vl_item: Decimal  # Valor item
    vl_desc: Decimal  # Valor desconto
    ind_mov: str  # Indicador movimentação
    cst_icms: str  # CST ICMS
    cfop: str  # CFOP
    cod_nat: str  # Código natureza operação
    vl_bc_icms: Decimal  # Base cálculo ICMS
    aliq_icms: Decimal  # Alíquota ICMS
    vl_icms: Decimal  # Valor ICMS
    vl_bc_icms_st: Decimal  # Base cálculo ICMS ST
    aliq_st: Decimal  # Alíquota ICMS ST
    vl_icms_st: Decimal  # Valor ICMS ST
    ind_apur: str  # Indicador apuração
    cst_ipi: str  # CST IPI
    cod_enq: str  # Código enquadramento IPI
    vl_bc_ipi: Decimal  # Base cálculo IPI
    aliq_ipi: Decimal  # Alíquota IPI
    vl_ipi: Decimal  # Valor IPI
    cst_pis: str  # CST PIS
    vl_bc_pis: Decimal  # Base cálculo PIS
    aliq_pis_perc: Decimal  # Alíquota PIS percentual
    quant_bc_pis: Decimal  # Quantidade base cálculo PIS
    aliq_pis_reais: Decimal  # Alíquota PIS reais
    vl_pis: Decimal  # Valor PIS
    cst_cofins: str  # CST COFINS
    vl_bc_cofins: Decimal  # Base cálculo COFINS
    aliq_cofins_perc: Decimal  # Alíquota COFINS percentual
    quant_bc_cofins: Decimal  # Quantidade base cálculo COFINS
    aliq_cofins_reais: Decimal  # Alíquota COFINS reais
    vl_cofins: Decimal  # Valor COFINS
    cod_cta: str  # Código conta analítica
    vl_abat_nt: Decimal  # Valor abatimento não tributado
    chv_nfe_pai: str  # Chave NF-e do C100 pai
    linha_original: str  # Linha original
    numero_linha: int  # Número da linha


@dataclass
class RegistroC190:
    """Registro C190 - Consolidação por CST/CFOP/Alíquota"""
    reg: str  # 'C190'
    cst_icms: str  # CST ICMS
    cfop: str  # CFOP
    aliq_icms: Decimal  # Alíquota ICMS
    vl_opr: Decimal  # Valor operação
    vl_bc_icms: Decimal  # Base cálculo ICMS
    vl_icms: Decimal  # Valor ICMS
    vl_bc_icms_st: Decimal  # Base cálculo ICMS ST
    vl_icms_st: Decimal  # Valor ICMS ST
    vl_red_bc: Decimal  # Valor redução base cálculo
    vl_ipi: Decimal  # Valor IPI
    cod_obs: str  # Código observação
    chv_nfe_pai: str  # Chave NF-e do C100 pai
    linha_original: str  # Linha original
    numero_linha: int  # Número da linha


@dataclass
class RegistroE110:
    """Registro E110 - Apuração do ICMS - Operações Próprias"""
    reg: str  # 'E110'
    vl_tot_debitos: Decimal  # Total débitos
    vl_aj_debitos: Decimal  # Ajustes a débitos
    vl_tot_aj_debitos: Decimal  # Total ajustes a débitos
    vl_estornos_cred: Decimal  # Estornos de créditos
    vl_tot_creditos: Decimal  # Total créditos
    vl_aj_creditos: Decimal  # Ajustes a créditos
    vl_tot_aj_creditos: Decimal  # Total ajustes a créditos
    vl_estornos_deb: Decimal  # Estornos de débitos
    vl_sld_credor_ant: Decimal  # Saldo credor período anterior
    vl_sld_apurado: Decimal  # Saldo apurado
    vl_tot_ded: Decimal  # Total deduções
    vl_icms_recolher: Decimal  # ICMS a recolher
    vl_sld_credor_transportar: Decimal  # Saldo credor a transportar
    deb_esp: Decimal  # Débitos especiais
    competencia: str  # MM/YYYY (extraído do E100 pai)
    linha_original: str  # Linha original
    numero_linha: int  # Número da linha


class SPEDParser:
    """Parser de registros SPED para validação de totalização"""
    
    def __init__(self, sped_path: Path):
        """
        Inicializa parser
        
        Args:
            sped_path: Caminho para arquivo SPED
        """
        self.sped_path = Path(sped_path)
        self.registros_c100: List[RegistroC100] = []
        self.registros_c170: List[RegistroC170] = []
        self.registros_c190: List[RegistroC190] = []
        self.registros_e110: List[RegistroE110] = []
        self.encoding = 'latin-1'  # Padrão para SPED
        self._index_c100_por_chave: Dict[str, RegistroC100] = {}
        self._competencia_atual: Optional[str] = None
    
    def parse(self) -> bool:
        """
        Parseia arquivo SPED completo
        
        Returns:
            True se sucesso, False caso contrário
        """
        try:
            logger.info(f"Iniciando parse de {self.sped_path}")
            
            with open(self.sped_path, 'r', encoding=self.encoding, errors='replace') as f:
                linhas = f.readlines()
            
            logger.info(f"Total de linhas no arquivo: {len(linhas)}")
            
            # Contexto de parsing
            c100_atual: Optional[RegistroC100] = None
            e100_competencia: Optional[str] = None
            
            for num_linha, linha in enumerate(linhas, start=1):
                linha = linha.strip()
                if not linha:
                    continue
                
                campos = split_sped_line(linha)
                if not campos or len(campos) < 2:
                    continue
                
                reg_tipo = campos[0].strip()
                
                # Parse por tipo de registro
                if reg_tipo == 'C100':
                    c100_atual = self._parse_c100(campos, linha, num_linha)
                    if c100_atual:
                        self.registros_c100.append(c100_atual)
                        if c100_atual.chv_nfe:
                            self._index_c100_por_chave[c100_atual.chv_nfe] = c100_atual
                
                elif reg_tipo == 'C170' and c100_atual:
                    c170 = self._parse_c170(campos, linha, num_linha, c100_atual.chv_nfe)
                    if c170:
                        self.registros_c170.append(c170)
                
                elif reg_tipo == 'C190' and c100_atual:
                    c190 = self._parse_c190(campos, linha, num_linha, c100_atual.chv_nfe)
                    if c190:
                        self.registros_c190.append(c190)
                
                elif reg_tipo == 'E100':
                    # Extrair competência (MM/YYYY) do E100
                    # E100|0|01032024|31032024|
                    # Campo[2] = data inicial (DDMMYYYY)
                    if len(campos) > 2:
                        data_ini = campos[2].strip()
                        if len(data_ini) == 8:
                            mm = data_ini[2:4]
                            yyyy = data_ini[4:8]
                            e100_competencia = f"{mm}/{yyyy}"
                            logger.debug(f"E100 encontrado: competência {e100_competencia}")
                
                elif reg_tipo == 'E110':
                    e110 = self._parse_e110(campos, linha, num_linha, e100_competencia)
                    if e110:
                        self.registros_e110.append(e110)
            
            logger.info(f"Parse concluído: {len(self.registros_c100)} C100, "
                       f"{len(self.registros_c170)} C170, {len(self.registros_c190)} C190, "
                       f"{len(self.registros_e110)} E110")
            
            return True
            
        except Exception as e:
            logger.error(f"Erro ao parsear arquivo SPED: {e}", exc_info=True)
            return False
    
    def _parse_c100(self, campos: List[str], linha: str, num_linha: int) -> Optional[RegistroC100]:
        """Parse registro C100"""
        try:
            # C100|IND_OPER|IND_EMIT|COD_PART|COD_MOD|COD_SIT|SER|NUM_DOC|CHV_NFE|DT_DOC|DT_E_S|
            #     VL_DOC|IND_PGTO|VL_DESC|VL_ABAT_NT|VL_MERC|IND_FRT|VL_FRT|VL_SEG|VL_OUT_DA|
            #     VL_BC_ICMS|VL_ICMS|VL_BC_ICMS_ST|VL_ICMS_ST|VL_IPI|VL_PIS|VL_COFINS|VL_PIS_ST|VL_COFINS_ST|
            if len(campos) < 29:
                logger.warning(f"C100 linha {num_linha}: campos insuficientes ({len(campos)})")
                return None
            
            return RegistroC100(
                reg='C100',
                ind_oper=campos[1].strip(),
                ind_emit=campos[2].strip(),
                cod_part=campos[3].strip(),
                cod_mod=campos[4].strip(),
                cod_sit=campos[5].strip(),
                ser=campos[6].strip(),
                num_doc=campos[7].strip(),
                chv_nfe=campos[8].strip(),
                dt_doc=campos[9].strip(),
                dt_e_s=campos[10].strip(),
                vl_doc=parse_decimal(campos[11]),
                ind_pgto=campos[12].strip(),
                vl_desc=parse_decimal(campos[13]),
                vl_abat_nt=parse_decimal(campos[14]),
                vl_merc=parse_decimal(campos[15]),
                ind_frt=campos[16].strip(),
                vl_frt=parse_decimal(campos[17]),
                vl_seg=parse_decimal(campos[18]),
                vl_out_da=parse_decimal(campos[19]),
                vl_bc_icms=parse_decimal(campos[20]),
                vl_icms=parse_decimal(campos[21]),
                vl_bc_icms_st=parse_decimal(campos[22]),
                vl_icms_st=parse_decimal(campos[23]),
                vl_ipi=parse_decimal(campos[24]),
                vl_pis=parse_decimal(campos[25]),
                vl_cofins=parse_decimal(campos[26]),
                vl_pis_st=parse_decimal(campos[27]),
                vl_cofins_st=parse_decimal(campos[28]),
                linha_original=linha,
                numero_linha=num_linha
            )
        except Exception as e:
            logger.warning(f"Erro ao parsear C100 linha {num_linha}: {e}")
            return None
    
    def _parse_c170(self, campos: List[str], linha: str, num_linha: int, chv_nfe_pai: str) -> Optional[RegistroC170]:
        """Parse registro C170"""
        try:
            # C170|NUM_ITEM|COD_ITEM|DESCR_COMPL|QTD|UNID|VL_ITEM|VL_DESC|IND_MOV|
            #     CST_ICMS|CFOP|COD_NAT|VL_BC_ICMS|ALIQ_ICMS|VL_ICMS|VL_BC_ICMS_ST|ALIQ_ST|VL_ICMS_ST|
            #     IND_APUR|CST_IPI|COD_ENQ|VL_BC_IPI|ALIQ_IPI|VL_IPI|
            #     CST_PIS|VL_BC_PIS|ALIQ_PIS_PERC|QUANT_BC_PIS|ALIQ_PIS_REAIS|VL_PIS|
            #     CST_COFINS|VL_BC_COFINS|ALIQ_COFINS_PERC|QUANT_BC_COFINS|ALIQ_COFINS_REAIS|VL_COFINS|
            #     COD_CTA|VL_ABAT_NT|
            if len(campos) < 38:
                logger.warning(f"C170 linha {num_linha}: campos insuficientes ({len(campos)})")
                return None
            
            return RegistroC170(
                reg='C170',
                num_item=campos[1].strip(),
                cod_item=campos[2].strip(),
                descr_compl=campos[3].strip(),
                qtd=parse_decimal(campos[4]),
                unid=campos[5].strip(),
                vl_item=parse_decimal(campos[6]),
                vl_desc=parse_decimal(campos[7]),
                ind_mov=campos[8].strip(),
                cst_icms=campos[9].strip(),
                cfop=campos[10].strip(),
                cod_nat=campos[11].strip(),
                vl_bc_icms=parse_decimal(campos[12]),
                aliq_icms=parse_decimal(campos[13]),
                vl_icms=parse_decimal(campos[14]),
                vl_bc_icms_st=parse_decimal(campos[15]),
                aliq_st=parse_decimal(campos[16]),
                vl_icms_st=parse_decimal(campos[17]),
                ind_apur=campos[18].strip(),
                cst_ipi=campos[19].strip(),
                cod_enq=campos[20].strip(),
                vl_bc_ipi=parse_decimal(campos[21]),
                aliq_ipi=parse_decimal(campos[22]),
                vl_ipi=parse_decimal(campos[23]),
                cst_pis=campos[24].strip(),
                vl_bc_pis=parse_decimal(campos[25]),
                aliq_pis_perc=parse_decimal(campos[26]),
                quant_bc_pis=parse_decimal(campos[27]),
                aliq_pis_reais=parse_decimal(campos[28]),
                vl_pis=parse_decimal(campos[29]),
                cst_cofins=campos[30].strip(),
                vl_bc_cofins=parse_decimal(campos[31]),
                aliq_cofins_perc=parse_decimal(campos[32]),
                quant_bc_cofins=parse_decimal(campos[33]),
                aliq_cofins_reais=parse_decimal(campos[34]),
                vl_cofins=parse_decimal(campos[35]),
                cod_cta=campos[36].strip(),
                vl_abat_nt=parse_decimal(campos[37]),
                chv_nfe_pai=chv_nfe_pai,
                linha_original=linha,
                numero_linha=num_linha
            )
        except Exception as e:
            logger.warning(f"Erro ao parsear C170 linha {num_linha}: {e}")
            return None
    
    def _parse_c190(self, campos: List[str], linha: str, num_linha: int, chv_nfe_pai: str) -> Optional[RegistroC190]:
        """Parse registro C190"""
        try:
            # C190|CST_ICMS|CFOP|ALIQ_ICMS|VL_OPR|VL_BC_ICMS|VL_ICMS|VL_BC_ICMS_ST|VL_ICMS_ST|VL_RED_BC|VL_IPI|COD_OBS|
            if len(campos) < 12:
                logger.warning(f"C190 linha {num_linha}: campos insuficientes ({len(campos)})")
                return None
            
            return RegistroC190(
                reg='C190',
                cst_icms=campos[1].strip(),
                cfop=campos[2].strip(),
                aliq_icms=parse_decimal(campos[3]),
                vl_opr=parse_decimal(campos[4]),
                vl_bc_icms=parse_decimal(campos[5]),
                vl_icms=parse_decimal(campos[6]),
                vl_bc_icms_st=parse_decimal(campos[7]),
                vl_icms_st=parse_decimal(campos[8]),
                vl_red_bc=parse_decimal(campos[9]),
                vl_ipi=parse_decimal(campos[10]),
                cod_obs=campos[11].strip(),
                chv_nfe_pai=chv_nfe_pai,
                linha_original=linha,
                numero_linha=num_linha
            )
        except Exception as e:
            logger.warning(f"Erro ao parsear C190 linha {num_linha}: {e}")
            return None
    
    def _parse_e110(self, campos: List[str], linha: str, num_linha: int, competencia: Optional[str]) -> Optional[RegistroE110]:
        """Parse registro E110"""
        try:
            # E110|VL_TOT_DEBITOS|VL_AJ_DEBITOS|VL_TOT_AJ_DEBITOS|VL_ESTORNOS_CRED|
            #     VL_TOT_CREDITOS|VL_AJ_CREDITOS|VL_TOT_AJ_CREDITOS|VL_ESTORNOS_DEB|
            #     VL_SLD_CREDOR_ANT|VL_SLD_APURADO|VL_TOT_DED|VL_ICMS_RECOLHER|VL_SLD_CREDOR_TRANSPORTAR|DEB_ESP|
            if len(campos) < 15:
                logger.warning(f"E110 linha {num_linha}: campos insuficientes ({len(campos)})")
                return None
            
            return RegistroE110(
                reg='E110',
                vl_tot_debitos=parse_decimal(campos[1]),
                vl_aj_debitos=parse_decimal(campos[2]),
                vl_tot_aj_debitos=parse_decimal(campos[3]),
                vl_estornos_cred=parse_decimal(campos[4]),
                vl_tot_creditos=parse_decimal(campos[5]),
                vl_aj_creditos=parse_decimal(campos[6]),
                vl_tot_aj_creditos=parse_decimal(campos[7]),
                vl_estornos_deb=parse_decimal(campos[8]),
                vl_sld_credor_ant=parse_decimal(campos[9]),
                vl_sld_apurado=parse_decimal(campos[10]),
                vl_tot_ded=parse_decimal(campos[11]),
                vl_icms_recolher=parse_decimal(campos[12]),
                vl_sld_credor_transportar=parse_decimal(campos[13]),
                deb_esp=parse_decimal(campos[14]),
                competencia=competencia or 'DESCONHECIDO',
                linha_original=linha,
                numero_linha=num_linha
            )
        except Exception as e:
            logger.warning(f"Erro ao parsear E110 linha {num_linha}: {e}")
            return None
    
    def get_c170_por_chave(self, chave_nfe: str) -> List[RegistroC170]:
        """Retorna todos C170 de uma chave NF-e"""
        return [c170 for c170 in self.registros_c170 if c170.chv_nfe_pai == chave_nfe]
    
    def get_c190_por_chave(self, chave_nfe: str) -> List[RegistroC190]:
        """Retorna todos C190 de uma chave NF-e"""
        return [c190 for c190 in self.registros_c190 if c190.chv_nfe_pai == chave_nfe]
    
    def get_c100_por_chave(self, chave_nfe: str) -> Optional[RegistroC100]:
        """Retorna C100 de uma chave NF-e"""
        return self._index_c100_por_chave.get(chave_nfe)


if __name__ == '__main__':
    # Teste standalone
    import sys
    if len(sys.argv) > 1:
        parser = SPEDParser(Path(sys.argv[1]))
        if parser.parse():
            print(f"✅ Parse OK!")
            print(f"   C100: {len(parser.registros_c100)}")
            print(f"   C170: {len(parser.registros_c170)}")
            print(f"   C190: {len(parser.registros_c190)}")
            print(f"   E110: {len(parser.registros_e110)}")
        else:
            print("❌ Erro no parse")

