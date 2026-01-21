"""
Sistema de Configuração de Perfil Fiscal do Cliente
Gerencia perfis fiscais e seleção de packs por validação
"""

import json
from typing import List, Dict, Optional, Any, Set
from dataclasses import dataclass, field
from datetime import datetime
from ..packs import get_pack, list_available_segments, SegmentPack


@dataclass
class ClientProfile:
    """Perfil fiscal de um cliente"""
    id: Optional[str] = None
    cliente_id: int = 0
    segmento: str = ""
    regime_tributario: str = ""
    opera_st: bool = False
    regime_especial: bool = False
    opera_difal: bool = False
    opera_fcp: bool = False
    opera_interestadual: bool = False
    cfops_esperados: Set[str] = field(default_factory=set)
    packs_selecionados: List[str] = field(default_factory=list)
    tolerancias_customizadas: Dict[str, float] = field(default_factory=dict)
    ativo: bool = True
    observacoes: Optional[str] = None
    criado_em: Optional[datetime] = None
    atualizado_em: Optional[datetime] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Converte perfil para dicionário"""
        return {
            'id': self.id,
            'cliente_id': self.cliente_id,
            'segmento': self.segmento,
            'regime_tributario': self.regime_tributario,
            'opera_st': self.opera_st,
            'regime_especial': self.regime_especial,
            'opera_difal': self.opera_difal,
            'opera_fcp': self.opera_fcp,
            'opera_interestadual': self.opera_interestadual,
            'cfops_esperados': list(self.cfops_esperados),
            'packs_selecionados': self.packs_selecionados,
            'tolerancias_customizadas': self.tolerancias_customizadas,
            'ativo': self.ativo,
            'observacoes': self.observacoes,
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'ClientProfile':
        """Cria perfil a partir de dicionário"""
        return cls(
            id=data.get('id'),
            cliente_id=data.get('cliente_id', 0),
            segmento=data.get('segmento', ''),
            regime_tributario=data.get('regime_tributario', ''),
            opera_st=data.get('opera_st', False),
            regime_especial=data.get('regime_especial', False),
            opera_difal=data.get('opera_difal', False),
            opera_fcp=data.get('opera_fcp', False),
            opera_interestadual=data.get('opera_interestadual', False),
            cfops_esperados=set(data.get('cfops_esperados', [])),
            packs_selecionados=data.get('packs_selecionados', []),
            tolerancias_customizadas=data.get('tolerancias_customizadas', {}),
            ativo=data.get('ativo', True),
            observacoes=data.get('observacoes'),
        )


class ClientProfileManager:
    """Gerenciador de perfis fiscais de clientes"""
    
    def __init__(self, db_connection=None):
        """
        Args:
            db_connection: Conexão com banco de dados (MySQL)
        """
        self.db = db_connection
    
    def get_profile(self, cliente_id: int, segmento: Optional[str] = None) -> Optional[ClientProfile]:
        """
        Busca perfil de um cliente
        
        Args:
            cliente_id: ID do cliente
            segmento: Segmento específico (opcional)
        
        Returns:
            Perfil do cliente ou None se não encontrado
        """
        if not self.db:
            # Modo simulado (para testes)
            return None
        
        query = """
            SELECT * FROM sped_v2_client_profiles
            WHERE cliente_id = %s AND ativo = TRUE
        """
        params = [cliente_id]
        
        if segmento:
            query += " AND segmento = %s"
            params.append(segmento)
        
        query += " LIMIT 1"
        
        # TODO: Executar query e converter resultado
        # Por enquanto, retorna None
        return None
    
    def save_profile(self, profile: ClientProfile) -> str:
        """
        Salva ou atualiza perfil
        
        Args:
            profile: Perfil a ser salvo
        
        Returns:
            ID do perfil salvo
        """
        if not self.db:
            # Modo simulado
            if not profile.id:
                profile.id = "simulated-id"
            return profile.id
        
        data = profile.to_dict()
        
        if profile.id:
            # Atualizar
            query = """
                UPDATE sped_v2_client_profiles
                SET segmento = %s, regime_tributario = %s,
                    opera_st = %s, regime_especial = %s,
                    opera_difal = %s, opera_fcp = %s,
                    opera_interestadual = %s,
                    cfops_esperados = %s,
                    packs_selecionados = %s,
                    tolerancias_customizadas = %s,
                    ativo = %s, observacoes = %s,
                    atualizado_em = NOW()
                WHERE id = %s
            """
            params = [
                data['segmento'],
                data['regime_tributario'],
                data['opera_st'],
                data['regime_especial'],
                data['opera_difal'],
                data['opera_fcp'],
                data['opera_interestadual'],
                json.dumps(list(data['cfops_esperados'])),
                json.dumps(data['packs_selecionados']),
                json.dumps(data['tolerancias_customizadas']),
                data['ativo'],
                data['observacoes'],
                profile.id,
            ]
        else:
            # Inserir
            query = """
                INSERT INTO sped_v2_client_profiles
                (cliente_id, segmento, regime_tributario,
                 opera_st, regime_especial, opera_difal, opera_fcp, opera_interestadual,
                 cfops_esperados, packs_selecionados, tolerancias_customizadas,
                 ativo, observacoes)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """
            params = [
                data['cliente_id'],
                data['segmento'],
                data['regime_tributario'],
                data['opera_st'],
                data['regime_especial'],
                data['opera_difal'],
                data['opera_fcp'],
                data['opera_interestadual'],
                json.dumps(list(data['cfops_esperados'])),
                json.dumps(data['packs_selecionados']),
                json.dumps(data['tolerancias_customizadas']),
                data['ativo'],
                data['observacoes'],
            ]
        
        # TODO: Executar query
        # Por enquanto, retorna ID simulado
        if not profile.id:
            profile.id = "simulated-id"
        return profile.id
    
    def get_packs_for_profile(self, profile: ClientProfile) -> List[SegmentPack]:
        """
        Retorna packs selecionados para um perfil
        
        Args:
            profile: Perfil do cliente
        
        Returns:
            Lista de packs ativos
        """
        packs = []
        
        # Se packs foram selecionados explicitamente, usar esses
        if profile.packs_selecionados:
            for pack_name in profile.packs_selecionados:
                try:
                    pack = get_pack(pack_name)
                    packs.append(pack)
                except ValueError:
                    # Pack não encontrado, ignorar
                    pass
        else:
            # Se não, usar pack baseado no segmento
            try:
                pack = get_pack(profile.segmento)
                packs.append(pack)
            except ValueError:
                # Segmento não tem pack, usar pack padrão (COMERCIO)
                try:
                    pack = get_pack('COMERCIO')
                    packs.append(pack)
                except ValueError:
                    pass
        
        return packs
    
    def suggest_packs(self, profile: ClientProfile) -> List[str]:
        """
        Sugere packs baseado nas características do perfil
        
        Args:
            profile: Perfil do cliente
        
        Returns:
            Lista de nomes de packs sugeridos
        """
        sugestoes = []
        
        # Pack baseado no segmento
        if profile.segmento:
            sugestoes.append(profile.segmento)
        
        # Packs adicionais baseados em flags
        if profile.opera_st:
            # Se opera ST, pode precisar de pack de BEBIDAS
            if 'BEBIDAS' not in sugestoes:
                sugestoes.append('BEBIDAS')
        
        if profile.opera_difal or profile.opera_interestadual:
            # Se opera DIFAL ou interestadual, pode precisar de pack de ECOMMERCE
            if 'ECOMMERCE' not in sugestoes:
                sugestoes.append('ECOMMERCE')
        
        # Remover duplicatas mantendo ordem
        return list(dict.fromkeys(sugestoes))
    
    def validate_profile(self, profile: ClientProfile) -> List[str]:
        """
        Valida um perfil e retorna lista de erros
        
        Args:
            profile: Perfil a validar
        
        Returns:
            Lista de mensagens de erro (vazia se válido)
        """
        erros = []
        
        if not profile.cliente_id:
            erros.append("ID do cliente é obrigatório")
        
        if not profile.segmento:
            erros.append("Segmento é obrigatório")
        elif profile.segmento not in list_available_segments():
            erros.append(f"Segmento inválido: {profile.segmento}")
        
        if not profile.regime_tributario:
            erros.append("Regime tributário é obrigatório")
        
        # Validar packs selecionados
        for pack_name in profile.packs_selecionados:
            if pack_name not in list_available_segments():
                erros.append(f"Pack inválido: {pack_name}")
        
        return erros

