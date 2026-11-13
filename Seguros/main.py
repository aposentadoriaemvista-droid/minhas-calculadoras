import os
import io
import re
import json
import hmac
import hashlib
import unicodedata
from datetime import datetime

import pdfplumber
import gspread
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

# =======================================================
# CONFIGURAÇÕES
# =======================================================
# FOLDER_ENTRADA_ID = os.environ.get("FOLDER_ENTRADA_ID", "13dEtD5RTWQiyt1INASVqPgaIt9RKudFO")
# FOLDER_PROCESSADOS_ID = os.environ.get("FOLDER_PROCESSADOS_ID", "1E1guR7b5jJzfiO3fnbZzoLnnaTBnjGYd")
# SPREADSHEET_ID = os.environ.get("SPREADSHEET_ID", "14wh7QYAW-m60TxkWugF0Hasd3y6MptyjXE1U7rPSL4E")

FOLDER_ENTRADA_ID = os.environ.get("FOLDER_ENTRADA_ID", "13dEtD5RTWQiyt1INASVqPgaIt9RKudFO")
FOLDER_PROCESSADOS_ID = os.environ.get("FOLDER_PROCESSADOS_ID", "1E1guR7b5jJzfiO3fnbZzoLnnaTBnjGYd")
SPREADSHEET_ID = os.environ.get("SPREADSHEET_ID", "1j1zgXc0HLYIQAjaTplN4Jw-Az-76Fylk48HoOlY5JGs")

# Chave secreta usada para transformar CPF/CNPJ em um ID de cliente.
# Defina como Secret no GitHub (CPF_SALT) e NUNCA troque depois: trocar o valor muda todos os IDs.
CPF_SALT = os.environ.get("CPF_SALT", "")

SCOPES = [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/spreadsheets",
]

# Mapa de conversão de número do mês para o nome da Aba no Sheets
MAPA_MESES = {
    "01": "Janeiro", "02": "Fevereiro", "03": "Março", "04": "Abril",
    "05": "Maio", "06": "Junho", "07": "Julho", "08": "Agosto",
    "09": "Setembro", "10": "Outubro", "11": "Novembro", "12": "Dezembro"
}

# Colunas das abas mensais. A..M são as colunas originais (não mude a ordem: o Data Studio depende delas).
# As novas colunas entram sempre no FINAL.
CABECALHO_MENSAL = [
    "Vencimento",        # A
    "Nº Apólice",        # B
    "Segurado",          # C
    "Observações",       # D
    "Seguradora",        # E
    "Prêmio Total",      # F
    "Prêmio Líquido",    # G
    "Comissão",          # H
    "Comissão %",        # I
    "Placa",             # J
    "E-mail",            # K
    "Telefone",          # L
    "Pagamento",         # M
    "Tipo de Seguro",    # N  (Auto / Residencial / Viagem / Empresarial)
    "Tipo Documento",    # O  (Proposta / Apólice / Proposta Endosso / Endosso / ... Cancelamento)
    "Movimento",         # P  (Emissão / Endosso / Cancelamento)
    "ID Cliente",        # Q  (ID gerado a partir do CPF/CNPJ — o CPF em si NÃO vai para esta aba)
    "Conferência",       # R  (OK ou lista do que precisa ser revisado)
    "Chave",             # S  (chave anti-duplicidade)
    "Arquivo",           # T  (nome do PDF de origem)
]

# Aba de controle: registra tudo que já foi lançado (é ela que impede lançamentos duplicados)
ABA_CONTROLE = "Controle_Lancamentos"
CABECALHO_CONTROLE = ["Chave", "Processado em", "Arquivo", "Aba", "Seguradora", "Nº Apólice", "Tipo Documento", "Situação"]

# Aba de clientes: ÚNICO lugar onde o CPF/CNPJ fica gravado. É criada oculta; proteja-a no Sheets.
ABA_CLIENTES = "Base_Clientes"
CABECALHO_CLIENTES = ["ID Cliente", "CPF/CNPJ", "Nome", "Primeiro registro", "Arquivo"]


# =======================================================
# CONEXÃO COM O GOOGLE
# =======================================================
def conectar_google():
    """Cria os clientes do Drive e do Sheets (só é chamada quando o robô roda de verdade)."""
    credenciais_json = os.environ.get("GOOGLE_CREDENTIALS")
    if credenciais_json:
        creds = service_account.Credentials.from_service_account_info(json.loads(credenciais_json), scopes=SCOPES)
    else:
        creds = service_account.Credentials.from_service_account_file("credentials.json", scopes=SCOPES)

    drive = build("drive", "v3", credentials=creds)
    try:
        # Repete automaticamente quando o Google responde "limite de requisições" (erro 429)
        gc = gspread.authorize(creds, http_client=gspread.http_client.BackOffHTTPClient)
    except (AttributeError, TypeError):
        gc = gspread.authorize(creds)
    return drive, gc


# =======================================================
# UTILITÁRIOS
# =======================================================
def remover_acentos(texto):
    return "".join(c for c in unicodedata.normalize("NFKD", texto) if not unicodedata.combining(c))


def so_digitos(texto):
    return re.sub(r"\D", "", texto or "")


def agora_texto():
    try:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo("America/Sao_Paulo")).strftime("%d/%m/%Y %H:%M")
    except Exception:
        return datetime.now().strftime("%d/%m/%Y %H:%M")


# =======================================================
# 1. LEITURA DO NOME DO ARQUIVO (padrão da corretora)
#    "<Tipo Documento> <NOME DO SEGURADO> <comissão>%.pdf"
# =======================================================
# A ordem importa: os nomes mais longos precisam ser testados primeiro.
TIPOS_DOCUMENTO = [
    ("Proposta Endosso Cancelamento", r"proposta\s+(?:de\s+)?endosso\s+(?:de\s+)?cancelamento"),
    ("Endosso Cancelamento",          r"endosso\s+(?:de\s+)?cancelamento"),
    ("Proposta Endosso",              r"proposta\s+(?:de\s+)?endosso"),
    ("Endosso",                       r"endosso"),
    ("Apólice",                       r"ap[oó]lice"),
    ("Proposta",                      r"proposta"),
]

MOVIMENTO_POR_DOCUMENTO = {
    "Proposta": "Emissão",
    "Apólice": "Emissão",
    "Proposta Endosso": "Endosso",
    "Endosso": "Endosso",
    "Proposta Endosso Cancelamento": "Cancelamento",
    "Endosso Cancelamento": "Cancelamento",
    "Não Identificado": "Não Identificado",
}

PALAVRAS_RAMO = {
    "auto": "Auto", "automovel": "Auto", "automóvel": "Auto",
    "viagem": "Viagem",
    "residencial": "Residencial", "residencia": "Residencial", "residência": "Residencial",
    "empresarial": "Empresarial", "pme": "Empresarial",
}


def interpretar_nome_arquivo(nome_arquivo):
    """
    Extrai do nome padronizado: tipo de documento, nome do segurado, comissão % e (se houver) o ramo.
    Ex.: "Proposta Endosso Cancelamento JOÃO DA SILVA 15%.pdf"
         "Proposta MARIA SOUZA - RESIDENCIAL 20%.pdf"
    """
    info = {"tipo_documento": "Não Identificado", "nome": "", "comissao_pct": "", "ramo": "", "padrao_ok": False}

    base = unicodedata.normalize("NFC", nome_arquivo)
    base = re.sub(r"\.pdf$", "", base, flags=re.IGNORECASE)
    base = re.sub(r"_texto$", "", base, flags=re.IGNORECASE)
    base = re.sub(r"\(\d+\)", " ", base)          # "(1)", "(2)" de cópias
    base = re.sub(r"[_\s]+", " ", base).strip()

    m_pct = re.search(r"(\d+(?:[.,]\d+)?)\s*%", base)
    if m_pct:
        info["comissao_pct"] = m_pct.group(1).replace(".", ",") + "%"

    resto = None
    for tipo, padrao in TIPOS_DOCUMENTO:
        m = re.match(rf"\s*{padrao}\b\s*[-–:]?\s*(?P<resto>.*)$", base, re.IGNORECASE)
        if m:
            info["tipo_documento"] = tipo
            info["padrao_ok"] = True
            resto = m.group("resto")
            break

    if resto is None:
        # Arquivo fora do padrão: tenta ao menos descobrir o tipo de documento
        nome_up = remover_acentos(base).upper()
        if "CANCELAMENTO" in nome_up:
            info["tipo_documento"] = "Endosso Cancelamento"
        elif "ENDOSSO" in nome_up:
            info["tipo_documento"] = "Endosso"
        elif "APOLICE" in nome_up:
            info["tipo_documento"] = "Apólice"
        elif "PROPOSTA" in nome_up:
            info["tipo_documento"] = "Proposta"
        return info

    # O nome do segurado é tudo que vem antes da comissão
    m_pct_resto = re.search(r"\d+(?:[.,]\d+)?\s*%", resto)
    if m_pct_resto:
        resto = resto[:m_pct_resto.start()]

    # Sufixo opcional de ramo: "NOME - RESIDENCIAL" ou "NOME RESIDENCIAL"
    m_ramo = re.search(r"\s*[-–]?\s*\b(auto|autom[oó]vel|viagem|residencial|resid[eê]ncia|empresarial|pme)\s*[-–]?\s*$",
                       resto, re.IGNORECASE)
    if m_ramo:
        info["ramo"] = PALAVRAS_RAMO.get(m_ramo.group(1).lower(), "")
        resto = resto[:m_ramo.start()]

    nome = re.sub(r"\s+", " ", resto).strip(" -–_.")
    if len(nome) >= 3:
        info["nome"] = nome.upper()
    return info


# =======================================================
# 2. IDENTIFICAÇÃO DA SEGURADORA E DO TIPO DE SEGURO (RAMO)
# =======================================================
def identificar_seguradora(texto_completo):
    """Retorna (seguradora, ramo_sugerido). O ramo só vem preenchido quando o próprio layout já o revela."""
    cabecalho_lower = texto_completo[:1000].lower()
    texto_lower = texto_completo.lower()

    # A Azul usa o CNPJ da Porto, então a Azul DEVE ser testada primeiro
    if "azul seguros" in cabecalho_lower or "azul tradicional" in cabecalho_lower:
        return "Azul", ""
    if "porto seguro" in cabecalho_lower or "auto sênior" in cabecalho_lower or "auto premium" in cabecalho_lower:
        return "Porto Seguro", ""
    if "suhai" in cabecalho_lower:
        return "Suhai", ""
    if "zurich" in cabecalho_lower:
        return "Zurich", ""
    if "allianz" in cabecalho_lower:
        return "Allianz", ""
    if "bradesco" in cabecalho_lower:
        return "Bradesco", ""
    if "susep: 1091" in cabecalho_lower or "suíça seguradora" in cabecalho_lower or "suica seguradora" in cabecalho_lower:
        return "Suíça", ""
    if "tokio marine" in cabecalho_lower:
        return "Tokio Marine", ""
    if "aliro" in cabecalho_lower:
        return "Aliro", ""
    if "yelum residencia" in texto_lower or ("yelum" in cabecalho_lower and "residencia" in texto_lower):
        return "Yelum", "Residencial"
    if "yelum" in cabecalho_lower:
        return "Yelum", ""
    if "hdi" in cabecalho_lower:
        return "HDI", ""
    return "Não Identificada", ""


RE_RAMO_AUTO = r"\bchassi\b|\bfipe\b|\bplaca\b|ano\s*(?:de\s*)?fabrica|ano\s*fab|ano\s*/\s*modelo|marca\s*/\s*(?:tipo|modelo)"
RE_RAMO_VIAGEM = r"seguro\s+viagem|assist[êe]ncia\s+(?:em\s+)?viagem|pa[ií]s\s+de\s+destino|data\s+de\s+embarque|\btravel\b"
RE_RAMO_RESIDENCIAL = r"ramo:\s*14\b|seguro\s+resid|resid[êe]ncia\s+habitual|\bresidencial\b|\bresid[êe]ncia\b"
RE_RAMO_EMPRESARIAL = r"ramo:\s*18\b|empresarial|empresa\s*pme|\bpme\b"


def identificar_ramo(texto_completo, info_arquivo, ramo_sugerido):
    """
    Ordem de confiança:
      1. Ramo escrito no nome do arquivo ("... - RESIDENCIAL")
      2. Ramo que o layout da seguradora já revelou (ex.: Yelum Residência)
      3. Palavras-chave do PDF (veículo vence, pois "telefone residencial" aparece em apólice de auto)
    """
    if info_arquivo.get("ramo"):
        return info_arquivo["ramo"]
    if ramo_sugerido:
        return ramo_sugerido
    if re.search(RE_RAMO_AUTO, texto_completo, re.IGNORECASE):
        return "Auto"
    if re.search(RE_RAMO_VIAGEM, texto_completo, re.IGNORECASE):
        return "Viagem"
    if re.search(RE_RAMO_RESIDENCIAL, texto_completo, re.IGNORECASE):
        return "Residencial"
    if re.search(RE_RAMO_EMPRESARIAL, texto_completo, re.IGNORECASE):
        return "Empresarial"
    return "Não Identificado"


# =======================================================
# 3. CPF / CNPJ (coletado, mas gravado só na aba oculta Base_Clientes)
# =======================================================
def cpf_valido(cpf):
    if len(cpf) != 11 or cpf == cpf[0] * 11:
        return False
    for i in (9, 10):
        soma = sum(int(cpf[j]) * ((i + 1) - j) for j in range(i))
        if (soma * 10) % 11 % 10 != int(cpf[i]):
            return False
    return True


def cnpj_valido(cnpj):
    if len(cnpj) != 14 or cnpj == cnpj[0] * 14:
        return False
    pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    pesos2 = [6] + pesos1
    for pesos, pos in ((pesos1, 12), (pesos2, 13)):
        resto = sum(int(cnpj[i]) * pesos[i] for i in range(pos)) % 11
        if (0 if resto < 2 else 11 - resto) != int(cnpj[pos]):
            return False
    return True


RE_DOCUMENTO = re.compile(
    r"(\d{3}\.\d{3}\.\d{3}-\d{2})"                 # CPF formatado
    r"|(\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2})"          # CNPJ formatado
    r"|CPF\s*[:\-]?\s*(\d{11})\b"                  # CPF sem pontuação, logo após o rótulo
    r"|CNPJ\s*[:\-]?\s*(\d{14})\b",                # CNPJ sem pontuação, logo após o rótulo
    re.IGNORECASE,
)


def extrair_documento_segurado(texto_completo):
    """
    Procura o CPF/CNPJ perto dos rótulos "Segurado" / "Proponente" (evita pegar o CNPJ da seguradora
    ou da corretora). Prefere CPF; só usa CNPJ se não houver CPF. Todo número passa pelo dígito verificador.
    """
    cpfs, cnpjs = [], []
    for m_rotulo in re.finditer(r"\b(?:segurad[oa](?!r)|proponente)", texto_completo, re.IGNORECASE):
        janela = texto_completo[m_rotulo.start(): m_rotulo.start() + 300]
        for m in RE_DOCUMENTO.finditer(janela):
            doc = so_digitos(next(g for g in m.groups() if g))
            if len(doc) == 11 and cpf_valido(doc):
                cpfs.append(doc)
            elif len(doc) == 14 and cnpj_valido(doc):
                cnpjs.append(doc)
        if cpfs:
            return cpfs[0]
    if cnpjs:
        return cnpjs[0]

    # Último recurso: primeiro CPF formatado e válido do documento
    for m in re.finditer(r"\b\d{3}\.\d{3}\.\d{3}-\d{2}\b", texto_completo):
        doc = so_digitos(m.group(0))
        if cpf_valido(doc):
            return doc
    return ""


def gerar_id_cliente(documento):
    """ID estável e irreversível sem a chave secreta: o mesmo CPF gera sempre o mesmo ID."""
    if not documento or not CPF_SALT:
        return ""
    resumo = hmac.new(CPF_SALT.encode(), documento.encode(), hashlib.sha256).hexdigest()[:10].upper()
    return f"CLI-{resumo}"


# =======================================================
# 4. EXTRATORES POR SEGURADORA
#    Assinatura padrão: extrair_xxx(texto_completo, ctx, dados) -> dados
#    ctx traz: nome_arquivo, tipo_documento, movimento, ramo, eh_endosso, eh_cancelamento
#    Para criar uma lógica nova (ex.: Endosso da HDI), use ctx["eh_endosso"] dentro da função
#    ou registre uma função nova em EXTRATORES.
# =======================================================

# ---------- PORTO SEGURO / AZUL (mesmo layout) ----------
def _extrair_layout_porto(texto_completo, ctx, dados):
    """Modelos Novos, Antigos, Premium, Sênior e Endosso da Porto e da Azul."""
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

    m_pag = re.search(r"Demais Parcelas:\s*([A-ZÀ-ÿ\s]+)", texto_completo, re.IGNORECASE)
    if m_pag: dados["forma_pagamento"] = m_pag.group(1).strip()
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

    m_pag_forma = re.search(r"Tipo de Cobrança\s*:\s*([A-Za-zÀ-ÿ\s]+)", texto_completo, re.IGNORECASE)
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
def extrair_zurich_auto(texto_completo, ctx, dados):
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

    m_tot = re.search(r"Pr[êe]mio\s+Total\s*:\s*R\$\s*([\d\.,]+)", texto_completo, re.IGNORECASE)
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

    m_pag = re.search(r"Forma de Pagamento da Entrada:\s*([A-ZÀ-ÿ\s]+)", texto_completo, re.IGNORECASE)
    if m_pag: dados["forma_pagamento"] = m_pag.group(1).strip()
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

    m_demo = re.search(r"DEMONSTRATIVO DE PRÊMIO[\s\S]*?Prêmio Líquido.*?Juros\(%\)([\s\S]*?)(?=FORMA DE PAGAMENTO)", texto_completo, re.IGNORECASE)
    if m_demo:
        valores_linha = re.findall(r"(\d{1,3}(?:\.\d{3})*,\d{2})", m_demo.group(1))
        if len(valores_linha) >= 2:
            dados["premio_liquido"] = valores_linha[0]
            dados["premio_total"] = valores_linha[-1]

    if not dados["premio_total"]:
        valores_gerais = re.findall(r"(\d{1,3}(?:\.\d{3})*,\d{2})", texto_completo)
        if len(valores_gerais) >= 5:
            dados["premio_liquido"] = valores_gerais[0]
            dados["premio_total"] = valores_gerais[3]

    m_parc_soma = re.search(r"(\d{1,2})\+(\d{1,2})\s*\([A-Z]+\)\s*-\s*([A-Za-zÀ-ÿ\s]+?)(?=\n|\s\d)", texto_completo, re.IGNORECASE)
    if m_parc_soma:
        dados["parcelas"] = str(int(m_parc_soma.group(1)) + int(m_parc_soma.group(2)))
        dados["forma_pagamento"] = m_parc_soma.group(3).strip()
    else:
        m_parc = re.search(r"(\d{1,2})\s*x\s*\([A-Z]+\)\s*-\s*([A-Za-zÀ-ÿ\s]+?)(?=\n|\s\d)", texto_completo, re.IGNORECASE)
        if m_parc:
            dados["parcelas"] = m_parc.group(1)
            dados["forma_pagamento"] = m_parc.group(2).strip()
    return dados


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

    # Modelo do carro (estratégia multicamada)
    m_mod = re.search(r"([A-Z0-9\s\.\-\/\(\)]+?\((?:Flex|Gasolina|Diesel|Alcool|Eletrico|Híbrido)\))", texto_completo, re.IGNORECASE)
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

    m_demo = re.search(r"Juros\(%\)([\s\S]*?)(?=FORMA DE PAGAMENTO)", texto_completo, re.IGNORECASE)
    if m_demo:
        valores_linha = re.findall(r"(\d{1,3}(?:\.\d{3})*,\d{2})", m_demo.group(1))
        if len(valores_linha) >= 4:
            dados["premio_liquido"] = valores_linha[0]
            dados["premio_total"] = valores_linha[-2]

    if not dados["premio_total"]:
        valores = re.findall(r"(\d{1,3}(?:\.\d{3})*,\d{2})", texto_completo)
        if len(valores) >= 5:
            dados["premio_liquido"] = valores[0]
            dados["premio_total"] = valores[3]

    m_parc_soma = re.search(r"(\d{1,2})\+(\d{1,2})\s*\([A-Z]+\)\s*-\s*([A-Za-zÀ-ÿ\s]+)", texto_completo, re.IGNORECASE)
    if m_parc_soma:
        dados["parcelas"] = str(int(m_parc_soma.group(1)) + int(m_parc_soma.group(2)))
        dados["forma_pagamento"] = m_parc_soma.group(3).strip()
    else:
        m_parc = re.search(r"(\d{1,2})\s*x\s*\([A-Z]+\)\s*-\s*([A-Za-zÀ-ÿ\s]+)", texto_completo, re.IGNORECASE)
        if m_parc:
            dados["parcelas"] = m_parc.group(1)
            dados["forma_pagamento"] = m_parc.group(2).strip()
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
    return dados


# ---------- TOKIO MARINE ----------
def extrair_tokio_auto(texto_completo, ctx, dados):
    if ctx["eh_endosso"]:
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
        dados["parcelas"] = str(parcelas_endosso) if parcelas_endosso > 0 else "1"
    else:
        m_apolice = re.search(r"Nº\s*Proposta/Negócio:\s*(\d+)", texto_completo, re.IGNORECASE)
        if m_apolice: dados["numero_apolice"] = m_apolice.group(1).strip()

        m_venc = re.search(r"Vigência[^\d]*(\d{2}/\d{2}/\d{4})", texto_completo, re.IGNORECASE)
        if m_venc: dados["vencimento"] = m_venc.group(1)

        m_seg = re.search(r"([A-Za-zÀ-ÿ\s]{3,50})\s+\d{3}\.\d{3}\.\d{3}-\d{2}", texto_completo)
        if m_seg: dados["segurado"] = re.sub(r"^(?:CNPJ|CPF)[\s\:\-\.]*", "", m_seg.group(1).strip(), flags=re.IGNORECASE).strip()

        m_tel = re.search(r"\(?(\d{2})\)?\s*(9\d{4}[-\s]?\d{4})", texto_completo)
        if m_tel: dados["telefone"] = so_digitos(m_tel.group(0))

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
    "Porto Seguro": {"Auto": extrair_porto_auto},
    "Azul":         {"Auto": extrair_azul_auto},
    "Bradesco":     {"Auto": extrair_bradesco_auto},
    "HDI":          {"Auto": extrair_hdi_auto},
    "Suíça":        {"Auto": extrair_suica_auto},
    "Zurich":       {"Auto": extrair_zurich_auto},
    "Yelum":        {"Auto": extrair_yelum_auto, "Residencial": extrair_yelum_residencial},
    "Aliro":        {"Auto": extrair_aliro_auto},
    "Suhai":        {"Auto": extrair_suhai_auto},
    "Tokio Marine": {"Auto": extrair_tokio_auto},
    "Allianz":      {"Auto": extrair_allianz_auto,
                     "Residencial": extrair_allianz_residencial,
                     "Empresarial": extrair_allianz_empresarial},
    # "Viagem" ainda não tem nenhum extrator: os PDFs caem no genérico até mapearmos um exemplo.
}


def escolher_extrator(seguradora, ramo):
    """Retorna (função, rótulo_para_log, é_específico)."""
    por_ramo = EXTRATORES.get(seguradora)
    if not por_ramo:
        return extrair_generico, "genérico", False
    if ramo in por_ramo:
        return por_ramo[ramo], f"{seguradora}/{ramo}", True
    if "Auto" in por_ramo:
        return por_ramo["Auto"], f"{seguradora}/Auto (sem extrator para {ramo})", False
    return extrair_generico, "genérico", False


# =======================================================
# 5. ORQUESTRAÇÃO DA EXTRAÇÃO
# =======================================================
def ler_texto_pdf(pdf_bytes):
    texto = ""
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for pagina in pdf.pages:
            texto_pagina = pagina.extract_text()
            if texto_pagina:
                texto += texto_pagina + "\n"
    return texto


def extrair_contatos_universais(texto_completo, dados):
    """Placa, telefone e e-mail por regex genérica (os extratores específicos podem sobrescrever)."""
    m_placa = re.search(r"\b([A-Z]{3}-?[0-9][A-Z0-9][0-9]{2}|[A-Z]{3}-?\d{4})\b", texto_completo)
    if m_placa: dados["placa"] = m_placa.group(1).replace("-", "").upper()

    m_tel = re.search(r"\b\(?\d{2}\)?\s*(?:9\d{4}|\d{4})-?\d{4}\b", texto_completo)
    if m_tel: dados["telefone"] = so_digitos(m_tel.group(0))

    for e in re.findall(r"[\w\.-]+@[\w\.-]+\.\w+", texto_completo):
        if "capse" not in e.lower():
            dados["email"] = e.lower()
            break


def verificar_conferencia(dados, ctx):
    """Monta o texto da coluna Conferência: 'OK' ou o que precisa ser revisado manualmente."""
    pendencias = []
    if not ctx["padrao_ok"]:
        pendencias.append("nome de arquivo fora do padrão")
    if not ctx["extrator_especifico"]:
        pendencias.append("lido pelo extrator genérico")
    if dados["tipo_seguro"] == "Não Identificado":
        pendencias.append("tipo de seguro")
    for campo, rotulo in (("numero_apolice", "nº apólice"), ("data_vigencia", "vigência"),
                          ("premio_total", "prêmio total"), ("premio_liquido", "prêmio líquido")):
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
    Combina seguradora + tipo de documento + nº apólice + placa + data de vigência + prêmio total.
    Sem nº de apólice, usa o nome do segurado no lugar.
    """
    numero = re.sub(r"[^0-9A-Z]", "", dados["numero_apolice"].upper())
    identificador = numero or remover_acentos(dados["segurado"]).upper().replace(" ", "")
    partes = [
        remover_acentos(dados["seguradora"]).upper(),
        remover_acentos(dados["tipo_documento"]).upper(),
        identificador,
        dados["placa"],
        dados["data_vigencia"],
        so_digitos(dados["premio_total"]),
    ]
    return "|".join(partes)


def extrair_dados_pdf(pdf_bytes, nome_arquivo):
    dados = {
        "vencimento": "", "mes_vencimento": "", "data_vigencia": "", "numero_apolice": "", "segurado": "",
        "observacoes": "", "seguradora": "Não Identificada", "premio_total": "",
        "premio_liquido": "", "comissao": "", "comissao_pct": "",
        "placa": "", "email": "", "telefone": "", "pagamento": "",
        "modelo_carro": "", "parcelas": "", "forma_pagamento": "",
        # Novos campos
        "tipo_seguro": "", "tipo_documento": "", "movimento": "",
        "cpf_cnpj": "", "id_cliente": "", "conferencia": "", "chave": "", "arquivo": nome_arquivo,
    }

    try:
        texto_completo = ler_texto_pdf(pdf_bytes)
    except Exception:
        print(f"⚠️ ARQUIVO IGNORADO (Protegido por Senha ou Corrompido): {nome_arquivo}")
        return None

    if not texto_completo.strip():
        print(f"⚠️ ARQUIVO IGNORADO (PDF sem texto — provavelmente escaneado/imagem): {nome_arquivo}")
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
    funcao, rotulo, especifico = escolher_extrator(dados["seguradora"], ctx["ramo"])
    ctx["extrator_especifico"] = especifico
    print(f"   ↳ Extrator: {rotulo} | Documento: {ctx['tipo_documento']}")
    try:
        dados = funcao(texto_completo, ctx, dados)
    except Exception as e:
        print(f"Erro ao aplicar Regex no arquivo {nome_arquivo}: {e}")
        ctx["extrator_especifico"] = False

    # 4. Nome do arquivo padronizado tem prioridade sobre o nome lido no PDF
    if info_arquivo["nome"]:
        dados["segurado"] = info_arquivo["nome"]

    # 5. Fallbacks universais
    if not dados["vencimento"]:
        m_univ_venc = re.search(r"(?:vigência|início)[\s\S]{1,50}?(\d{2}/\d{2}/\d{4})", texto_completo, re.IGNORECASE)
        if m_univ_venc: dados["vencimento"] = m_univ_venc.group(1)

    if ctx["eh_cancelamento"] and not dados["premio_total"]:
        # Preparado para cancelamentos: valor a restituir/devolver
        m_rest = re.search(r"(?:restitui|devolu)[\s\S]{0,60}?([\d\.]+,\d{2})", texto_completo, re.IGNORECASE)
        if m_rest: dados["premio_total"] = m_rest.group(1)

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
        dados["observacoes"] = dados["modelo_carro"] or "Modelo não identificado"
    else:
        dados["placa"] = ""   # evita "placas" falsas em seguros que não são de veículo
        dados["observacoes"] = f"Seguro {dados['tipo_seguro']}" if dados["tipo_seguro"] != "Não Identificado" \
            else "Tipo de seguro não identificado"

    # 8. Pagamento
    if dados["parcelas"] and dados["forma_pagamento"]:
        dados["pagamento"] = f"{dados['parcelas']} Parcelas - {dados['forma_pagamento']}"
    elif dados["parcelas"]:
        dados["pagamento"] = f"{dados['parcelas']} Parcelas"
    elif dados["forma_pagamento"]:
        dados["pagamento"] = dados["forma_pagamento"]

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
    ]


def abrir_ou_criar_aba(planilha_doc, titulo, cabecalho, oculta=False):
    try:
        return planilha_doc.worksheet(titulo)
    except gspread.exceptions.WorksheetNotFound:
        print(f"Criando aba '{titulo}'...")
        aba = planilha_doc.add_worksheet(title=titulo, rows=1000, cols=len(cabecalho))
        aba.update(range_name="A1", values=[cabecalho])
        if oculta:
            try:
                aba.hide()
            except Exception:
                print(f"⚠️ Não foi possível ocultar a aba '{titulo}'. Oculte e proteja manualmente.")
        return aba


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


# =======================================================
# 7. FLUXO DE NUVEM (DRIVE -> SHEETS -> MOVE)
# =======================================================
def listar_pdfs_entrada(drive_service):
    query = f"'{FOLDER_ENTRADA_ID}' in parents and mimeType='application/pdf' and trashed=false"
    arquivos, token = [], None
    while True:
        resp = drive_service.files().list(q=query, fields="nextPageToken, files(id, name)",
                                          pageSize=100, pageToken=token).execute()
        arquivos.extend(resp.get("files", []))
        token = resp.get("nextPageToken")
        if not token:
            return arquivos


def baixar_pdf(drive_service, file_id):
    request = drive_service.files().get_media(fileId=file_id)
    fh = io.BytesIO()
    downloader = MediaIoBaseDownload(fh, request)
    done = False
    while not done:
        _, done = downloader.next_chunk()
    return fh.getvalue()


def mover_para_processados(drive_service, file_id):
    drive_service.files().update(
        fileId=file_id,
        addParents=FOLDER_PROCESSADOS_ID,
        removeParents=FOLDER_ENTRADA_ID,
        fields="id, parents"
    ).execute()


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

    for arq in listar_pdfs_entrada(drive_service):
        file_id, file_name = arq["id"], arq["name"]
        print(f"Processando arquivo: {file_name}")

        try:
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
                mover_para_processados(drive_service, file_id)
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

            mover_para_processados(drive_service, file_id)
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


if __name__ == "__main__":
    processar_fluxo()
