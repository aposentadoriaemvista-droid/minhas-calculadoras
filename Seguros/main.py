import os
import io
import re
import sys
import csv
import json
import hmac
import hashlib
import unicodedata
from datetime import datetime

import pdfplumber
import gspread
# As bibliotecas do Google Drive são importadas só dentro das funções que as usam,
# assim o modo de teste local (python main.py --local) roda sem credenciais.

# =======================================================
# CONFIGURAÇÕES
# =======================================================
# FOLDER_ENTRADA_ID = os.environ.get("FOLDER_ENTRADA_ID", "13dEtD5RTWQiyt1INASVqPgaIt9RKudFO")
# FOLDER_PROCESSADOS_ID = os.environ.get("FOLDER_PROCESSADOS_ID", "1E1guR7b5jJzfiO3fnbZzoLnnaTBnjGYd")
# SPREADSHEET_ID = os.environ.get("SPREADSHEET_ID", "14wh7QYAW-m60TxkWugF0Hasd3y6MptyjXE1U7rPSL4E")
# No GitHub Actions os Secrets substituem estes valores padrão
FOLDER_ENTRADA_ID = os.environ.get("FOLDER_ENTRADA_ID", "13dEtD5RTWQiyt1INASVqPgaIt9RKudFO")
FOLDER_PROCESSADOS_ID = os.environ.get("FOLDER_PROCESSADOS_ID", "1E1guR7b5jJzfiO3fnbZzoLnnaTBnjGYd")

# Mostra no log qual extrator foi usado em cada arquivo (o modo local desliga para a saída ficar limpa)
VERBOSO = True

# Aba de controle: registra tudo que já foi lançado (é ela que impede lançamentos duplicados)
ABA_CONTROLE = "Controle_Lancamentos"
CABECALHO_CONTROLE = ["Chave", "Processado em", "Arquivo", "Aba", "Seguradora", "Nº Apólice", "Tipo Documento", "Situação"]


from comum import *  # noqa: F401,F403  (configurações, utilitários, nome do arquivo, seguradora, CPF, telefone)


# =======================================================
# 4. EXTRATORES POR SEGURADORA
#    Assinatura padrão: extrair_xxx(texto_completo, ctx, dados) -> dados
#    ctx traz: nome_arquivo, tipo_documento, movimento, ramo, eh_endosso, eh_cancelamento
#    Para criar uma lógica nova (ex.: Endosso da HDI), use ctx["eh_endosso"] dentro da função
#    ou registre uma função nova em EXTRATORES.
# =======================================================

# ---------- PORTO SEGURO / AZUL (mesmo layout) ----------
def _extrair_porto_frota(texto_completo, ctx, dados):
    """Porto Seguro Auto Frota (endosso em formato de 'carta' com 'Valor líquido / Valor total')."""
    m_venc = re.search(r"Vig[êe]ncia:\s*(\d{2}/\d{2}/\d{4})\s*AT[ÉE]", texto_completo, re.IGNORECASE)
    if m_venc: dados["vencimento"] = m_venc.group(1)
    liq = valores_abaixo_do_cabecalho(texto_completo, r"Valor l[íi]quido\s+Juros\s+IOF")
    if liq: dados["premio_liquido"] = liq[0]
    tot = valores_abaixo_do_cabecalho(texto_completo, r"Valor [àa] vista\s+Valor total")
    if tot: dados["premio_total"] = tot[-1]
    m_mod = re.search(r"Ve[íi]culo:\s*([^\n]+)", texto_completo, re.IGNORECASE)
    if m_mod: dados["modelo_carro"] = m_mod.group(1).strip()
    parcelas = re.findall(r"^(\d{1,2})\s+R\$\s*-?[\d\.]+,\d{2}\s+\d{2}/\d{2}/\d{4}", texto_completo, re.MULTILINE)
    if parcelas: dados["parcelas"] = str(max(int(p) for p in parcelas))
    m_forma = re.search(r"Forma de Parcelamento\s*\n(?!Parcela)([^\n]+)", texto_completo, re.IGNORECASE)
    if m_forma: dados["forma_pagamento"] = m_forma.group(1).strip()
    return dados


def _extrair_layout_porto(texto_completo, ctx, dados):
    """Modelos Novos, Antigos, Premium, Sênior e Endosso da Porto e da Azul."""
    if re.search(r"Valor l[íi]quido\s+Juros\s+IOF", texto_completo, re.IGNORECASE):
        return _extrair_porto_frota(texto_completo, ctx, dados)

    eh_endosso = ctx["eh_endosso"] or "SUBSTITUICAO" in texto_completo.upper()
    eh_modelo_novo = "Dados da cotação" in texto_completo

    # 1. Apólice/Proposta
    m_apolice_novo = re.search(r"\b([0-9A-Z]{5,6}\-\d{10}\-\d\-\d)\b", texto_completo)
    if not m_apolice_novo: m_apolice_novo = re.search(r"\b(\d{2}\-\d{8})\b", texto_completo)
    m_apolice_antigo = re.search(r"N[ºo]?\s*(?:da)?\s*Proposta[:\s]*([A-Z0-9\-\/\.]+)", texto_completo, re.IGNORECASE)

    if m_apolice_novo: dados["numero_apolice"] = m_apolice_novo.group(1).strip()
    elif m_apolice_antigo: dados["numero_apolice"] = m_apolice_antigo.group(1).strip()

    # 2. Vencimento
    m_venc = re.search(r"[Dd][Aa][Ss]\s*24[Hh\s]*[OoRrAaSs]*\s*[Dd][Oo]\s*[Dd][Ii][Aa]\s*(\d{2}/\d{2}/\d{4})", texto_completo)
    if m_venc: dados["vencimento"] = m_venc.group(1)

    # 3. Segurado pelo texto (o nome do arquivo padronizado tem prioridade e é aplicado depois)
    if eh_modelo_novo:
        m_seg = re.search(r"Segurado\(a\)[\s\|]*Nascimento[\s\|]*CPF[\r\n]+([A-ZÀ-ÿ\s]+?)\s*\|", texto_completo)
    else:
        m_seg = re.search(r"Proponente\s*/\s*Segurado\(a\)[\r\n\s]+([A-ZÀ-ÿ\s]+?)(?:\s+Profissão|\n)", texto_completo)
    if m_seg:
        nome_cand = m_seg.group(1).strip().upper()
        if "PROPONENTE" not in nome_cand and "PESSOA" not in nome_cand:
            dados["segurado"] = nome_cand

    # 4 e 5. Veículo e valores
    if eh_modelo_novo:
        # Linha do veículo: "... 1144 - - VERSA SEDAN SL 1.6 16V FLEX 2015 / 2016"
        m_mod = re.search(r"\b\d{3,6}\s*-\s*-\s*([^\n]+?)\s+\d{4}\s*/\s*\d{4}", texto_completo)
        if not m_mod:
            m_mod = re.search(r"(?:\d{3,6}\-)?([A-ZÀ-ÿ0-9\s\.\-]+?)\s*(?:\|)?\s*\d{4}/\d{4}", texto_completo)
        if m_mod:
            dados["modelo_carro"] = m_mod.group(1).strip()

        bloco_pag = re.search(r"Valor total([\s\S]+?)(?:Banco|Questionário|Uso Interno)", texto_completo, re.IGNORECASE)
        if bloco_pag:
            texto_pag = bloco_pag.group(1)

            m_forma = re.search(r"(\d{2}\-[A-Za-zÀ-ÿ0-9\s\.\-]+)", texto_pag)
            if m_forma: dados["forma_pagamento"] = re.sub(r"^\d{2}\-", "", m_forma.group(1)).strip()

            m_parc = re.search(r"(\d{1,2})x", texto_pag)
            if m_parc: dados["parcelas"] = m_parc.group(1)

            valores = re.findall(r"([\d\.]+,\d{2})", texto_pag)
            if len(valores) >= 2:
                dados["premio_liquido"] = valores[0]
                dados["premio_total"] = valores[-1]
    else:
        m_mod = re.search(r"(?:VEÍCULOS?|Veiculo)[^\n]*\n(?:[^\n]*\n)?\s*\d+\s*(?:-\s*)*([A-ZÀ-ÿ0-9\s\.\-\/\(\)]+?)(?=\s+\d{4}\s*/\s*\d{4}|\n)", texto_completo, re.IGNORECASE)
        if not m_mod: m_mod = re.search(r"Ve.culo[\r\n\s]+(?:\d+\s+)?([^\r\n]+?)(?=\s+Placa|\s+Ano|\n)", texto_completo, re.IGNORECASE)
        if m_mod:
            dados["modelo_carro"] = re.sub(r"^[\-\s]+", "", m_mod.group(1)).strip()

        if "SEM MOVIMENTO DE PRÊMIO" in texto_completo.upper() or "PRÊMIO TOTAL LÍQUIDO:\nR$ 0,00" in texto_completo.upper():
            dados["forma_pagamento"] = "Sem Movimento (Endosso)"
            dados["premio_liquido"] = "0,00"
            dados["premio_total"] = "0,00"
            dados["parcelas"] = "1"
        else:
            m_liq = re.search(r"Prêmio\s*(?:Total\s*)?Líquido[:\s\n\r\|]*R?\$?\s*([\d\.]+,\d{2})", texto_completo, re.IGNORECASE)
            if m_liq: dados["premio_liquido"] = m_liq.group(1)

            m_tot = re.search(r"Prêmio\s*Total[:\s\n\r\|]*R?\$?\s*([\d\.]+,\d{2})", texto_completo, re.IGNORECASE)
            if m_tot: dados["premio_total"] = m_tot.group(1)

            m_parc = re.search(r"(\d{1,2})\s*x\s*([A-ZÀ-ÿ\s0-9/-]+?)(?=\n|Prêmio|R\$)", texto_completo, re.IGNORECASE)
            if m_parc:
                dados["parcelas"] = m_parc.group(1)
                dados["forma_pagamento"] = re.sub(r"TODAS|DEMAIS|BANDEIRAS", "", m_parc.group(2), flags=re.IGNORECASE).strip()

    # Endosso identificado pelo texto (ex.: SUBSTITUIÇÃO) num arquivo fora do padrão
    if eh_endosso and ctx["movimento"] == "Emissão" and not ctx["padrao_ok"]:
        ctx["tipo_documento"], ctx["movimento"] = "Endosso", "Endosso"
    return dados


def extrair_porto_re(texto_completo, ctx, dados):
    """Porto Seguro Residencial e Empresarial (mesmo layout: 'DEMONSTRATIVO DE PRÊMIO GERAL')."""
    m_ap = re.search(r"PROPOSTA DE SEGURO\s+(\d{6,})", texto_completo)
    if m_ap: dados["numero_apolice"] = m_ap.group(1)
    # "VIGÊNCIA DAS 00:01 DO DIA ..." e a data vem na linha de baixo
    m_venc = re.search(r"VIG[ÊE]NCIA DAS 00:01 DO DIA[^\n]*\n[^\n]*?(\d{2}/\d{2}/\d{4})", texto_completo)
    if m_venc: dados["vencimento"] = m_venc.group(1)
    # Colunas: líquido coberturas | líquido cláusulas | LÍQUIDO TOTAL | custo apólice | IOF | PRÊMIO TOTAL
    valores = valores_abaixo_do_cabecalho(texto_completo, r"DEMONSTRATIVO DE PR[ÊE]MIO GERAL\s*\n[^\n]*PR[ÊE]MIO TOTAL")
    if len(valores) >= 3:
        dados["premio_liquido"], dados["premio_total"] = valores[2], valores[-1]
    m_pag = re.search(r"FORMA DE PAGAMENTO\s*\n\d+\s*-\s*(\d{1,2})\s*x\s*([^\n(]+)", texto_completo)
    if m_pag:
        dados["parcelas"], dados["forma_pagamento"] = m_pag.group(1), m_pag.group(2).strip()
    return dados


def extrair_porto_vida(texto_completo, ctx, dados):
    """Porto Seguro Vida / Acidentes Pessoais Individual."""
    m_ap = re.search(r"AP[ÓO]LICE N[ºo°]\s*([\d\.]+)", texto_completo)
    if m_ap: dados["numero_apolice"] = m_ap.group(1)
    m_venc = re.search(r"A PARTIR DAS 24 HORAS DO DIA\s*(\d{2}/\d{2}/\d{4})", texto_completo, re.IGNORECASE)
    if m_venc: dados["vencimento"] = m_venc.group(1)
    valores = valores_abaixo_do_cabecalho(texto_completo, r"PR[ÊE]MIO LIQUIDO\s+ADICIONAL FRACIONAMENTO[^\n]*VALOR TOTAL")
    if len(valores) >= 2:
        dados["premio_liquido"], dados["premio_total"] = valores[0], valores[-1]
    m_pag = re.search(r"VALOR DAS PARCELAS\s*\n(\d{1,2})\s+([A-ZÀ-Ú ]+?)\s+\d", texto_completo)
    if m_pag:
        dados["parcelas"], dados["forma_pagamento"] = m_pag.group(1), m_pag.group(2).strip()
    return dados


def extrair_porto_auto(texto_completo, ctx, dados):
    return _extrair_layout_porto(texto_completo, ctx, dados)


def extrair_azul_auto(texto_completo, ctx, dados):
    return _extrair_layout_porto(texto_completo, ctx, dados)


# ---------- BRADESCO ----------
def extrair_bradesco_auto(texto_completo, ctx, dados):
    m_apolice = re.search(r"Proposta:\s*(\d+)", texto_completo, re.IGNORECASE)
    if m_apolice: dados["numero_apolice"] = m_apolice.group(1).strip()

    m_venc = re.search(r"Vigência:\s*das\s*24h\s*de\s*(\d{2}/\d{2}/\d{4})", texto_completo, re.IGNORECASE)
    if m_venc: dados["vencimento"] = m_venc.group(1)

    m_seg = re.search(r"DADOS DO PROPONENTE[\s\S]*?Nome:\s*([^\r\n]+)", texto_completo, re.IGNORECASE)
    if not m_seg: m_seg = re.search(r"Nome:\s*([^\r\n]+)", texto_completo, re.IGNORECASE)
    if m_seg:
        nome_bruto = m_seg.group(1).strip()
        dados["segurado"] = re.sub(r"\s+(?:Vigência|CPF|Tipo).*$", "", nome_bruto, flags=re.IGNORECASE).strip()

    m_tipo_veiculo = re.search(r"Tipo do Veículo:\s*([^\r\n]+)", texto_completo, re.IGNORECASE)
    if m_tipo_veiculo:
        modelo_bruto = m_tipo_veiculo.group(1).strip()
        dados["modelo_carro"] = re.sub(r"\s+Placa:.*$", "", modelo_bruto, flags=re.IGNORECASE).strip()

    m_tel = re.search(r"Tel\.\s*Celular:\s*([\d\s\(\)\-]+)", texto_completo, re.IGNORECASE)
    if m_tel: dados["telefone"] = so_digitos(m_tel.group(1))

    m_liq = re.search(r"LÍQUIDO\s*\(Auto\+RCF\+APP\)\s*:\s*R?\$?\s*([\d\.]+,\d{2})", texto_completo, re.IGNORECASE)
    if m_liq: dados["premio_liquido"] = m_liq.group(1)

    m_tot = re.search(r"TOTAL\s*:\s*R?\$?\s*([\d\.]+,\d{2})", texto_completo, re.IGNORECASE)
    if m_tot: dados["premio_total"] = m_tot.group(1)

    m_parc = re.search(r"Quant\.\s*Parcelas:\s*(\d{1,2})", texto_completo, re.IGNORECASE)
    if m_parc: dados["parcelas"] = m_parc.group(1).lstrip("0")

    m_pag = re.search(r"Demais Parcelas:\s*(?!Valor)([A-ZÀ-ÿ ]+?)(?=\s+Valor|\n)", texto_completo, re.IGNORECASE)
    if m_pag:
        dados["forma_pagamento"] = m_pag.group(1).strip()
    else:
        # Pagamento à vista: a forma vem na linha da 1ª parcela ("... CONTA DÉBITO")
        m_1a = re.search(r"1[ªa]\s*Parcela:\s*([^\n]+)", texto_completo, re.IGNORECASE)
        linha = m_1a.group(1) if m_1a else ""
        if re.search(r"conta\s*d[ée]bito|d[ée]bito\s*em\s*conta", linha, re.IGNORECASE):
            dados["forma_pagamento"] = "Débito em Conta"
        elif re.search(r"boleto|ficha|compensa", linha, re.IGNORECASE):
            dados["forma_pagamento"] = "Boleto"
        elif re.search(r"cart[ãa]o", linha, re.IGNORECASE):
            dados["forma_pagamento"] = "Cartão de Crédito"

    # Layout de APÓLICE do Bradesco: cabeçalhos numa linha e valores na linha de baixo
    if "Sub-Total:" in texto_completo:
        valores = valores_abaixo_do_cabecalho(texto_completo, r"Sub-Total:\s+IOF:\s+Pr[êe]mio Total:")
        if len(valores) >= 3:
            dados["premio_liquido"], dados["premio_total"] = valores[0], valores[-1]
        m_mod = re.search(r"Marca/Tipo Ve[íi]culo\s+Ano de Fabrica[çc][ãa]o/Modelo\s*\n([^\n]+?)\s+\d{4}/\d{4}", texto_completo)
        if m_mod: dados["modelo_carro"] = m_mod.group(1).strip()
        m_forma = re.search(r"Tipo de Cobran[çc]a[^\n]*\n([A-Za-zÀ-ÿ ]+?)\s+\d", texto_completo)
        if m_forma: dados["forma_pagamento"] = m_forma.group(1).strip()
        m_parc = re.search(r"N[ºo°] de Presta[çc][õo]es[^\n]*\n(\d{1,2})\b", texto_completo)
        if m_parc: dados["parcelas"] = m_parc.group(1)
    return dados


def extrair_bradesco_residencial(texto_completo, ctx, dados):
    m_ap = re.search(r"Proposta\s*(?:\(cid:\d+\))?\s*N[ºo°]:\s*(\d+)", texto_completo, re.IGNORECASE)
    if m_ap: dados["numero_apolice"] = m_ap.group(1)
    m_venc = re.search(r"das 24 horas do dia\s*(\d{2}/\d{2}/\d{4})", texto_completo, re.IGNORECASE)
    if m_venc: dados["vencimento"] = m_venc.group(1)
    m_liq = re.search(r"Pr[êe]mio Tarifa\s+([\d\.]+,\d{2})", texto_completo, re.IGNORECASE)
    if m_liq: dados["premio_liquido"] = m_liq.group(1)
    m_tot = re.search(r"^Total\s+([\d\.]+,\d{2})", texto_completo, re.MULTILINE)
    if m_tot: dados["premio_total"] = m_tot.group(1)
    m_parc = re.search(r"Quantidade de Parcelas[^\n]*\n(\d{1,2})\s", texto_completo, re.IGNORECASE)
    if m_parc: dados["parcelas"] = m_parc.group(1)
    m_fp = re.search(r"Forma de Pagamento\s*\n[^\n]*?(Cart[ãa]o de Cr[ée]dito|D[ée]bito em Conta|Boleto|Carn[êe])",
                     texto_completo, re.IGNORECASE)
    if m_fp: dados["forma_pagamento"] = m_fp.group(1)
    return dados


# ---------- HDI ----------
def extrair_hdi_auto(texto_completo, ctx, dados):
    m_apolice = re.search(r"Especificação da Proposta\s*([\d\.]+)", texto_completo, re.IGNORECASE)
    if m_apolice: dados["numero_apolice"] = m_apolice.group(1).strip()

    m_venc = re.search(r"Das\s*24\s*h\s*do\s*dia\s*(\d{2}/\d{2}/\d{4})", texto_completo, re.IGNORECASE)
    if m_venc: dados["vencimento"] = m_venc.group(1)

    m_seg = re.search(r"Nome de Registro Segurado\s*:\s*([A-ZÀ-ÿ\s]+?)(?=\s+CPF|\r|\n)", texto_completo, re.IGNORECASE)
    if not m_seg: m_seg = re.search(r"Nome de Registro Segurado\s*:\s*([^\r\n]+)", texto_completo, re.IGNORECASE)
    if m_seg: dados["segurado"] = m_seg.group(1).strip().upper()

    m_tel = re.search(r"Celular\s*:\s*([\d\(\)\-]+)", texto_completo, re.IGNORECASE)
    if m_tel: dados["telefone"] = so_digitos(m_tel.group(1))

    m_placa = re.search(r"Placa/UF\s*:\s*([A-Z0-9\-]+)", texto_completo, re.IGNORECASE)
    if m_placa: dados["placa"] = m_placa.group(1).split("-")[0].strip().upper()

    m_mod = re.search(r"Modelo\s*:\s*[^\-\s]+\s*-\s*([^\r\n]+)", texto_completo, re.IGNORECASE)
    if not m_mod: m_mod = re.search(r"Modelo\s*:\s*([^\r\n]+)", texto_completo, re.IGNORECASE)
    if m_mod: dados["modelo_carro"] = m_mod.group(1).strip()

    m_liq = re.search(r"Prêmio Líquido\s*[:]?\s*R?\$?\s*([\d\.]+,\d{2})", texto_completo, re.IGNORECASE)
    if m_liq: dados["premio_liquido"] = m_liq.group(1)

    m_tot = re.search(r"Prêmio Total\s*[:]?\s*R?\$?\s*([\d\.]+,\d{2})", texto_completo, re.IGNORECASE)
    if m_tot: dados["premio_total"] = m_tot.group(1)

    m_parc = re.search(r"Forma de Pagamento\s*:\s*(\d{1,2})\s*x", texto_completo, re.IGNORECASE)
    if m_parc: dados["parcelas"] = m_parc.group(1)

    m_pag_forma = re.search(r"Tipo de Cobrança\s*:\s*([A-Za-zÀ-ÿ ]+)", texto_completo, re.IGNORECASE)
    if m_pag_forma: dados["forma_pagamento"] = m_pag_forma.group(1).strip()
    return dados


# ---------- SUÍÇA ----------
def extrair_suica_auto(texto_completo, ctx, dados):
    m_apolice = re.search(r"Nº\s*da\s*Proposta[\r\n\s]*(\d+)", texto_completo, re.IGNORECASE)
    if m_apolice: dados["numero_apolice"] = m_apolice.group(1).strip()

    m_venc = re.search(r"Início\s*às\s*24\s*horas\s*do\s*dia\s*(\d{2}/\d{2}/\d{4})", texto_completo, re.IGNORECASE)
    if m_venc: dados["vencimento"] = m_venc.group(1)

    m_seg = re.search(r"Nome\s*do\(a\)\s*Segurado\(a\)[\r\n]+([A-ZÀ-ÿ\s]{5,60})", texto_completo, re.IGNORECASE)
    if m_seg: dados["segurado"] = m_seg.group(1).strip().upper()

    m_tel = re.search(r"Celular[\r\n\s]*\(?(\d{2})\)?\s*([\d\-]+)", texto_completo, re.IGNORECASE)
    if m_tel: dados["telefone"] = so_digitos(m_tel.group(0))

    m_veic_sec = re.search(r"DADOS DO VEÍCULO([\s\S]+?)(?:LOCAL DE RISCO|DEMONSTRATIVO)", texto_completo, re.IGNORECASE)
    veic_text = m_veic_sec.group(1) if m_veic_sec else texto_completo

    m_mod = re.search(r"(?:Modelo|Modela)\s*:?\s*(.*?)(?=\s*(?:Ano\s*Fab/Mod|Chassi|Código\s*FIPE|CEP\s*Pernoite|Lotação|Tipo\s*de\s*utilização|Nota\s*fiscal)\b|\r?\n|$)", veic_text, re.IGNORECASE)
    if m_mod:
        modelo_bruto = m_mod.group(1).strip()
        modelo_bruto = re.sub(r"\s*/\s*(?:Carro|Moto|Caminh(?:ão|ao)).*$", "", modelo_bruto, flags=re.IGNORECASE).strip()
        modelo_bruto = re.sub(r"^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 .&'’-]*\s+-\s+", "", modelo_bruto).strip()
        dados["modelo_carro"] = modelo_bruto
    if not dados["modelo_carro"]:
        # Tabela: "Placa Código FIPE Modelo ..." -> "JAD4C19 023154-1 Nissan - KICKS SV 1.6 ... / Carro 2020 / 2020"
        m_lin = re.search(r"\d{6}-\d\s+([^\n]+?)\s*/\s*(?:Carro|Moto|Caminh)", veic_text, re.IGNORECASE)
        if m_lin:
            dados["modelo_carro"] = re.sub(r"^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 .&'’-]*?\s+-\s+", "", m_lin.group(1)).strip()

    m_demo = re.search(r"DEMONSTRATIVO DE PR[ÊE]MIO([\s\S]{1,200}?)(?:Placa|FORMA DE PAGAMENTO|DADOS DO VE[ÍI]CULO)", texto_completo, re.IGNORECASE)
    if m_demo:
        valores = re.findall(r"([\d]{1,3}(?:\.\d{3})*,\d{2})", m_demo.group(1))
        if len(valores) >= 3:
            dados["premio_liquido"] = valores[0]
            dados["premio_total"] = valores[2]
        elif len(valores) >= 2:
            dados["premio_liquido"] = valores[0]
            dados["premio_total"] = valores[-1]

    if not dados["premio_liquido"]:
        m_liq = re.search(r"Pr[êe]mio\s*L[íi]quido[\s\S]{1,40}?([\d\.]+,\d{2})", texto_completo, re.IGNORECASE)
        if m_liq: dados["premio_liquido"] = m_liq.group(1)
    if not dados["premio_total"]:
        m_tot = re.search(r"Pr[êe]mio\s*Total[\s\S]{1,40}?([\d\.]+,\d{2})", texto_completo, re.IGNORECASE)
        if m_tot: dados["premio_total"] = m_tot.group(1)

    total_parcelas = len(re.findall(r"\b\d{1,2}\s+\d{1,3},\d{2}\b", texto_completo))
    dados["parcelas"] = str(total_parcelas) if total_parcelas > 0 else "10"
    dados["forma_pagamento"] = "Cartão de Crédito"
    return dados


# ---------- ZURICH ----------
MESES_POR_EXTENSO = {"janeiro": "01", "fevereiro": "02", "marco": "03", "abril": "04", "maio": "05", "junho": "06",
                     "julho": "07", "agosto": "08", "setembro": "09", "outubro": "10", "novembro": "11", "dezembro": "12"}


def data_por_extenso(texto):
    """'13 de Outubro de 2026' -> '13/10/2026'"""
    m = re.search(r"(\d{1,2})\s+de\s+([A-Za-zçÇ]+)\s+de\s+(\d{4})", texto, re.IGNORECASE)
    if not m:
        return ""
    mes = MESES_POR_EXTENSO.get(remover_acentos(m.group(2)).lower())
    return f"{int(m.group(1)):02d}/{mes}/{m.group(3)}" if mes else ""


def _extrair_zurich_apolice(texto_completo, ctx, dados):
    """Layout 'Apólice / Endosso' da Zurich (diferente da proposta)."""
    m_ap = re.search(r"Ap[óo]lice:\s*(\d+)", texto_completo)
    if m_ap: dados["numero_apolice"] = m_ap.group(1)

    m_venc = re.search(r"In[íi]cio:\s*24\s*hs?\s*do\s*dia\s*([^\n]+?)\s*T[ée]rmino", texto_completo, re.IGNORECASE)
    if m_venc: dados["vencimento"] = data_por_extenso(m_venc.group(1))

    m_seg = re.search(r"Nome Completo:\s*([^\n]+)", texto_completo, re.IGNORECASE)
    if m_seg: dados["segurado"] = m_seg.group(1).strip().upper()

    m_mod = re.search(r"Ve[íi]culo:\s*([^\n]+?)\s+Ano\s*/\s*Modelo", texto_completo, re.IGNORECASE)
    if m_mod: dados["modelo_carro"] = m_mod.group(1).strip()

    m_liq = re.search(r"Pr[êe]mio\s+l[íi]quido\s+R\$\s*([\d\.]+,\d{2})", texto_completo, re.IGNORECASE)
    if m_liq: dados["premio_liquido"] = m_liq.group(1)
    m_tot = re.search(r"Pr[êe]mio\s+Total\s+R\$\s*([\d\.]+,\d{2})", texto_completo, re.IGNORECASE)
    if m_tot: dados["premio_total"] = m_tot.group(1)

    m_fp = re.search(r"Forma de Pagamento:\s*([^\n+]+)", texto_completo, re.IGNORECASE)
    if m_fp: dados["forma_pagamento"] = m_fp.group(1).strip()
    # Tabela de parcelas em duas colunas: "01 Conforme ... 267,70 07 Conforme ... 267,63"
    bloco = re.search(r"NP Vencimento Valor([\s\S]+?)(?:Titular|Corretor|Banco|$)", texto_completo)
    if bloco:
        numeros = re.findall(r"(?:^|\s)(\d{2})\s+(?:Conforme|\d{2}/\d{2}/\d{4})", bloco.group(1))
        if numeros: dados["parcelas"] = str(max(int(n) for n in numeros))
    return dados


def extrair_zurich_auto(texto_completo, ctx, dados):
    if "Apólice / Endosso" in texto_completo[:300] or "Conta do Prêmio" in texto_completo:
        return _extrair_zurich_apolice(texto_completo, ctx, dados)

    m_apolice = re.search(r"Proposta:\s*(\d+)", texto_completo, re.IGNORECASE)
    if m_apolice: dados["numero_apolice"] = m_apolice.group(1).strip()

    m_venc = re.search(r"Início de vigência:\s*24\s*Horas\s*de\s*(\d{2}/\d{2}/\d{4})", texto_completo, re.IGNORECASE)
    if m_venc: dados["vencimento"] = m_venc.group(1)

    m_seg = re.search(r"Nome completo:\s*([^\n]+)", texto_completo, re.IGNORECASE)
    if m_seg: dados["segurado"] = m_seg.group(1).strip().upper()

    m_tel = re.search(r"Celular:\s*([\d\s\(\)\-]+)", texto_completo, re.IGNORECASE)
    if m_tel: dados["telefone"] = so_digitos(m_tel.group(1))

    m_mod = re.search(r"Veículo:\s*([^\n]+?)\s+Ano/Modelo:", texto_completo, re.IGNORECASE)
    if m_mod: dados["modelo_carro"] = m_mod.group(1).strip()

    m_tot = re.search(r"Pr[êe]mio\s+Total\s*:\s*R\$\s*(-?[\d\.,]+)", texto_completo, re.IGNORECASE)   # aceita restituição (negativo)
    if m_tot: dados["premio_total"] = m_tot.group(1).strip()

    # Prêmio líquido = total - IOF
    m_iof = re.search(r"IOF[:\s]*R?\$?[\s\r\n]*([\d\.]+,\d{2})", texto_completo, re.IGNORECASE)
    if dados["premio_total"] and m_iof:
        try:
            val_total = float(dados["premio_total"].replace(".", "").replace(",", "."))
            val_iof = float(m_iof.group(1).replace(".", "").replace(",", "."))
            dados["premio_liquido"] = f"{val_total - val_iof:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
        except Exception:
            pass

    if not dados["premio_liquido"]:
        m_liq = re.search(r"Pr[êe]mio\s+L[íi]quido[\s\S]{1,200}?(?:Adicional|IOF)", texto_completo, re.IGNORECASE)
        if m_liq:
            m_val_liq = re.search(r"([\d]{1,3}(?:\.\d{3})*,\d{2})", m_liq.group(0))
            if m_val_liq: dados["premio_liquido"] = m_val_liq.group(1)

    m_parc = re.search(r"Número de Parcelas:\s*(\d{1,2})", texto_completo, re.IGNORECASE)
    if m_parc: dados["parcelas"] = m_parc.group(1)

    m_pag = re.search(r"Forma de Pagamento da Entrada:\s*([A-ZÀ-ÿ ]+?)(?=\s+Valor|\n|$)", texto_completo, re.IGNORECASE)
    if m_pag: dados["forma_pagamento"] = m_pag.group(1).strip()
    if not dados["forma_pagamento"]:   # endosso de restituição: "Forma pagamento demais parcelas: Transferencia Bancaria"
        m_dem = re.search(r"Forma pagamento demais parcelas:\s*([^\n]+)", texto_completo, re.IGNORECASE)
        if m_dem: dados["forma_pagamento"] = m_dem.group(1).strip()
    return dados


# ---------- YELUM ----------
def extrair_yelum_auto(texto_completo, ctx, dados):
    m_apolice = re.search(r"Proposta\s*N[°º]?\s*[\r\n]+\s*(\d{8,12})", texto_completo, re.IGNORECASE)
    if not m_apolice: m_apolice = re.search(r"Proposta\s*N[°º]?\s*[:\s]*(\d{8,12})", texto_completo, re.IGNORECASE)
    if m_apolice: dados["numero_apolice"] = m_apolice.group(1).strip()

    m_venc = re.search(r"Vigência\s*[:\s]*(\d{2}/\d{2}/\d{4})\s*a\s*(\d{2}/\d{2}/\d{4})", texto_completo, re.IGNORECASE)
    if not m_venc: m_venc = re.search(r"(\d{2}/\d{2}/\d{4})\s*a\s*(\d{2}/\d{2}/\d{4})", texto_completo, re.IGNORECASE)
    if m_venc: dados["vencimento"] = m_venc.group(1)

    m_seg = re.search(r"Nome do\(a\) Proponente/Segurado\(a\)\s*\n([^\n]+)", texto_completo, re.IGNORECASE)
    if not m_seg: m_seg = re.search(r"(?:CNPJ|CPF)[^\n]*\n([A-Za-zÀ-ÿ\s]{3,50})", texto_completo)
    if m_seg:
        nome_bruto = m_seg.group(1).strip()
        dados["segurado"] = re.sub(r"^(?:CNPJ|CPF|[\d\.\-\/])+\s*", "", nome_bruto, flags=re.IGNORECASE).strip().upper()

    m_tel = re.search(r"\(?(\d{2})\)?\s*(9\d{4}[-\s]?\d{4})", texto_completo)
    if m_tel: dados["telefone"] = so_digitos(m_tel.group(0))

    m_mod = re.search(r"\d{6}-\d\s+([A-Za-zÀ-ÿ0-9\s\.\-\(\)]+?)(?=\s+\d{4}/\d{4})", texto_completo)
    if not m_mod: m_mod = re.search(r"Marca/Tipo do Veículo[^\n]*\n\s*\d{6}-\d\s+([^\n]+)", texto_completo, re.IGNORECASE)
    if not m_mod: m_mod = re.search(r"(?:HB20|MARCH|ONIX|KWID|COMPASS|RENEGADE|COROLLA|CIVIC|HRV|FIESTA|KA|FOX|POLO|JETTA|GOL|SAVEIRO|STRADA|TORO|TERRITORY)[^\n]*", texto_completo, re.IGNORECASE)
    if m_mod:
        modelo_bruto = m_mod.group(1).strip() if m_mod.lastindex else m_mod.group(0).strip()
        dados["modelo_carro"] = re.sub(r"\s+\d{4}/\d{4}.*", "", modelo_bruto).strip()

    _premio_layout_yelum(texto_completo, dados)
    _pagamento_layout_yelum(texto_completo, dados)
    return dados


def _premio_layout_yelum(texto_completo, dados):
    """
    Yelum e Aliro (proposta e apólice): a linha logo abaixo do cabeçalho
    'Prêmio Líquido ... Prêmio Total ... Juros(%)' traz os valores; o líquido é o 1º e o total é o
    penúltimo (o último é o Juros %).
    """
    m_cab = re.search(r"Pr[êe]mio\s*L[íi]quido[^\n]*Juros\s*\(?%\)?\s*\n([^\n]+)", texto_completo, re.IGNORECASE)
    if m_cab:
        # Cancelamentos usam "-" nas colunas vazias: "R$796,15 - - - R$ -796,15 -"
        tokens = re.findall(r"-?\d{1,3}(?:\.\d{3})*,\d{2}|(?<!\S)-(?!\S)", m_cab.group(1).replace("R$", " "))
        valores = [t for t in tokens if t != "-"]
        if len(tokens) == 6:            # todas as colunas presentes: líquido é a 1ª e total é a 5ª
            dados["premio_liquido"], dados["premio_total"] = tokens[0], tokens[4]
            return
        if len(valores) >= 3:           # alguma coluna faltando: total é o penúltimo (o último é o Juros %)
            dados["premio_liquido"], dados["premio_total"] = valores[0], valores[-2]
            return
    if not dados["premio_total"]:   # último recurso (posição no texto — frágil)
        valores_gerais = re.findall(r"(\d{1,3}(?:\.\d{3})*,\d{2})", texto_completo)
        if len(valores_gerais) >= 5:
            dados["premio_liquido"] = valores_gerais[0]
            dados["premio_total"] = valores_gerais[3]


def _pagamento_layout_yelum(texto_completo, dados):
    m_parc_soma = re.search(r"(\d{1,2})\+(\d{1,2})\s*\([A-Z]+\)\s*-\s*([A-Za-zÀ-ÿ ]+?)(?=\n|\s\d)", texto_completo, re.IGNORECASE)
    m_parc = re.search(r"(\d{1,2})\s*x\s*\([A-Z]+\)\s*-\s*([A-Za-zÀ-ÿ ]+?)(?=\n|\s\d)", texto_completo, re.IGNORECASE)
    m_vista = re.search(r"A\s*VISTA\s*\w*\s*-\s*([A-Za-zÀ-ÿ ]+?)(?=\s+-?[\d\.]+,\d{2}|\n)", texto_completo, re.IGNORECASE)
    if m_parc_soma:
        dados["parcelas"] = str(int(m_parc_soma.group(1)) + int(m_parc_soma.group(2)))
        dados["forma_pagamento"] = m_parc_soma.group(3).strip()
    elif m_parc:
        dados["parcelas"] = m_parc.group(1)
        dados["forma_pagamento"] = m_parc.group(2).strip()
    elif m_vista:   # "AVISTA FB - CARNÊ"
        dados["parcelas"] = "1"
        dados["forma_pagamento"] = m_vista.group(1).strip()
    else:
        # Apólice: "Tipo de Cobrança ..." / "CARTAO DE CREDITO" / "Nº Parcelas ... 12"
        # "CARTAO DE CREDITO" pode vir sozinho na linha ou seguido da 1ª parcela ("CARTAO DE CREDITO 0001 13/09/2026")
        m_forma = re.search(r"Tipo de Cobran[çc]a[^\n]*\n(?:[^\n]*\n)?([A-ZÀ-Ú][A-ZÀ-Ú ]{5,}?)(?=\s+\d{4}\s|\n)", texto_completo)
        if m_forma and "ATEN" not in m_forma.group(1):
            dados["forma_pagamento"] = m_forma.group(1).strip()
        m_qtd = (re.search(r"N[ºo°]\s*Parcelas[^\n]*\n(\d{1,2})\s+\d{4}\s", texto_completo, re.IGNORECASE)
                 or re.search(r"N[ºo°]\s*Parcelas[\s\S]{0,120}?\n(\d{1,2})\n", texto_completo, re.IGNORECASE))
        if m_qtd: dados["parcelas"] = m_qtd.group(1)


def extrair_yelum_residencial(texto_completo, ctx, dados):
    m_apolice = re.search(r"Proposta\s*N[ºo]?\s*[\r\n]+\s*(\d{8,12})", texto_completo, re.IGNORECASE)
    if not m_apolice: m_apolice = re.search(r"Proposta\s*N[ºo]?\s*[:\s]*(\d{8,12})", texto_completo, re.IGNORECASE)
    if m_apolice: dados["numero_apolice"] = m_apolice.group(1).strip()

    m_venc = re.search(r"Vigência\s*[:\s]*(\d{2}/\d{2}/\d{4})", texto_completo, re.IGNORECASE)
    if m_venc: dados["vencimento"] = m_venc.group(1)

    m_seg = re.search(r"Nome do\(a\) Proponente/Segurado\(a\)[^\n]*[\r\n\s]+([A-ZÀ-ÿ\s]+?)(?=\s*[\r\n]+|\s+CPF)", texto_completo, re.IGNORECASE)
    if m_seg: dados["segurado"] = m_seg.group(1).strip().upper()

    m_tel = re.search(r"DADOS DO PROPONENTE[\s\S]{1,200}?Telefone\s*([\d\s]+?)(?:RUA|AVENIDA|CEP|E-mail|$)", texto_completo, re.IGNORECASE)
    if m_tel: dados["telefone"] = so_digitos(m_tel.group(1))

    m_demo = re.search(r"DEMONSTRATIVO DE PR.MIO([\s\S]{1,200}?)FORMA DE PAGAMENTO", texto_completo, re.IGNORECASE)
    if m_demo:
        valores = re.findall(r"([\d]{1,3}(?:\.\d{3})*,\d{2})", m_demo.group(1))
        if len(valores) >= 2:
            dados["premio_liquido"] = valores[0]
            dados["premio_total"] = valores[-1]

    if not dados["premio_total"]:
        valores_gerais = re.findall(r"([\d]{1,3}(?:\.\d{3})*,\d{2})", texto_completo)
        if len(valores_gerais) >= 5:
            dados["premio_liquido"] = valores_gerais[0]
            dados["premio_total"] = valores_gerais[4]

    m_pag = re.search(r"Tipo de Cobrança\s*[\r\n]+([^\r\n]+)", texto_completo, re.IGNORECASE)
    if m_pag:
        pag_texto = m_pag.group(1).strip()
        dados["forma_pagamento"] = pag_texto
        m_parc_soma = re.search(r"(\d+)\+(\d+)", pag_texto)
        if m_parc_soma:
            dados["parcelas"] = str(int(m_parc_soma.group(1)) + int(m_parc_soma.group(2)))
        else:
            m_parc_simples = re.search(r"^(\d+)", pag_texto)
            if m_parc_simples: dados["parcelas"] = m_parc_simples.group(1)

    # Layout com colunas na mesma linha do "Tipo de Cobrança": o último valor da linha de prêmios é o Juros %,
    # então usamos a leitura por colunas (líquido = 1ª, total = 5ª) e "1+5 - Cartão de Crédito - R$81,56"
    copia = dict(dados, premio_total="", premio_liquido="")
    _premio_layout_yelum(texto_completo, copia)
    if copia["premio_total"]:
        dados["premio_liquido"], dados["premio_total"] = copia["premio_liquido"], copia["premio_total"]
    m_soma = re.search(r"\n(\d{1,2})\+(\d{1,2})\s*-\s*([A-Za-zÀ-ÿ ]+?)\s*-", texto_completo)
    if m_soma:
        dados["parcelas"] = str(int(m_soma.group(1)) + int(m_soma.group(2)))
        dados["forma_pagamento"] = m_soma.group(3).strip()
    return dados


# ---------- ALIRO ----------
def _limpar_modelo_aliro(modelo_bruto):
    modelo = re.sub(r"^.*?o/Modelo[\r\n\s]*", "", modelo_bruto, flags=re.IGNORECASE | re.DOTALL)  # corta "o/Modelo"
    return re.sub(r"^\d{6}-\d[\r\n\s]*", "", modelo).strip()                                        # corta código FIPE


def extrair_aliro_auto(texto_completo, ctx, dados):
    m_venc = re.search(r"Vigência[\s\S]{1,80}?(\d{2}/\d{2}/\d{4})", texto_completo, re.IGNORECASE)
    if m_venc: dados["vencimento"] = m_venc.group(1)

    m_seg = re.search(r"([A-ZÀ-ÿ\s]{3,60})\n\s*\d{3}\.\d{3}\.\d{3}-\d{2}", texto_completo)
    if m_seg: dados["segurado"] = m_seg.group(1).strip().upper()

    # Modelo do carro (estratégia multicamada). 1º: linha da tabela "015156-4 HB20 UNIQUE 1.0 12V MEC.(FLEX) 2018/2019"
    m_lin = re.search(r"^\d{6}-\d\s+([^\n]+?)\s+\d{4}\s*/\s*\d{4}", texto_completo, re.MULTILINE)
    if m_lin:
        dados["modelo_carro"] = m_lin.group(1).strip()

    m_mod = None if dados["modelo_carro"] else re.search(
        r"([A-Z0-9\s\.\-\/\(\)]+?\((?:Flex|Gasolina|Diesel|Alcool|Eletrico|Híbrido)\))", texto_completo, re.IGNORECASE)
    if m_mod:
        dados["modelo_carro"] = _limpar_modelo_aliro(m_mod.group(1).strip())

    if not dados["modelo_carro"]:
        m_mod_fipe = re.search(r"\d{6}-\d\s+([A-Za-z0-9\s\.\-\/\(\)]+?)(?=\s+\d{4}/\d{4}|\n|$)", texto_completo)
        if m_mod_fipe: dados["modelo_carro"] = m_mod_fipe.group(1).strip()

    if not dados["modelo_carro"]:
        m_mod_brand = re.search(r"\b(?:PALIO|COMPASS|ARGO|HB20|MARCH|ONIX|KWID|RENEGADE|COROLLA|CIVIC|HRV|FIESTA|KA|FOX|POLO|JETTA|GOL|SAVEIRO|STRADA|TORO|TERRITORY|TRACKER|CRONOS|MOBI|CRETA|T-CROSS|NIVUS)\b[^\n]+", texto_completo, re.IGNORECASE)
        if m_mod_brand:
            dados["modelo_carro"] = _limpar_modelo_aliro(m_mod_brand.group(0).strip())

    m_tel = re.search(r"\(?(\d{2})\)?\s*(9\d{4}[-\s]?\d{4})", texto_completo)
    if m_tel: dados["telefone"] = so_digitos(m_tel.group(0))

    # Aliro usa o mesmo layout de prêmio/pagamento da Yelum
    _premio_layout_yelum(texto_completo, dados)
    _pagamento_layout_yelum(texto_completo, dados)
    return dados


# ---------- SUHAI ----------
def extrair_suhai_auto(texto_completo, ctx, dados):
    m_proposta = re.search(r"Proposta\s*:\s*(\d+)", texto_completo, re.IGNORECASE)
    if m_proposta: dados["numero_apolice"] = m_proposta.group(1)

    m_venc = re.search(r"Vigência\s*Proposta:[\s\S]{1,50}?(\d{2}/\d{2}/\d{4})", texto_completo, re.IGNORECASE)
    if m_venc: dados["vencimento"] = m_venc.group(1)

    m_seg = re.search(r"Nome/Razão Social[\r\n\s]+([A-ZÀ-ÿ\s]+)", texto_completo, re.IGNORECASE)
    if m_seg: dados["segurado"] = m_seg.group(1).strip().upper()

    m_placa = re.search(r"Placa[\r\n\s]+([\s\S]+?)Categoria", texto_completo, re.IGNORECASE)
    if m_placa:
        dados["placa"] = re.sub(r"[^A-Za-z0-9]", "", m_placa.group(1)).upper()

    m_modelo = re.search(r"\d{6}-\d[\r\n\s]+([\s\S]+?)[\r\n\s]+20\d{2}\s*/\s*20\d{2}", texto_completo, re.IGNORECASE)
    if m_modelo:
        dados["modelo_carro"] = re.sub(r"[\r\n\s]+", " ", m_modelo.group(1)).strip()

    m_demo = re.search(r"DEMONSTRATIVO DO PR[ÊE]MIO([\s\S]{1,150}?)DADOS DE PAGAMENTO", texto_completo, re.IGNORECASE)
    if m_demo:
        valores = re.findall(r"([\d]{1,3}(?:\.\d{3})*,\d{2})", m_demo.group(1))
        if len(valores) >= 2:
            dados["premio_liquido"] = valores[0]
            dados["premio_total"] = valores[-1]

    m_pag_block = re.search(r"DADOS DE PAGAMENTO([\s\S]{1,150}?)\(1\)", texto_completo, re.IGNORECASE)
    if not m_pag_block: m_pag_block = re.search(r"DADOS DE PAGAMENTO([\s\S]{1,150}?)Vig[êe]ncia", texto_completo, re.IGNORECASE)
    if m_pag_block:
        block = m_pag_block.group(1)
        m_forma = re.search(r"Forma de Pagamento[\r\n]+([A-Za-zÀ-ÿ\s]+?)(?:[\r\n]+|N[ºo°])", block, re.IGNORECASE)
        if m_forma: dados["forma_pagamento"] = re.sub(r"[\r\n\s]+", " ", m_forma.group(1)).strip()
        m_parc = re.search(r"Parcelas[^\d]+(\d+)", block, re.IGNORECASE)
        if m_parc: dados["parcelas"] = m_parc.group(1)

    # Proposta: "Forma de Pagamento Nº Parcelas ..." e na linha de baixo "Parcelado Cartão Recorrente 3 848,31 2.544,94"
    m_linha_pag = re.search(r"Forma de Pagamento\s+N[ºo°]\s*Parcelas[^\n]*\n([A-Za-zÀ-ÿ ]+?)\s+(\d{1,2})\s+[\d\.]+,\d{2}",
                            texto_completo, re.IGNORECASE)
    if m_linha_pag:
        dados["forma_pagamento"] = m_linha_pag.group(1).strip()
        dados["parcelas"] = m_linha_pag.group(2)

    # Layout de APÓLICE da Suhai (diferente da proposta)
    if not dados["premio_total"]:
        m_tot = re.search(r"Pr[êe]mio Total:\s*R\$\s*([\d\.]+,\d{2})", texto_completo, re.IGNORECASE)
        if m_tot: dados["premio_total"] = m_tot.group(1)
    if not dados["premio_liquido"]:
        m_liq = re.search(r"Pr[êe]mio\s*L[íi]quido\s*Total\s*R\$\s*([\d\.]+,\d{2})", texto_completo, re.IGNORECASE)
        if m_liq: dados["premio_liquido"] = m_liq.group(1)
    if not dados["modelo_carro"]:
        m_mod = re.search(r"Ano de Fabrica[çc][ãa]o/Modelo:\s*([^\n]+?)\s*0\s*km:", texto_completo, re.IGNORECASE)
        if m_mod:
            # "Mercedes-Benz -2019 - 2020/CLA-250 2.0 16V TB Aut." -> "Mercedes-Benz CLA-250 2.0 16V TB Aut."
            dados["modelo_carro"] = re.sub(r"\s*-\s*\d{4}\s*-\s*\d{4}\s*/\s*", " ", m_mod.group(1)).strip()
    if not dados["parcelas"]:
        m_parc = re.search(r"N[°ºo]\s*de\s*parcelas:\s*(\d{1,2})", texto_completo, re.IGNORECASE)
        if m_parc: dados["parcelas"] = m_parc.group(1)
    if not dados["forma_pagamento"]:
        m_fp = re.search(r"Forma de Pagamento:\s*([^\n]+)", texto_completo, re.IGNORECASE)
        if m_fp: dados["forma_pagamento"] = m_fp.group(1).strip()
    return dados


# ---------- TOKIO MARINE ----------
def extrair_tokio_auto(texto_completo, ctx, dados):
    # Endosso e APÓLICE da Tokio usam o mesmo layout ("Prêmio Líquido Total: R$ ... Cobrança: ...")
    layout_apolice = bool(re.search(r"Pr[êe]mio L[íi]quido Total:\s*R\$", texto_completo))
    if ctx["eh_endosso"] or layout_apolice:
        m_apolice = re.search(r"Apólice:\s*(\d+)", texto_completo, re.IGNORECASE)
        if not m_apolice: m_apolice = re.search(r"Negócio:\s*(\d+)", texto_completo, re.IGNORECASE)
        if m_apolice: dados["numero_apolice"] = m_apolice.group(1).strip()

        m_venc = re.search(r"Vigência: a partir das 24 horas do dia\s*(\d{2}/\d{2}/\d{4})", texto_completo, re.IGNORECASE)
        if m_venc: dados["vencimento"] = m_venc.group(1)

        m_seg = re.search(r"Segurado:\s*([A-ZÀ-ÿ\s]+?)(?:Nome Social:|CPF:)", texto_completo, re.IGNORECASE)
        if m_seg: dados["segurado"] = m_seg.group(1).strip().upper()

        m_tel = re.search(r"Celular:\s*(\(?\d{2}\)?\s*9\d{4}[-\s]?\d{4})", texto_completo, re.IGNORECASE)
        if m_tel: dados["telefone"] = so_digitos(m_tel.group(1))

        m_mod = re.search(r"Veículo:\s*([^\r\n]+)", texto_completo, re.IGNORECASE)
        if m_mod: dados["modelo_carro"] = m_mod.group(1).strip()

        m_liq = re.search(r"Prêmio Líquido Total:\s*R\$\s*([\d\.]+,\d{2})", texto_completo, re.IGNORECASE)
        if m_liq: dados["premio_liquido"] = m_liq.group(1)

        m_tot = re.search(r"Prêmio Total:\s*R\$\s*([\d\.]+,\d{2})", texto_completo, re.IGNORECASE)
        if m_tot: dados["premio_total"] = m_tot.group(1)

        m_pag = re.search(r"Cobrança:\s*([^\r\n]+)", texto_completo, re.IGNORECASE)
        if m_pag: dados["forma_pagamento"] = m_pag.group(1).strip()

        parcelas_endosso = len(re.findall(r"Endosso\s*\|\s*\d{2}\s*\|", texto_completo, re.IGNORECASE))
        # Apólice: tabela "01 211,53 11/09/2026 Cartão de Crédito"
        parcelas_apolice = re.findall(r"^(\d{2})\s+[\d\.]+,\d{2}\s+\d{2}/\d{2}/\d{4}", texto_completo, re.MULTILINE)
        if parcelas_endosso > 0:
            dados["parcelas"] = str(parcelas_endosso)
        elif parcelas_apolice:
            dados["parcelas"] = str(max(int(p) for p in parcelas_apolice))
        else:
            dados["parcelas"] = "1"
    else:
        m_apolice = re.search(r"Nº\s*Proposta/Negócio:\s*(\d+)", texto_completo, re.IGNORECASE)
        if m_apolice: dados["numero_apolice"] = m_apolice.group(1).strip()

        m_venc = re.search(r"Vigência[^\d]*(\d{2}/\d{2}/\d{4})", texto_completo, re.IGNORECASE)
        if m_venc: dados["vencimento"] = m_venc.group(1)

        m_seg = re.search(r"([A-Za-zÀ-ÿ\s]{3,50})\s+\d{3}\.\d{3}\.\d{3}-\d{2}", texto_completo)
        if m_seg: dados["segurado"] = re.sub(r"^(?:CNPJ|CPF)[\s\:\-\.]*", "", m_seg.group(1).strip(), flags=re.IGNORECASE).strip()

        m_tel = re.search(r"\(?(\d{2})\)?\s*(9\d{4}[-\s]?\d{4})", texto_completo)
        if m_tel: dados["telefone"] = so_digitos(m_tel.group(0))

        if not dados["modelo_carro"]:   # Tokio Moto: "Fabricante Veículo" / "ZONTES T310"
            m_fab = re.search(r"Fabricante\s+Ve[íi]culo\s*\n([^\n]+)", texto_completo)
            if m_fab: dados["modelo_carro"] = m_fab.group(1).strip()
        m_mod = re.search(r"(?:FORD|CHEVROLET|FIAT|VOLKSWAGEN|HYUNDAI|TOYOTA|HONDA|RENAULT|NISSAN|PEUGEOT|CITROEN|JEEP|MITSUBISHI)\s+[A-Za-zÀ-ÿ0-9\s\.\-]+?(?=\n\s*(?:Gasolina|Flex|Diesel|Alcool))", texto_completo, re.IGNORECASE)
        if m_mod:
            dados["modelo_carro"] = re.sub(r"\s*(?:Combustível|Lotação|Zero KM|Código FIPE).*", "", m_mod.group(0).strip(), flags=re.IGNORECASE).strip()

        m_pag = re.search(r"R\$\s*([\d\.]+,\d{2})\s+R\$\s*[\d\.]+,\d{2}\s+R\$\s*[\d\.]+,\d{2}\s+R\$\s*([\d\.]+,\d{2})\s+([A-Za-zÀ-ÿ]+)\s+(\d{1,2})", texto_completo, re.IGNORECASE)
        if m_pag:
            dados["premio_liquido"] = m_pag.group(1)
            dados["premio_total"] = m_pag.group(2)
            dados["forma_pagamento"] = m_pag.group(3).strip()
            dados["parcelas"] = m_pag.group(4)
    return dados


def extrair_tokio_empresarial(texto_completo, ctx, dados):
    """Proposta de seguro Empresarial (Patrimonial Compreensivo) da Tokio Marine."""
    m_ap = re.search(r"N[ºo°]\s*(?:da\s*)?Proposta[^\d\n]{0,15}(\d{5,})", texto_completo, re.IGNORECASE)
    if m_ap: dados["numero_apolice"] = m_ap.group(1)
    m_venc = re.search(r"Das\s*24h\d{0,2}\s*do\s*dia\s*(\d{2}/\d{2}/\d{4})", texto_completo, re.IGNORECASE)
    if m_venc: dados["vencimento"] = m_venc.group(1)
    valores = valores_abaixo_do_cabecalho(texto_completo, r"Pr[êe]mio L[íi]quido R\$[^\n]*Pr[êe]mio Total R\$")
    if len(valores) >= 2:
        dados["premio_liquido"], dados["premio_total"] = valores[0], valores[-1]
    # "Boleto (X) 1 + 11 435,61 ..." -> 12 parcelas no boleto
    m_pag = re.search(r"\n([A-Za-zÀ-ÿ ]+?)\s*\(X\)\s*(\d{1,2})(?:\s*\+\s*(\d{1,2}))?", texto_completo)
    if m_pag:
        dados["forma_pagamento"] = m_pag.group(1).strip()
        dados["parcelas"] = str(int(m_pag.group(2)) + int(m_pag.group(3) or 0))
    return dados


def extrair_tokio_viagem(texto_completo, ctx, dados):
    """Proposta de Seguro Viagem da Tokio Marine."""
    m_ap = re.search(r"N[ºo°]\s*Proposta:\s*(\d+)", texto_completo, re.IGNORECASE)
    if m_ap: dados["numero_apolice"] = m_ap.group(1)

    m_seg = re.search(r"Proponente\s+Nome Social\s+CPF[^\n]*\n([A-ZÀ-Ú ]+?)\s+\d{3}\.\d{3}\.\d{3}-\d{2}", texto_completo)
    if m_seg: dados["segurado"] = m_seg.group(1).strip()

    # "00h01 de09/10/2026 às 23h59 de19/10/2026" -> início da viagem
    m_venc = re.search(r"Vig[êe]ncia Seguro Viagem[^\n]*\n[^\n]*?(\d{2}/\d{2}/\d{4})", texto_completo, re.IGNORECASE)
    if m_venc: dados["vencimento"] = m_venc.group(1)

    m_val = re.search(r"Pr[êe]mio L[íi]quido \(R\$\)\s+Pr[êe]mio total \(R\$\)[^\n]*\n\s*([\d\.]+,\d{2})\s+([\d\.]+,\d{2})",
                      texto_completo, re.IGNORECASE)
    if m_val:
        dados["premio_liquido"], dados["premio_total"] = m_val.group(1), m_val.group(2)

    m_parc = re.search(r"N[ºo°]\s*Parcelas[^\n]*\n[^\n]*?\d{3}\.\d{3}\.\d{3}-\d{2}\s+(\d{1,2})\s", texto_completo, re.IGNORECASE)
    if m_parc: dados["parcelas"] = m_parc.group(1)
    if re.search(r"cart[ãa]o de cr[ée]dito|\*{6,}\d{4}", texto_completo, re.IGNORECASE):
        dados["forma_pagamento"] = "Cartão de Crédito"

    m_dest = re.search(r"Destino da Viagem:\s*([^\n]+)", texto_completo, re.IGNORECASE)
    if m_dest: dados["detalhe"] = m_dest.group(1).strip()
    return dados


# ---------- ALLIANZ ----------
def extrair_allianz_auto(texto_completo, ctx, dados):
    m_apolice = re.search(r"(?:N[ºo\.]?\s*da\s*Proposta|Proposta\s*N[°º]?):\s*(\d+)", texto_completo, re.IGNORECASE)
    if m_apolice: dados["numero_apolice"] = m_apolice.group(1).strip()

    m_venc = re.search(r"Vigência[\s\S]{1,60}?(\d{2}/\d{2}/\d{4})", texto_completo, re.IGNORECASE)
    if m_venc: dados["vencimento"] = m_venc.group(1)

    m_seg = re.search(r"Nome:\s*([^\r\n]+)", texto_completo, re.IGNORECASE)
    if m_seg:
        nome_bruto = m_seg.group(1).strip()
        dados["segurado"] = re.sub(r"^(?:CNPJ|CPF)[\s\:\-\.]*", "", nome_bruto, flags=re.IGNORECASE).split('\n')[0].strip().upper()

    m_mod = re.search(r"Veículo:\s*([^\r\n]+)", texto_completo, re.IGNORECASE)
    if m_mod: dados["modelo_carro"] = m_mod.group(1).strip()

    m_liq = re.search(r"(?:Preço|Prêmio)\s*L[íi]quido[\s\S]{1,40}?R\$\s*([\d\.]+,\d{2})", texto_completo, re.IGNORECASE)
    if m_liq: dados["premio_liquido"] = m_liq.group(1)

    m_tot = re.search(r"(?:Preço|Prêmio)\s*Total[\s\S]{1,60}?R\$\s*([\d\.]+,\d{2})", texto_completo, re.IGNORECASE)
    if m_tot: dados["premio_total"] = m_tot.group(1)

    m_parc = re.search(r"em\s*(\d{1,2})\s*parcelas", texto_completo, re.IGNORECASE)
    if not m_parc: m_parc = re.search(r"Nº\s*de\s*Parcelas:\s*(\d{1,2})", texto_completo, re.IGNORECASE)
    if m_parc: dados["parcelas"] = m_parc.group(1)

    m_fp = re.search(r"(Cartão\s*de\s*Crédito|Débito\s*em\s*conta|Boleto)", texto_completo, re.IGNORECASE)
    if m_fp: dados["forma_pagamento"] = m_fp.group(1).strip()
    return dados


def extrair_allianz_residencial(texto_completo, ctx, dados):
    dados = extrair_allianz_auto(texto_completo, ctx, dados)   # campos comuns do layout Allianz
    if not dados["numero_apolice"]:
        m_ap = re.search(r"Proposta\s*N[°º]?:\s*(\d+)", texto_completo, re.IGNORECASE)
        if m_ap: dados["numero_apolice"] = m_ap.group(1).strip()
    m_liq = re.search(r"Preço\s*líquido:\s*R\$\s*([\d\.]+,\d{2})", texto_completo, re.IGNORECASE)
    if m_liq: dados["premio_liquido"] = m_liq.group(1)
    m_tot = re.search(r"Total\s*a\s*pagar[\s\S]{1,50}?R\$\s*([\d\.]+,\d{2})", texto_completo, re.IGNORECASE)
    if m_tot: dados["premio_total"] = m_tot.group(1)
    m_parc = re.search(r"em\s*(\d{1,2})\s*parcelas", texto_completo, re.IGNORECASE)
    if m_parc: dados["parcelas"] = m_parc.group(1)
    m_fp = re.search(r"(Débito\s*em\s*conta|Cartão\s*de\s*Crédito|Boleto)", texto_completo, re.IGNORECASE)
    if m_fp: dados["forma_pagamento"] = m_fp.group(1).strip()
    return dados


def extrair_allianz_empresarial(texto_completo, ctx, dados):
    dados = extrair_allianz_auto(texto_completo, ctx, dados)   # campos comuns do layout Allianz
    if not dados["numero_apolice"]:
        m_ap = re.search(r"Nº\.?\s*da\s*Proposta:\s*(\d+)", texto_completo, re.IGNORECASE)
        if m_ap: dados["numero_apolice"] = m_ap.group(1).strip()
    m_liq = re.search(r"Prêmio\s*Líquido[^\d]*?([\d\.]+,\d{2})", texto_completo, re.IGNORECASE)
    if m_liq: dados["premio_liquido"] = m_liq.group(1)
    m_tot = re.search(r"Prêmio\s*Total[^\d]*?([\d\.]+,\d{2})", texto_completo, re.IGNORECASE)
    if m_tot: dados["premio_total"] = m_tot.group(1)
    m_parc = re.search(r"N[ºo]?\s*de\s*Parcelas:\s*(\d{1,2})", texto_completo, re.IGNORECASE)
    if m_parc: dados["parcelas"] = m_parc.group(1)
    m_fp = re.search(r"Forma\s*de\s*Pagamento:\s*([^\r\n]+)", texto_completo, re.IGNORECASE)
    if m_fp: dados["forma_pagamento"] = m_fp.group(1).strip()
    return dados


# ---------- GENÉRICO (seguradora ou ramo ainda sem extrator próprio) ----------
def extrair_generico(texto_completo, ctx, dados):
    """Tentativa genérica. Tudo que passar por aqui sai marcado como 'Revisar' na coluna Conferência."""
    m_ap = re.search(r"(?:Ap[óo]lice|Proposta)\s*(?:N[ºo°\.]*)?\s*[:\-]?\s*(\d[\d\.\-\/]{5,})", texto_completo, re.IGNORECASE)
    if m_ap: dados["numero_apolice"] = m_ap.group(1).strip(" .-/")

    m_liq = re.search(r"Pr[êe]mio\s*(?:Total\s*)?L[íi]quido[\s\S]{0,40}?([\d\.]+,\d{2})", texto_completo, re.IGNORECASE)
    if m_liq: dados["premio_liquido"] = m_liq.group(1)

    m_tot = re.search(r"Pr[êe]mio\s*Total(?!\s*L[íi]quido)[\s\S]{0,40}?([\d\.]+,\d{2})", texto_completo, re.IGNORECASE)
    if m_tot: dados["premio_total"] = m_tot.group(1)

    m_parc = re.search(r"\b(\d{1,2})\s*(?:x|parcelas)\b", texto_completo, re.IGNORECASE)
    if m_parc: dados["parcelas"] = m_parc.group(1)

    m_fp = re.search(r"(Cartão\s*de\s*Crédito|Débito\s*em\s*conta|Boleto|PIX)", texto_completo, re.IGNORECASE)
    if m_fp: dados["forma_pagamento"] = m_fp.group(1).strip()
    return dados


# Registro: seguradora -> {ramo -> função}.
# Para adicionar um ramo novo (ex.: Porto Residencial), basta criar a função e incluir aqui.
# Se o ramo do PDF não tiver função própria, usa-se a de "Auto" da seguradora (comportamento antigo)
# e a linha sai marcada para revisão.
EXTRATORES = {
    "Porto Seguro": {"Auto": extrair_porto_auto, "Residencial": extrair_porto_re,
                     "Empresarial": extrair_porto_re, "Vida": extrair_porto_vida},
    "Azul":         {"Auto": extrair_azul_auto},
    "Bradesco":     {"Auto": extrair_bradesco_auto, "Residencial": extrair_bradesco_residencial},
    "HDI":          {"Auto": extrair_hdi_auto},
    "Suíça":        {"Auto": extrair_suica_auto},
    "Zurich":       {"Auto": extrair_zurich_auto},
    "Yelum":        {"Auto": extrair_yelum_auto, "Residencial": extrair_yelum_residencial},
    "Aliro":        {"Auto": extrair_aliro_auto},
    "Suhai":        {"Auto": extrair_suhai_auto},
    "Tokio Marine": {"Auto": extrair_tokio_auto, "Viagem": extrair_tokio_viagem,
                     "Empresarial": extrair_tokio_empresarial},
    "Allianz":      {"Auto": extrair_allianz_auto,
                     "Residencial": extrair_allianz_residencial,
                     "Empresarial": extrair_allianz_empresarial},
    # "Viagem" ainda não tem nenhum extrator: os PDFs caem no genérico até mapearmos um exemplo.
}


def escolher_extrator(seguradora, ramo):
    """Retorna (função, rótulo_para_log, é_específico, motivo_para_conferência)."""
    por_ramo = EXTRATORES.get(seguradora)
    if not por_ramo:
        return extrair_generico, "genérico", False, "seguradora sem extrator (genérico)"
    if ramo in por_ramo:
        return por_ramo[ramo], f"{seguradora}/{ramo}", True, ""
    if "Auto" in por_ramo:
        return (por_ramo["Auto"], f"{seguradora}/Auto (sem extrator para {ramo})", False,
                f"{seguradora} sem extrator para {ramo} (usado o de Auto)")
    return extrair_generico, "genérico", False, f"{seguradora} sem extrator para {ramo} (genérico)"


# =======================================================
# 5. ORQUESTRAÇÃO DA EXTRAÇÃO
# =======================================================

def verificar_conferencia(dados, ctx):
    """Monta o texto da coluna Conferência: 'OK' ou o que precisa ser revisado manualmente."""
    # Obs.: o nº da apólice NÃO é cobrado aqui (decisão da corretora: dado opcional).
    pendencias = []
    if not ctx["padrao_ok"]:
        pendencias.append("nome de arquivo fora do padrão")
    if not ctx["extrator_especifico"]:
        pendencias.append(ctx.get("motivo_extrator", "sem extrator específico"))
    if dados["tipo_seguro"] == "Não Identificado":
        pendencias.append("tipo de seguro")
    for campo, rotulo in (("data_vigencia", "vigência"), ("premio_total", "prêmio total"),
                          ("premio_liquido", "prêmio líquido"), ("comissao_pct", "comissão %")):
        if not dados[campo]:
            pendencias.append(rotulo)
    if dados["tipo_seguro"] == "Auto" and not dados["placa"] and not dados["modelo_carro"]:
        pendencias.append("veículo")
    if not dados["cpf_cnpj"]:
        pendencias.append("CPF/CNPJ")
    return "OK" if not pendencias else "Revisar: " + ", ".join(pendencias)


def gerar_chave(dados):
    """
    Chave anti-duplicidade. NÃO usa só o nome: o mesmo cliente pode ter vários carros/seguros.
    Combina seguradora + tipo de documento + nº apólice + segurado + placa + data de vigência + prêmio total.
    O segurado entra porque uma mesma proposta pode ter vários segurados (ex.: viajantes do Seguro Viagem).
    """
    numero = re.sub(r"[^0-9A-Z]", "", dados["numero_apolice"].upper())
    partes = [
        remover_acentos(dados["seguradora"]).upper(),
        remover_acentos(dados["tipo_documento"]).upper(),
        numero,
        re.sub(r"[^A-Z]", "", remover_acentos(dados["segurado"]).upper()),
        dados["placa"],
        dados["data_vigencia"],
        so_digitos(dados["premio_total"]),
    ]
    return "|".join(partes)


def extrair_dados_pdf(pdf_bytes, nome_arquivo, texto_pronto=None):
    """texto_pronto: permite reaproveitar um texto já lido (usado no modo de teste local)."""
    dados = {
        "vencimento": "", "mes_vencimento": "", "data_vigencia": "", "numero_apolice": "", "segurado": "",
        "observacoes": "", "seguradora": "Não Identificada", "premio_total": "",
        "premio_liquido": "", "comissao": "", "comissao_pct": "",
        "placa": "", "email": "", "telefone": "", "pagamento": "",
        "modelo_carro": "", "parcelas": "", "forma_pagamento": "",
        # Novos campos
        "tipo_seguro": "", "tipo_documento": "", "movimento": "",
        "cpf_cnpj": "", "id_cliente": "", "conferencia": "", "chave": "", "arquivo": nome_arquivo,
        "extrator": "", "detalhe": "",
    }

    if texto_pronto is not None:
        texto_completo = texto_pronto
    else:
        try:
            texto_completo = ler_texto_pdf(pdf_bytes)
        except Exception:
            print(f"⚠️ ARQUIVO IGNORADO (Protegido por Senha ou Corrompido): {nome_arquivo}")
            return None

    if pdf_sem_texto(texto_completo):
        print(f"⚠️ ARQUIVO IGNORADO (PDF sem texto — é imagem/print de tela; precisa do PDF original): {nome_arquivo}")
        return None

    # 1. Nome do arquivo, seguradora e ramo
    info_arquivo = interpretar_nome_arquivo(nome_arquivo)
    dados["seguradora"], ramo_sugerido = identificar_seguradora(texto_completo)
    dados["comissao_pct"] = info_arquivo["comissao_pct"]

    ctx = {
        "nome_arquivo": nome_arquivo,
        "tipo_documento": info_arquivo["tipo_documento"],
        "movimento": MOVIMENTO_POR_DOCUMENTO[info_arquivo["tipo_documento"]],
        "ramo": identificar_ramo(texto_completo, info_arquivo, ramo_sugerido),
        "padrao_ok": info_arquivo["padrao_ok"],
    }
    ctx["eh_endosso"] = ctx["movimento"] in ("Endosso", "Cancelamento")
    ctx["eh_cancelamento"] = ctx["movimento"] == "Cancelamento"

    # 2. Dados universais
    extrair_contatos_universais(texto_completo, dados)
    dados["cpf_cnpj"] = extrair_documento_segurado(texto_completo)

    # 3. Extrator específico da seguradora / ramo
    funcao, rotulo, especifico, motivo = escolher_extrator(dados["seguradora"], ctx["ramo"])
    ctx["extrator_especifico"], ctx["motivo_extrator"] = especifico, motivo
    dados["extrator"] = rotulo
    if VERBOSO:
        print(f"   ↳ Extrator: {rotulo} | Documento: {ctx['tipo_documento']}")
    try:
        dados = funcao(texto_completo, ctx, dados)
    except Exception as e:
        print(f"Erro ao aplicar Regex no arquivo {nome_arquivo}: {e}")
        ctx["extrator_especifico"], ctx["motivo_extrator"] = False, f"erro no extrator: {e}"

    # 4. Nome do arquivo padronizado tem prioridade sobre o nome lido no PDF
    if info_arquivo["nome"]:
        dados["segurado"] = info_arquivo["nome"]

    # 5. Endosso/Cancelamento: a data que vale é a do ENDOSSO (decisão da corretora), não o início da apólice.
    #    A maioria dos extratores já lê a data do endosso; aqui corrigimos os layouts que trazem as duas datas.
    if ctx["movimento"] in ("Endosso", "Cancelamento"):
        for padrao in (r"a partir de\s*(\d{2}/\d{2}/\d{4}),?\s*procede-se",   # Yelum/Aliro: "a partir de 12/08/2026, procede-se..."
                       r"Das\s*24:00\s*hs\s*de\s*(\d{2}/\d{2}/\d{4})",         # Yelum/Aliro: vigência do endosso
                       r"Vig[êe]ncia do item:\s*(\d{2}/\d{2}/\d{4})"):        # Porto Auto Frota
            m_end = re.search(padrao, texto_completo, re.IGNORECASE)
            if m_end:
                dados["vencimento"] = m_end.group(1)
                break

    # 6. Fallbacks universais
    if not dados["vencimento"]:
        m_univ_venc = re.search(r"(?:vigência|início)[\s\S]{1,50}?(\d{2}/\d{2}/\d{4})", texto_completo, re.IGNORECASE)
        if m_univ_venc: dados["vencimento"] = m_univ_venc.group(1)

    # Reserva universal para prêmios (inclui valores NEGATIVOS de restituição em endossos/cancelamentos)
    if not dados["premio_total"] or not dados["premio_liquido"]:
        valores = valores_abaixo_do_cabecalho(texto_completo, r"Pr[êe]mio\s*L[íi]quido[^\n]*Pr[êe]mio\s*Total")
        if len(valores) >= 2:
            dados["premio_liquido"] = dados["premio_liquido"] or valores[0]
            dados["premio_total"] = dados["premio_total"] or valores[-1]
    if not dados["premio_total"]:
        m_tot = re.search(r"Pr[êe]mio\s*Total(?!\s*L[íi]quido)\s*(?:\(R\$\))?\s*:?\s*R?\$?\s*(-?[\d\.]+,\d{2})",
                          texto_completo, re.IGNORECASE)
        if m_tot: dados["premio_total"] = m_tot.group(1)

    for campo in ("premio_total", "premio_liquido"):
        dados[campo] = formatar_valor(dados[campo])
    # Restituição: se o total é negativo, o líquido também é (alguns PDFs mostram o líquido sem sinal)
    if dados["premio_total"].startswith("-") and dados["premio_liquido"] and \
            not dados["premio_liquido"].startswith("-") and so_digitos(dados["premio_liquido"]).strip("0"):
        dados["premio_liquido"] = "-" + dados["premio_liquido"]

    # 6. Dia (coluna A) e mês (roteamento das abas); a data completa fica guardada para a chave
    if dados["vencimento"] and "/" in dados["vencimento"]:
        dados["data_vigencia"] = dados["vencimento"]
        partes_data = dados["vencimento"].split("/")
        dados["vencimento"] = partes_data[0].strip()
        if len(partes_data) >= 2:
            dados["mes_vencimento"] = partes_data[1].strip()

    # 7. Tipo de seguro, documento e observações
    dados["tipo_seguro"] = ctx["ramo"]
    dados["tipo_documento"] = ctx["tipo_documento"]
    dados["movimento"] = ctx["movimento"]

    if dados["tipo_seguro"] == "Auto":
        # Corta campos que vêm grudados no modelo: "... Produto: Automoveis 1211", "... Chassi: 3N1B...", "... Emissão: 30/09"
        modelo = re.split(r"\s+(?:Produto|Emiss[ãa]o|Chassi|Data)\s*:", dados["modelo_carro"])[0].strip()
        dados["observacoes"] = modelo or "Modelo não identificado"
    else:
        dados["placa"] = ""   # evita "placas" falsas em seguros que não são de veículo
        dados["observacoes"] = f"Seguro {dados['tipo_seguro']}" if dados["tipo_seguro"] != "Não Identificado" \
            else "Tipo de seguro não identificado"
        if dados["detalhe"]:   # ex.: destino da viagem
            dados["observacoes"] += f" - {dados['detalhe']}"

    # 8. Telefone e pagamento (padronização)
    dados["telefone"] = normalizar_telefone(dados["telefone"]) or encontrar_telefone(texto_completo)
    dados["parcelas"] = dados["parcelas"].lstrip("0")   # "05" -> "5"; "00" (cancelamento sem parcelas) -> ""
    dados["forma_pagamento"] = re.sub(r"\s+", " ", dados["forma_pagamento"]).strip(" -")
    if dados["parcelas"] and dados["forma_pagamento"]:
        dados["pagamento"] = f"{dados['parcelas']} Parcelas - {dados['forma_pagamento']}"
    elif dados["parcelas"]:
        dados["pagamento"] = f"{dados['parcelas']} Parcelas"
    elif dados["forma_pagamento"]:
        dados["pagamento"] = dados["forma_pagamento"]

    # Comissão = Prêmio Líquido × Comissão % (restituição negativa gera estorno negativo); sem dado -> 0,00
    dados["comissao"] = calcular_comissao(dados["premio_liquido"], dados["comissao_pct"])

    # 9. ID do cliente, conferência e chave anti-duplicidade
    dados["id_cliente"] = gerar_id_cliente(dados["cpf_cnpj"])
    dados["conferencia"] = verificar_conferencia(dados, ctx)
    dados["chave"] = gerar_chave(dados)
    return dados


# =======================================================
# 6. PLANILHA
# =======================================================
def montar_linha(dados):
    """Ordem idêntica a CABECALHO_MENSAL. O CPF NÃO entra aqui — só o ID do cliente."""
    return [
        dados["vencimento"],       # A (Apenas o Dia)
        dados["numero_apolice"],   # B
        dados["segurado"],         # C
        dados["observacoes"],      # D
        dados["seguradora"],       # E
        dados["premio_total"],     # F
        dados["premio_liquido"],   # G
        dados["comissao"],         # H
        dados["comissao_pct"],     # I
        dados["placa"],            # J
        dados["email"],            # K
        dados["telefone"],         # L
        dados["pagamento"],        # M
        dados["tipo_seguro"],      # N
        dados["tipo_documento"],   # O
        dados["movimento"],        # P
        dados["id_cliente"],       # Q
        dados["conferencia"],      # R
        dados["chave"],            # S
        dados["arquivo"],          # T
        dados["data_vigencia"],    # U
    ]



def garantir_cabecalho(aba):
    """Garante colunas suficientes e preenche só os títulos que estão vazios (nunca sobrescreve os seus)."""
    if aba.col_count < len(CABECALHO_MENSAL):
        aba.add_cols(len(CABECALHO_MENSAL) - aba.col_count)
    atual = aba.row_values(1)
    novo = [atual[i] if i < len(atual) and str(atual[i]).strip() else CABECALHO_MENSAL[i]
            for i in range(len(CABECALHO_MENSAL))]
    if novo != atual[:len(CABECALHO_MENSAL)]:
        fim = gspread.utils.rowcol_to_a1(1, len(CABECALHO_MENSAL))
        aba.update(range_name=f"A1:{fim}", values=[novo])


def ordenar_planilha_por_vencimento(sheet):
    """Ordena as linhas pelo Dia do Vencimento (Coluna A), mantendo todas as colunas (A até a última usada)."""
    todos_dados = sheet.get_all_values()
    if len(todos_dados) <= 1:
        return

    largura = max(len(l) for l in todos_dados)
    cabecalho = todos_dados[0] + [""] * (largura - len(todos_dados[0]))
    linhas = [l + [""] * (largura - len(l)) for l in todos_dados[1:]]
    linhas.sort(key=lambda x: str(x[0]).zfill(2) if str(x[0]).strip() else "99")

    fim = gspread.utils.rowcol_to_a1(len(todos_dados), largura)
    sheet.update(range_name=f"A1:{fim}", values=[cabecalho] + linhas)
    print(f"Aba '{sheet.title}' ordenada com sucesso pelo Dia do Vencimento.")

    # O filtro antigo da planilha cobria só A:M. Ordenar por ele move A:M e deixa N:T para trás,
    # separando as colunas do mesmo registro. Por isso o filtro passa a cobrir TODAS as colunas usadas.
    try:
        sheet.set_basic_filter(f"A1:{fim}")
    except Exception as e:
        print(f"⚠️ Não foi possível ajustar o filtro da aba '{sheet.title}': {e}")


# =======================================================
# 7. FLUXO DE NUVEM (DRIVE -> SHEETS -> MOVE)
# =======================================================
def obter_aba_mes(planilha_doc, abas_modificadas, dados, file_name):
    nome_aba = MAPA_MESES.get(dados.get("mes_vencimento", ""))
    if not nome_aba:
        print(f"⚠️ Aviso: Mês não identificado para o arquivo {file_name}. Lançando na aba 'Pendentes'.")
        nome_aba = "Pendentes"

    if nome_aba not in abas_modificadas:
        try:
            aba = planilha_doc.worksheet(nome_aba)
        except gspread.exceptions.WorksheetNotFound:
            print(f"⚠️ Erro: Aba '{nome_aba}' não existe! Usando 'Apolices_Lidas' como fallback.")
            nome_aba = "Apolices_Lidas"
            aba = abas_modificadas.get(nome_aba) or planilha_doc.worksheet(nome_aba)
        garantir_cabecalho(aba)
        abas_modificadas[nome_aba] = aba
    return nome_aba, abas_modificadas[nome_aba]


def processar_fluxo():
    drive_service, gc = conectar_google()
    planilha_doc = gc.open_by_key(SPREADSHEET_ID)

    if not CPF_SALT:
        print("⚠️ CPF_SALT não configurado: a coluna 'ID Cliente' ficará vazia (o CPF continua salvo em Base_Clientes).")

    aba_controle = abrir_ou_criar_aba(planilha_doc, ABA_CONTROLE, CABECALHO_CONTROLE)
    chaves_lancadas = set(aba_controle.col_values(1)[1:])

    aba_clientes = abrir_ou_criar_aba(planilha_doc, ABA_CLIENTES, CABECALHO_CLIENTES, oculta=True)
    documentos_cadastrados = set(aba_clientes.col_values(2)[1:])

    abas_modificadas = {}
    resumo = {"lançados": 0, "duplicados": 0, "ignorados": 0, "erros": 0}

    pastas_clientes = {}   # cache das pastas "ficha do cliente" já encontradas/criadas nesta execução

    for arq in listar_pdfs(drive_service, FOLDER_ENTRADA_ID):
        file_id, file_name = arq["id"], arq["name"]
        print(f"Processando arquivo: {file_name}")

        try:
            # Proteção contra duas execuções ao mesmo tempo: se outra execução já tirou o PDF da pasta
            # de entrada, ele já foi lançado — não lança de novo.
            if not ainda_na_pasta(drive_service, file_id, FOLDER_ENTRADA_ID):
                print(f"⏭️ Já processado por outra execução: {file_name}")
                resumo["duplicados"] += 1
                continue

            if interpretar_nome_arquivo(file_name)["tipo_documento"] == "Orçamento":
                print(f"⚠️ Orçamento na pasta de apólices: {file_name}. Mova-o para a pasta Orçamentos.")
                resumo["ignorados"] += 1
                continue

            dados = extrair_dados_pdf(baixar_pdf(drive_service, file_id), file_name)
            if dados is None:
                resumo["ignorados"] += 1
                continue

            if not dados["segurado"]:
                print(f"⚠️ Aviso: Segurado não encontrado no arquivo {file_name}. Ignorado.")
                resumo["ignorados"] += 1
                continue

            # Anti-duplicidade: mesmo documento já lançado -> não lança de novo, só tira da entrada
            if dados["chave"] in chaves_lancadas:
                print(f"⏭️ Duplicado (já lançado antes): {file_name}")
                aba_controle.append_row([dados["chave"], agora_texto(), file_name, "", dados["seguradora"],
                                         dados["numero_apolice"], dados["tipo_documento"], "Duplicado - ignorado"])
                mover_para_ficha_do_cliente(drive_service, file_id, FOLDER_ENTRADA_ID, FOLDER_PROCESSADOS_ID,
                                            dados["segurado"], pastas_clientes)
                resumo["duplicados"] += 1
                continue

            nome_aba, aba_atual = obter_aba_mes(planilha_doc, abas_modificadas, dados, file_name)
            aba_atual.append_row(montar_linha(dados))

            chaves_lancadas.add(dados["chave"])
            aba_controle.append_row([dados["chave"], agora_texto(), file_name, nome_aba, dados["seguradora"],
                                     dados["numero_apolice"], dados["tipo_documento"], "Lançado"])

            if dados["cpf_cnpj"] and dados["cpf_cnpj"] not in documentos_cadastrados:
                aba_clientes.append_row([dados["id_cliente"], dados["cpf_cnpj"], dados["segurado"],
                                         agora_texto(), file_name])
                documentos_cadastrados.add(dados["cpf_cnpj"])

            mover_para_ficha_do_cliente(drive_service, file_id, FOLDER_ENTRADA_ID, FOLDER_PROCESSADOS_ID,
                                            dados["segurado"], pastas_clientes)
            resumo["lançados"] += 1
            print(f"✅ Lançado em '{nome_aba}' | {dados['tipo_seguro']} | {dados['movimento']} | {dados['conferencia']}")

        except Exception as e:
            # Um arquivo com problema não derruba o robô; ele fica na entrada para a próxima execução
            print(f"❌ Erro ao processar {file_name}: {e}")
            resumo["erros"] += 1

    # Ordena só as abas que receberam dados nesta execução
    for nome_aba, aba_object in abas_modificadas.items():
        print(f"Ordenando os dados na aba {nome_aba}...")
        ordenar_planilha_por_vencimento(aba_object)

    print(f"Resumo: {resumo}")


# =======================================================
# 8. MODO DE TESTE LOCAL (não acessa o Google)
#    python main.py --local            -> lê os PDFs de Seguros/amostras
#    python main.py --local <pasta>    -> lê os PDFs de outra pasta
# =======================================================
CAMPOS_TESTE = [
    ("arquivo", "Arquivo"), ("seguradora", "Seguradora"), ("tipo_seguro", "Tipo de Seguro"),
    ("tipo_documento", "Tipo Documento"), ("movimento", "Movimento"), ("segurado", "Segurado"),
    ("data_vigencia", "Vigência"), ("numero_apolice", "Nº Apólice"), ("premio_total", "Prêmio Total"),
    ("premio_liquido", "Prêmio Líquido"), ("comissao_pct", "Comissão %"), ("comissao", "Comissão"), ("placa", "Placa"),
    ("observacoes", "Observações"), ("email", "E-mail"), ("telefone", "Telefone"),
    ("pagamento", "Pagamento"), ("cpf_encontrado", "CPF encontrado"), ("extrator", "Extrator"),
    ("conferencia", "Conferência"),
]
# Campos que não fazem sentido comparar com o gabarito
CAMPOS_NAO_COMPARADOS = {"arquivo", "extrator", "conferencia"}
CAMPOS_VALOR = {"premio_total", "premio_liquido"}
CAMPOS_DIGITOS = {"telefone"}


def _normalizar_para_comparar(campo, valor):
    valor = re.sub(r"\s+", " ", remover_acentos(str(valor or ""))).strip().upper()
    if campo in CAMPOS_VALOR and valor:
        # Aceita "2.150,00", "2150,00" e "2150" (o Excel costuma reformatar os números)
        bruto = valor.replace("R$", "").strip()
        bruto = bruto.replace(".", "").replace(",", ".") if "," in bruto else bruto
        try:
            return f"{float(bruto):.2f}"
        except ValueError:
            return valor
    if campo in CAMPOS_DIGITOS:
        return so_digitos(valor)
    return valor


def _ler_csv_flexivel(caminho):
    """Lê CSV salvo pelo Excel/Sheets: aceita UTF-8 ou ANSI, separador ; ou ,"""
    for codificacao in ("utf-8-sig", "cp1252"):
        try:
            with open(caminho, encoding=codificacao, newline="") as f:
                conteudo = f.read()
            break
        except UnicodeDecodeError:
            continue
    separador = ";" if conteudo.split("\n", 1)[0].count(";") >= conteudo.split("\n", 1)[0].count(",") else ","
    return list(csv.DictReader(io.StringIO(conteudo), delimiter=separador))


def comparar_com_gabarito(resultados, caminho_gabarito, pasta):
    rotulo_para_campo = {rotulo: campo for campo, rotulo in CAMPOS_TESTE}
    gabarito = {}
    for linha in _ler_csv_flexivel(caminho_gabarito):
        nome = (linha.get("Arquivo") or "").strip()
        if nome:
            gabarito[nome] = {rotulo_para_campo[r]: v for r, v in linha.items() if r in rotulo_para_campo}

    acertos, totais, divergencias = {}, {}, []
    for r in resultados:
        esperado = gabarito.get(r["arquivo"])
        if not esperado:
            continue
        for campo, valor_esperado in esperado.items():
            if campo in CAMPOS_NAO_COMPARADOS:
                continue
            totais[campo] = totais.get(campo, 0) + 1
            obtido = r.get(campo, "")
            if _normalizar_para_comparar(campo, valor_esperado) == _normalizar_para_comparar(campo, obtido):
                acertos[campo] = acertos.get(campo, 0) + 1
            else:
                divergencias.append([r["arquivo"], dict(CAMPOS_TESTE)[campo], valor_esperado, obtido])

    if not totais:
        print("\n⚠️ Nenhum arquivo do gabarito.csv bate com os PDFs da pasta (confira a coluna 'Arquivo').")
        return

    print("\n================ COMPARAÇÃO COM O GABARITO ================")
    for campo, rotulo in CAMPOS_TESTE:
        if campo in totais:
            ok, tot = acertos.get(campo, 0), totais[campo]
            barra = "✅" if ok == tot else "⚠️"
            print(f"  {barra} {rotulo:16} {ok:3}/{tot:<3} ({ok / tot:.0%})")
    total_ok, total = sum(acertos.values()), sum(totais.values())
    print(f"  PRECISÃO GERAL: {total_ok}/{total} campos ({total_ok / total:.1%})")

    caminho_div = os.path.join(pasta, "divergencias.csv")
    with open(caminho_div, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["Arquivo", "Campo", "Esperado (gabarito)", "Obtido (robô)"])
        w.writerows(divergencias)
    if divergencias:
        print(f"\n  {len(divergencias)} divergência(s). Primeiras:")
        for arq, campo, esp, obt in divergencias[:15]:
            print(f"   - {arq[:45]:45} | {campo:14} | esperado: {esp!r} | obtido: {obt!r}")
        print(f"  Lista completa em: {caminho_div}")


def testar_local(pasta):
    global VERBOSO
    VERBOSO = False
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    if not os.path.isdir(pasta):
        print(f"Pasta não encontrada: {pasta}\nCrie a pasta e coloque os PDFs de teste dentro dela.")
        return
    pdfs = sorted(f for f in os.listdir(pasta) if f.lower().endswith(".pdf"))
    if not pdfs:
        print(f"Nenhum PDF encontrado em {pasta}")
        return

    pasta_textos = os.path.join(pasta, "_textos")
    os.makedirs(pasta_textos, exist_ok=True)

    resultados = []
    for nome in pdfs:
        try:
            with open(os.path.join(pasta, nome), "rb") as f:
                texto = ler_texto_pdf(f.read())
        except Exception as e:
            motivo = "protegido por SENHA" if "Password" in repr(e) else f"não abriu o PDF ({e!r})"
            resultados.append({"arquivo": nome, "conferencia": f"ERRO: {motivo}"})
            continue

        # Guarda o texto extraído: é com ele que ajustamos as regras de leitura
        with open(os.path.join(pasta_textos, nome[:-4] + ".txt"), "w", encoding="utf-8") as f:
            f.write(texto)

        dados = extrair_dados_pdf(None, nome, texto_pronto=texto)
        if dados is None:
            resultados.append({"arquivo": nome, "conferencia": "IGNORADO: PDF sem texto (escaneado?)"})
            continue
        linha = {campo: dados.get(campo, "") for campo, _ in CAMPOS_TESTE}
        linha["cpf_encontrado"] = "sim" if dados["cpf_cnpj"] else "não"
        resultados.append(linha)

    caminho_csv = os.path.join(pasta, "resultado_teste.csv")
    with open(caminho_csv, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow([rotulo for _, rotulo in CAMPOS_TESTE])
        for r in resultados:
            w.writerow([r.get(campo, "") for campo, _ in CAMPOS_TESTE])

    # Resumo no terminal
    print(f"\n================ RESULTADO ({len(resultados)} PDFs) ================")
    for r in resultados:
        conf = r.get("conferencia", "")
        icone = "✅" if conf == "OK" else ("❌" if conf.startswith(("ERRO", "IGNORADO")) else "⚠️")
        print(f"{icone} {r.get('seguradora', ''):13} {r.get('tipo_seguro', ''):12} {r.get('tipo_documento', ''):22} "
              f"{r.get('segurado', '')[:26]:26} {conf}")

    ok = sum(1 for r in resultados if r.get("conferencia") == "OK")
    print(f"\nPLACAR: {ok}/{len(resultados)} sem pendências ({ok / len(resultados):.0%})")

    por_seguradora = {}
    for r in resultados:
        s = r.get("seguradora") or "?"
        tot, oks = por_seguradora.get(s, (0, 0))
        por_seguradora[s] = (tot + 1, oks + (r.get("conferencia") == "OK"))
    for s, (tot, oks) in sorted(por_seguradora.items()):
        print(f"  {s:16} {oks}/{tot} OK")

    pendencias = {}
    for r in resultados:
        conf = r.get("conferencia", "")
        if conf.startswith("Revisar: "):
            for p in conf[len("Revisar: "):].split(", "):
                pendencias[p] = pendencias.get(p, 0) + 1
    if pendencias:
        print("\nPendências mais comuns:")
        for p, n in sorted(pendencias.items(), key=lambda x: -x[1])[:10]:
            print(f"  {n:3}x {p}")

    print(f"\nTabela completa: {caminho_csv}")
    print(f"Textos extraídos dos PDFs: {pasta_textos}")

    caminho_gabarito = os.path.join(pasta, "gabarito.csv")
    if os.path.exists(caminho_gabarito):
        comparar_com_gabarito(resultados, caminho_gabarito, pasta)
    else:
        print("\nDica: copie resultado_teste.csv para gabarito.csv, corrija as células erradas "
              "e rode de novo para medir a precisão campo a campo.")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--local":
        pasta_padrao = os.path.join(os.path.dirname(os.path.abspath(__file__)), "amostras")
        testar_local(sys.argv[2] if len(sys.argv) > 2 else pasta_padrao)
    else:
        processar_fluxo()
