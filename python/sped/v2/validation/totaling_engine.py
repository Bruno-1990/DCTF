"""
Motor de Totalização - Validação de Cadeias de Totalização SPED
Implementa validação de cadeias: C170→C190→C100→E110 com tolerâncias configuráveis
"""

from typing import List, Dict, Any, Optional, Tuple
from decimal import Decimal
from dataclasses import dataclass, field
from pathlib import Path
import logging
from collections import defaultdict

logger = logging.getLogger(__name__)

# Tolerâncias padrão
TOLERANCIA_LINHA = Decimal('0.01')  # R$ 0,01 para linha (C170→C190)
TOLERANCIA_DOCUMENTO_MIN = Decimal('0.05')  # R$ 0,05 mínimo para documento
TOLERANCIA_DOCUMENTO_MAX = Decimal('0.10')  # R$ 0,10 máximo para documento
TOLERANCIA_PERIODO_MIN = Decimal('0.50')  # R$ 0,50 mínimo para período
TOLERANCIA_PERIODO_MAX = Decimal('2.00')  # R$ 2,00 máximo para período


@dataclass
class RegistroC170:
    """Registro C170 (item de nota fiscal)"""
    chave: str  # Chave da NF-e
    cfop: str
    cst: str
    vl_item: Decimal
    vl_desconto: Decimal
    vl_bc_icms: Decimal
    vl_icms: Decimal
    vl_bc_icms_st: Decimal
    vl_icms_st: Decimal
    vl_ipi: Decimal
    vl_pis: Decimal
    vl_cofins: Decimal
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class RegistroC190:
    """Registro C190 (totalização por CFOP/CST)"""
    chave: str  # Chave da NF-e
    cfop: str
    cst: str
    vl_opr: Decimal
    vl_bc_icms: Decimal
    vl_icms: Decimal
    vl_bc_icms_st: Decimal
    vl_icms_st: Decimal
    vl_ipi: Decimal
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class RegistroC100:
    """Registro C100 (documento fiscal)"""
    chave: str  # Chave da NF-e
    vl_merc: Decimal  # Valor total da mercadoria
    vl_frt: Decimal  # Valor do frete
    vl_seg: Decimal  # Valor do seguro
    vl_desc: Decimal  # Valor do desconto
    vl_out: Decimal  # Valor de outras despesas
    vl_bc_icms: Decimal  # Base de cálculo do ICMS
    vl_icms: Decimal  # Valor do ICMS
    vl_bc_icms_st: Decimal  # Base de cálculo do ICMS ST
    vl_icms_st: Decimal  # Valor do ICMS ST
    vl_ipi: Decimal  # Valor do IPI
    competencia: str  # MM/YYYY
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class RegistroE110:
    """Registro E110 (totalização por período)"""
    competencia: str  # MM/YYYY
    vl_tot_debitos: Decimal  # Total de débitos
    vl_aj_debitos: Decimal  # Ajustes a débitos
    vl_tot_aj_debitos: Decimal  # Total de ajustes a débitos
    vl_estornos_cred: Decimal  # Estornos de créditos
    vl_tot_creditos: Decimal  # Total de créditos
    vl_aj_creditos: Decimal  # Ajustes a créditos
    vl_tot_aj_creditos: Decimal  # Total de ajustes a créditos
    vl_estornos_deb: Decimal  # Estornos de débitos
    vl_sld_credor_ant: Decimal  # Saldo credor anterior
    vl_sld_apurado: Decimal  # Saldo apurado
    vl_tot_deducoes: Decimal  # Total de deduções
    vl_icms_recolher: Decimal  # ICMS a recolher
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class DivergenciaTotalizacao:
    """Divergência encontrada na totalização"""
    cadeia: str  # 'C170→C190', 'C190→C100', 'C100→E110'
    tipo: str  # 'soma', 'diferenca', 'ausente'
    chave: Optional[str] = None
    competencia: Optional[str] = None
    cfop: Optional[str] = None
    cst: Optional[str] = None
    valor_esperado: Optional[Decimal] = None
    valor_encontrado: Optional[Decimal] = None
    diferenca: Optional[Decimal] = None
    tolerancia: Optional[Decimal] = None
    dentro_tolerancia: bool = False
    descricao: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ResultadoTotalizacao:
    """Resultado da validação de totalização"""
    cadeia_c170_c190: List[DivergenciaTotalizacao] = field(default_factory=list)
    cadeia_c190_c100: List[DivergenciaTotalizacao] = field(default_factory=list)
    cadeia_c100_e110: List[DivergenciaTotalizacao] = field(default_factory=list)
    total_divergencias: int = 0
    total_dentro_tolerancia: int = 0
    total_fora_tolerancia: int = 0
    
    def to_dict(self) -> Dict[str, Any]:
        """Converte resultado para dicionário"""
        return {
            'cadeia_c170_c190': len(self.cadeia_c170_c190),
            'cadeia_c190_c100': len(self.cadeia_c190_c100),
            'cadeia_c100_e110': len(self.cadeia_c100_e110),
            'total_divergencias': self.total_divergencias,
            'total_dentro_tolerancia': self.total_dentro_tolerancia,
            'total_fora_tolerancia': self.total_fora_tolerancia,
        }


class TotalingEngine:
    """Motor de totalização para validação de cadeias SPED"""
    
    def __init__(
        self,
        tolerancia_linha: Decimal = TOLERANCIA_LINHA,
        tolerancia_documento_min: Decimal = TOLERANCIA_DOCUMENTO_MIN,
        tolerancia_documento_max: Decimal = TOLERANCIA_DOCUMENTO_MAX,
        tolerancia_periodo_min: Decimal = TOLERANCIA_PERIODO_MIN,
        tolerancia_periodo_max: Decimal = TOLERANCIA_PERIODO_MAX,
    ):
        """
        Inicializa o motor de totalização
        
        Args:
            tolerancia_linha: Tolerância para linha (C170→C190)
            tolerancia_documento_min: Tolerância mínima para documento (C190→C100)
            tolerancia_documento_max: Tolerância máxima para documento (C190→C100)
            tolerancia_periodo_min: Tolerância mínima para período (C100→E110)
            tolerancia_periodo_max: Tolerância máxima para período (C100→E110)
        """
        self.tolerancia_linha = tolerancia_linha
        self.tolerancia_documento_min = tolerancia_documento_min
        self.tolerancia_documento_max = tolerancia_documento_max
        self.tolerancia_periodo_min = tolerancia_periodo_min
        self.tolerancia_periodo_max = tolerancia_periodo_max
    
    def validar_cadeia_c170_c190(
        self,
        registros_c170: List[RegistroC170],
        registros_c190: List[RegistroC190]
    ) -> List[DivergenciaTotalizacao]:
        """
        Valida cadeia C170 → C190
        
        C170 agrupado por (chave, CFOP, CST) deve somar C190 correspondente
        
        Args:
            registros_c170: Lista de registros C170
            registros_c190: Lista de registros C190
        
        Returns:
            Lista de divergências encontradas
        """
        divergencias: List[DivergenciaTotalizacao] = []
        
        # Agrupar C170 por (chave, CFOP, CST)
        c170_agrupado: Dict[Tuple[str, str, str], List[RegistroC170]] = defaultdict(list)
        for c170 in registros_c170:
            key = (c170.chave, c170.cfop, c170.cst)
            c170_agrupado[key].append(c170)
        
        # Criar índice de C190 por (chave, CFOP, CST)
        c190_index: Dict[Tuple[str, str, str], RegistroC190] = {}
        for c190 in registros_c190:
            key = (c190.chave, c190.cfop, c190.cst)
            c190_index[key] = c190
        
        # Validar cada grupo de C170
        for (chave, cfop, cst), c170_list in c170_agrupado.items():
            # Somar valores dos C170
            soma_vl_opr = sum(c170.vl_item - c170.vl_desconto for c170 in c170_list)
            soma_vl_bc_icms = sum(c170.vl_bc_icms for c170 in c170_list)
            soma_vl_icms = sum(c170.vl_icms for c170 in c170_list)
            soma_vl_bc_icms_st = sum(c170.vl_bc_icms_st for c170 in c170_list)
            soma_vl_icms_st = sum(c170.vl_icms_st for c170 in c170_list)
            soma_vl_ipi = sum(c170.vl_ipi for c170 in c170_list)
            
            # Buscar C190 correspondente
            c190 = c190_index.get((chave, cfop, cst))
            
            if not c190:
                # C190 ausente
                divergencias.append(DivergenciaTotalizacao(
                    cadeia='C170→C190',
                    tipo='ausente',
                    chave=chave,
                    cfop=cfop,
                    cst=cst,
                    valor_esperado=soma_vl_opr,
                    valor_encontrado=None,
                    diferenca=soma_vl_opr,
                    tolerancia=self.tolerancia_linha,
                    dentro_tolerancia=False,
                    descricao=f'C190 ausente para chave {chave}, CFOP {cfop}, CST {cst}'
                ))
                continue
            
            # Validar cada campo
            campos = [
                ('vl_opr', soma_vl_opr, c190.vl_opr),
                ('vl_bc_icms', soma_vl_bc_icms, c190.vl_bc_icms),
                ('vl_icms', soma_vl_icms, c190.vl_icms),
                ('vl_bc_icms_st', soma_vl_bc_icms_st, c190.vl_bc_icms_st),
                ('vl_icms_st', soma_vl_icms_st, c190.vl_icms_st),
                ('vl_ipi', soma_vl_ipi, c190.vl_ipi),
            ]
            
            for campo, valor_esperado, valor_encontrado in campos:
                diferenca = abs(valor_esperado - valor_encontrado)
                dentro_tolerancia = diferenca <= self.tolerancia_linha
                
                if diferenca > self.tolerancia_linha:
                    divergencias.append(DivergenciaTotalizacao(
                        cadeia='C170→C190',
                        tipo='diferenca',
                        chave=chave,
                        cfop=cfop,
                        cst=cst,
                        valor_esperado=valor_esperado,
                        valor_encontrado=valor_encontrado,
                        diferenca=diferenca,
                        tolerancia=self.tolerancia_linha,
                        dentro_tolerancia=dentro_tolerancia,
                        descricao=f'Divergência em {campo}: esperado {valor_esperado:.2f}, encontrado {valor_encontrado:.2f}, diferença {diferenca:.2f}',
                        metadata={'campo': campo}
                    ))
        
        # Verificar C190 sem C170 correspondente
        for (chave, cfop, cst), c190 in c190_index.items():
            if (chave, cfop, cst) not in c170_agrupado:
                divergencias.append(DivergenciaTotalizacao(
                    cadeia='C170→C190',
                    tipo='ausente',
                    chave=chave,
                    cfop=cfop,
                    cst=cst,
                    valor_esperado=None,
                    valor_encontrado=c190.vl_opr,
                    diferenca=c190.vl_opr,
                    tolerancia=self.tolerancia_linha,
                    dentro_tolerancia=False,
                    descricao=f'C170 ausente para C190 com chave {chave}, CFOP {cfop}, CST {cst}'
                ))
        
        return divergencias
    
    def validar_cadeia_c190_c100(
        self,
        registros_c190: List[RegistroC190],
        registros_c100: List[RegistroC100]
    ) -> List[DivergenciaTotalizacao]:
        """
        Valida cadeia C190 → C100
        
        C190 agrupado por chave (documento) deve somar C100 correspondente
        
        Args:
            registros_c190: Lista de registros C190
            registros_c100: Lista de registros C100
        
        Returns:
            Lista de divergências encontradas
        """
        divergencias: List[DivergenciaTotalizacao] = []
        
        # Agrupar C190 por chave
        c190_agrupado: Dict[str, List[RegistroC190]] = defaultdict(list)
        for c190 in registros_c190:
            c190_agrupado[c190.chave].append(c190)
        
        # Criar índice de C100 por chave
        c100_index: Dict[str, RegistroC100] = {}
        for c100 in registros_c100:
            c100_index[c100.chave] = c100
        
        # Validar cada grupo de C190
        for chave, c190_list in c190_agrupado.items():
            # Somar valores dos C190
            soma_vl_merc = sum(c190.vl_opr for c190 in c190_list)
            soma_vl_bc_icms = sum(c190.vl_bc_icms for c190 in c190_list)
            soma_vl_icms = sum(c190.vl_icms for c190 in c190_list)
            soma_vl_bc_icms_st = sum(c190.vl_bc_icms_st for c190 in c190_list)
            soma_vl_icms_st = sum(c190.vl_icms_st for c190 in c190_list)
            soma_vl_ipi = sum(c190.vl_ipi for c190 in c190_list)
            
            # Buscar C100 correspondente
            c100 = c100_index.get(chave)
            
            if not c100:
                # C100 ausente
                divergencias.append(DivergenciaTotalizacao(
                    cadeia='C190→C100',
                    tipo='ausente',
                    chave=chave,
                    valor_esperado=soma_vl_merc,
                    valor_encontrado=None,
                    diferenca=soma_vl_merc,
                    tolerancia=self.tolerancia_documento_max,
                    dentro_tolerancia=False,
                    descricao=f'C100 ausente para chave {chave}'
                ))
                continue
            
            # Tolerância dinâmica baseada no valor
            tolerancia = self._calcular_tolerancia_documento(soma_vl_merc)
            
            # Validar cada campo
            campos = [
                ('vl_merc', soma_vl_merc, c100.vl_merc),
                ('vl_bc_icms', soma_vl_bc_icms, c100.vl_bc_icms),
                ('vl_icms', soma_vl_icms, c100.vl_icms),
                ('vl_bc_icms_st', soma_vl_bc_icms_st, c100.vl_bc_icms_st),
                ('vl_icms_st', soma_vl_icms_st, c100.vl_icms_st),
                ('vl_ipi', soma_vl_ipi, c100.vl_ipi),
            ]
            
            for campo, valor_esperado, valor_encontrado in campos:
                diferenca = abs(valor_esperado - valor_encontrado)
                dentro_tolerancia = diferenca <= tolerancia
                
                if diferenca > tolerancia:
                    divergencias.append(DivergenciaTotalizacao(
                        cadeia='C190→C100',
                        tipo='diferenca',
                        chave=chave,
                        valor_esperado=valor_esperado,
                        valor_encontrado=valor_encontrado,
                        diferenca=diferenca,
                        tolerancia=tolerancia,
                        dentro_tolerancia=dentro_tolerancia,
                        descricao=f'Divergência em {campo}: esperado {valor_esperado:.2f}, encontrado {valor_encontrado:.2f}, diferença {diferenca:.2f}',
                        metadata={'campo': campo}
                    ))
        
        return divergencias
    
    def validar_cadeia_c100_e110(
        self,
        registros_c100: List[RegistroC100],
        registros_e110: List[RegistroE110]
    ) -> List[DivergenciaTotalizacao]:
        """
        Valida cadeia C100 → E110 (impacto)
        
        C100 agrupado por competência deve somar E110 correspondente (valores de impacto)
        
        Args:
            registros_c100: Lista de registros C100
            registros_e110: Lista de registros E110
        
        Returns:
            Lista de divergências encontradas
        """
        divergencias: List[DivergenciaTotalizacao] = []
        
        # Agrupar C100 por competência
        c100_agrupado: Dict[str, List[RegistroC100]] = defaultdict(list)
        for c100 in registros_c100:
            c100_agrupado[c100.competencia].append(c100)
        
        # Criar índice de E110 por competência
        e110_index: Dict[str, RegistroE110] = {}
        for e110 in registros_e110:
            e110_index[e110.competencia] = e110
        
        # Validar cada competência
        for competencia, c100_list in c100_agrupado.items():
            # Calcular valores de impacto dos C100
            # Impacto = ICMS + ICMS ST + IPI (valores a recolher)
            impacto_icms = sum(c100.vl_icms for c100 in c100_list)
            impacto_icms_st = sum(c100.vl_icms_st for c100 in c100_list)
            impacto_ipi = sum(c100.vl_ipi for c100 in c100_list)
            impacto_total = impacto_icms + impacto_icms_st + impacto_ipi
            
            # Buscar E110 correspondente
            e110 = e110_index.get(competencia)
            
            if not e110:
                # E110 ausente
                divergencias.append(DivergenciaTotalizacao(
                    cadeia='C100→E110',
                    tipo='ausente',
                    competencia=competencia,
                    valor_esperado=impacto_total,
                    valor_encontrado=None,
                    diferenca=impacto_total,
                    tolerancia=self.tolerancia_periodo_max,
                    dentro_tolerancia=False,
                    descricao=f'E110 ausente para competência {competencia}'
                ))
                continue
            
            # Tolerância dinâmica baseada no valor
            tolerancia = self._calcular_tolerancia_periodo(impacto_total)
            
            # E110 tem vl_icms_recolher que representa o impacto
            # Comparar com o impacto calculado dos C100
            diferenca = abs(impacto_total - e110.vl_icms_recolher)
            dentro_tolerancia = diferenca <= tolerancia
            
            if diferenca > tolerancia:
                divergencias.append(DivergenciaTotalizacao(
                    cadeia='C100→E110',
                    tipo='diferenca',
                    competencia=competencia,
                    valor_esperado=impacto_total,
                    valor_encontrado=e110.vl_icms_recolher,
                    diferenca=diferenca,
                    tolerancia=tolerancia,
                    dentro_tolerancia=dentro_tolerancia,
                    descricao=f'Divergência de impacto: esperado {impacto_total:.2f}, encontrado {e110.vl_icms_recolher:.2f}, diferença {diferenca:.2f}',
                    metadata={
                        'impacto_icms': float(impacto_icms),
                        'impacto_icms_st': float(impacto_icms_st),
                        'impacto_ipi': float(impacto_ipi),
                    }
                ))
        
        return divergencias
    
    def _calcular_tolerancia_documento(self, valor: Decimal) -> Decimal:
        """
        Calcula tolerância dinâmica para documento baseada no valor
        
        Args:
            valor: Valor base para cálculo
        
        Returns:
            Tolerância calculada (entre min e max)
        """
        # Tolerância proporcional (0.1% do valor, limitado entre min e max)
        tolerancia_proporcional = valor * Decimal('0.001')
        
        if tolerancia_proporcional < self.tolerancia_documento_min:
            return self.tolerancia_documento_min
        elif tolerancia_proporcional > self.tolerancia_documento_max:
            return self.tolerancia_documento_max
        else:
            return tolerancia_proporcional
    
    def _calcular_tolerancia_periodo(self, valor: Decimal) -> Decimal:
        """
        Calcula tolerância dinâmica para período baseada no valor
        
        Args:
            valor: Valor base para cálculo
        
        Returns:
            Tolerância calculada (entre min e max)
        """
        # Tolerância proporcional (0.2% do valor, limitado entre min e max)
        tolerancia_proporcional = valor * Decimal('0.002')
        
        if tolerancia_proporcional < self.tolerancia_periodo_min:
            return self.tolerancia_periodo_min
        elif tolerancia_proporcional > self.tolerancia_periodo_max:
            return self.tolerancia_periodo_max
        else:
            return tolerancia_proporcional
    
    def validar_todas_cadeias(
        self,
        registros_c170: List[RegistroC170],
        registros_c190: List[RegistroC190],
        registros_c100: List[RegistroC100],
        registros_e110: List[RegistroE110]
    ) -> ResultadoTotalizacao:
        """
        Valida todas as cadeias de totalização
        
        Args:
            registros_c170: Lista de registros C170
            registros_c190: Lista de registros C190
            registros_c100: Lista de registros C100
            registros_e110: Lista de registros E110
        
        Returns:
            Resultado completo da validação
        """
        resultado = ResultadoTotalizacao()
        
        # Validar cada cadeia
        resultado.cadeia_c170_c190 = self.validar_cadeia_c170_c190(registros_c170, registros_c190)
        resultado.cadeia_c190_c100 = self.validar_cadeia_c190_c100(registros_c190, registros_c100)
        resultado.cadeia_c100_e110 = self.validar_cadeia_c100_e110(registros_c100, registros_e110)
        
        # Calcular estatísticas
        todas_divergencias = (
            resultado.cadeia_c170_c190 +
            resultado.cadeia_c190_c100 +
            resultado.cadeia_c100_e110
        )
        
        resultado.total_divergencias = len(todas_divergencias)
        resultado.total_dentro_tolerancia = sum(1 for d in todas_divergencias if d.dentro_tolerancia)
        resultado.total_fora_tolerancia = sum(1 for d in todas_divergencias if not d.dentro_tolerancia)
        
        return resultado

