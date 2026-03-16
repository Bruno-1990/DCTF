# -*- coding: utf-8 -*-
"""
Phrases and narrative for window_1 (PT + EN).
Use these constants in your UI or logic; add the English version alongside Portuguese.
"""

# --- Actions (PT / EN) ---
carry_action_pt = "carregar"
carry_action_en = "carry"

next_action_for_holding_pt = "próxima ação para segurar"
next_action_for_holding_en = "next action for holding"

sentence_for_holding_pt = "O usuário está segurando o celular."
sentence_for_holding_en = "The user is holding the phone."

# --- Narrative (PT / EN) ---
narrative_holding_pt = (
    "O usuário está segurando o celular. "
    "A próxima ação sugerida é baseada no contexto de uso atual."
)
narrative_holding_en = (
    "The user is holding the phone. "
    "The suggested next action is based on the current usage context."
)

# --- Optional: dict for i18n ---
PHRASES = {
    "pt": {
        "carry_action": carry_action_pt,
        "next_action_for_holding": next_action_for_holding_pt,
        "sentence_for_holding": sentence_for_holding_pt,
        "narrative_holding": narrative_holding_pt,
    },
    "en": {
        "carry_action": carry_action_en,
        "next_action_for_holding": next_action_for_holding_en,
        "sentence_for_holding": sentence_for_holding_en,
        "narrative_holding": narrative_holding_en,
    },
}

def get_phrase(lang: str, key: str) -> str:
    """Return phrase for lang ('pt' or 'en') and key (e.g. 'sentence_for_holding')."""
    return PHRASES.get(lang, PHRASES["pt"]).get(key, "")
