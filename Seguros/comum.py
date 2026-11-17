"""
Partes compartilhadas pelos robôs da corretora:
  main.py        -> apólices/propostas/endossos
  orcamentos.py  -> orçamentos
  renovacoes.py  -> cruza apólices x orçamentos e monta a aba Renovações
"""
import os
import io
import re
import sys
import csv
import json
import hmac
import hashlib
import unicodedata
from datetime import datetime, date

import pdfplumber
import gspread
# As bibliotecas do Google Drive são importadas só dentro das funções que as usam,
# assim o modo de teste local (python main.py --local) roda sem credenciais.

# =======================================================
# CONFIGURAÇÕES COMUNS
# =======================================================
# No GitHub Actions os Secrets substituem estes valores padrão (a planilha padrão abaixo é a de TESTE)
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
    "Data Vigência",     # U  (data completa dd/mm/aaaa — a coluna A guarda só o dia; usada nas Renovações)
]

# Aba de clientes: ÚNICO lugar onde o CPF/CNPJ fica gravado. É criada oculta; proteja-a no Sheets.
# Aba de orçamentos (preenchida pelo orcamentos.py)
ABA_ORCAMENTOS = "Orçamentos"
CABECALHO_ORCAMENTOS = [
    "Data Orçamento", "Segurado", "Seguradora", "Tipo de Seguro", "Placa", "Observações",
    "Prêmio Total", "Prêmio Líquido", "Comissão %", "Franquia", "Pagamento",
    "ID Cliente", "Telefone", "E-mail", "Início Vigência", "Corretora", "Conferência", "Chave", "Arquivo",
    "Processado em",
]

# Aba de renovações (montada inteira pelo renovacoes.py a cada execução)
ABA_RENOVACOES = "Renovações"
# Colunas preenchidas à mão pela equipe: o robô NUNCA apaga o que foi digitado nelas
COLUNAS_MANUAIS_RENOVACAO = ["Responsável", "Motivo / Observação"]
CABECALHO_RENOVACOES = [
    "Data Renovação", "Status", "Segurado", "Tipo de Seguro", "Placa", "Veículo / Detalhe",
    "Seguradora Atual", "Prêmio Atual", "Início Vigência", "Qtd Orçamentos", "Melhor Orçamento",
    "Seguradora Melhor Orçamento", "Último Orçamento em", "Renovado com", "Telefone", "E-mail",
    "ID Cliente", "Documentos", "Pendência Documento",
    *COLUNAS_MANUAIS_RENOVACAO, "Chave Renovação", "Atualizado em",
]

ABA_CLIENTES = "Base_Clientes"
CABECALHO_CLIENTES = ["ID Cliente", "CPF/CNPJ", "Nome", "Primeiro registro", "Arquivo"]


# =======================================================
# CONEXÃO COM O GOOGLE
# =======================================================
def conectar_google():
    """Cria os clientes do Drive e do Sheets (só é chamada quando o robô roda de verdade)."""
    from google.oauth2 import service_account
    from googleapiclient.discovery import build

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


RE_VALOR = r"-?\s?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2}"


def valores_abaixo_do_cabecalho(texto, padrao_cabecalho, linhas_a_procurar=3):
    """
    Muitos PDFs trazem os títulos numa linha e os valores na de baixo:
        "Prêmio Líquido  Juros  IOF  Prêmio Total"
        "-1.371,70       0,00   0,00 -1.371,70"
    Devolve os valores (com sinal) da primeira linha com números logo abaixo do cabeçalho.
    """
    m = re.search(padrao_cabecalho + r"[^\n]*\n", texto, re.IGNORECASE)
    if not m:
        return []
    for linha in texto[m.end():].split("\n")[:linhas_a_procurar]:
        valores = [v.replace(" ", "") for v in re.findall(RE_VALOR, linha.replace("R$", " "))]
        if valores:
            return valores
    return []


def formatar_valor(valor):
    """Padroniza para o formato brasileiro com sinal: '1211,50' -> '1.211,50'; '-796,15' fica igual."""
    bruto = (valor or "").replace("R$", "").replace(" ", "")
    if not re.fullmatch(r"-?[\d\.]+,\d{2}", bruto):
        return valor
    numero = float(bruto.replace(".", "").replace(",", "."))
    texto = f"{abs(numero):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return ("-" if numero < 0 else "") + texto


def valor_para_numero(valor):
    """'1.805,91' -> 1805.91 ; '-796,15' -> -796.15 ; '24,80%' -> 24.8 ; vazio/inválido -> None
    Também aceita o que o Sheets/Excel devolve quando a célula virou número: 2218.42 (float) ou '2218.42'."""
    if isinstance(valor, (int, float)):
        return float(valor)
    bruto = str(valor or "").replace("R$", "").replace("%", "").replace(" ", "").replace(" ", "")
    if re.fullmatch(r"-?\d+\.\d{1,2}", bruto):        # ponto decimal: "2218.42" (não é milhar, que tem 3 dígitos)
        return float(bruto)
    if not re.fullmatch(r"-?[\d\.]*\d(?:,\d+)?", bruto):
        return None
    return float(bruto.replace(".", "").replace(",", "."))


def normalizar_valor(valor):
    """Qualquer representação de dinheiro -> '1.234,56' (ou '' se não for número)."""
    numero = valor_para_numero(valor)
    if numero is None:
        return ""
    return formatar_valor(f"{numero:.2f}".replace(".", ","))


def calcular_comissao(premio_liquido, comissao_pct):
    """Comissão = líquido × % , no formato brasileiro ('447,85'). Se faltar algum dos dois, '0,00'."""
    liquido, pct = valor_para_numero(premio_liquido), valor_para_numero(comissao_pct)
    if liquido is None or pct is None:
        return "0,00"
    return formatar_valor(f"{liquido * pct / 100:.2f}".replace(".", ","))


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
    # "Apólice endossada - NOME" e "Apólice - Endosso NOME" são endossos, não apólices novas
    ("Endosso",                       r"ap[oó]lice\s*(?:[-–]\s*)?endoss(?:ad[ao]|o)"),
    ("Apólice",                       r"ap[oó]lice"),
    ("Proposta",                      r"proposta"),
    ("Orçamento",                     r"or[cç]amento"),   # lido pelo orcamentos.py, não pelo main.py
]

MOVIMENTO_POR_DOCUMENTO = {
    "Proposta": "Emissão",
    "Apólice": "Emissão",
    "Proposta Endosso": "Endosso",
    "Endosso": "Endosso",
    "Proposta Endosso Cancelamento": "Cancelamento",
    "Endosso Cancelamento": "Cancelamento",
    "Orçamento": "Orçamento",
    "Não Identificado": "Não Identificado",
}

PALAVRAS_RAMO = {
    "auto": "Auto", "automovel": "Auto", "automóvel": "Auto",
    "viagem": "Viagem",
    "residencial": "Residencial", "residencia": "Residencial", "residência": "Residencial",
    "empresarial": "Empresarial", "pme": "Empresarial",
    "vida": "Vida",
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
    # Ao baixar do Drive o "%" costuma virar "_": "22_.pdf" significa 22%
    base = re.sub(r"(\d+(?:[.,]\d+)?)\s*_", r"\1%", base)
    base = re.sub(r"[_\s\[\]]+", " ", base).strip()

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
        if "ORCAMENTO" in nome_up:
            info["tipo_documento"] = "Orçamento"
        elif "CANCELAMENTO" in nome_up:
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

    # Prefixo opcional de ramo: "Proposta Seguro Viagem - NOME"
    m_ramo_ini = re.match(r"\s*(?:seguro\s+)?(auto|autom[oó]vel|viagem|residencial|resid[eê]ncia|empresarial)\b\s*[-–:]\s*",
                          resto, re.IGNORECASE)
    if m_ramo_ini:
        info["ramo"] = PALAVRAS_RAMO.get(m_ramo_ini.group(1).lower(), "")
        resto = resto[m_ramo_ini.end():]

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
    # Renovação de outra seguradora: o PDF cita a seguradora ANTERIOR no topo. Esses trechos são ignorados.
    cabecalho = texto_completo[:1500]
    cabecalho = re.sub(r"Seguradora\s+Sucursal\s+Ap[óo]lice\s+Item\s*\n[^\n]*", " ", cabecalho, flags=re.IGNORECASE)
    cabecalho = re.sub(r"(?:Cia|Seguradora|Congênere)\s+anterior:?[^\n]*", " ", cabecalho, flags=re.IGNORECASE)
    cabecalho_lower = cabecalho[:1000].lower()
    texto_lower = texto_completo.lower()

    # A Azul usa o CNPJ da Porto, então a Azul DEVE ser testada primeiro
    if "azul seguros" in cabecalho_lower or "azul tradicional" in cabecalho_lower:
        return "Azul", ""
    # Vence a seguradora cujo nome aparece PRIMEIRO no cabeçalho. Assim, "Cia anterior: PORTO SEGURO"
    # numa proposta da Zurich não engana mais o robô.
    assinaturas = {
        "Porto Seguro": r"porto seguro|auto s[êe]nior|auto premium",
        "Suhai": r"suhai",
        "Zurich": r"zurich",
        "Allianz": r"allianz",
        "Bradesco": r"bradesco",
        "Suíça": r"susep: 1091|su[íi]ça seguradora|suica seguradora",
        "Tokio Marine": r"tokio marine",
        "Aliro": r"aliro",
        "Yelum": r"yelum",
        "HDI": r"\bhdi\b",
    }
    posicoes = {}
    for seguradora, padrao in assinaturas.items():
        m = re.search(padrao, cabecalho_lower)
        if m:
            posicoes[seguradora] = m.start()
    if not posicoes and "portoseguro.com.br" in texto_lower:   # ex.: endosso de Auto Frota
        posicoes["Porto Seguro"] = 0
    if not posicoes:
        return "Não Identificada", ""

    seguradora = min(posicoes, key=posicoes.get)
    if seguradora == "Yelum" and ("yelum residencia" in texto_lower or "residencia" in texto_lower):
        return "Yelum", "Residencial"
    return seguradora, ""


# Sinais FORTES de veículo. "placa" sozinha não vale ("Assistência de Placa Solar" aparece em seguro empresarial).
RE_RAMO_AUTO = (r"\bchassi\b|\bfipe\b|\bplaca\b[\s:/A-Z]{0,20}[A-Z]{3}-?\d[A-Z0-9]\d{2}\b"
                r"|ano\s*fab|ano\s*/\s*modelo|marca\s*/\s*(?:tipo|modelo)")
RE_RAMO_VIAGEM = r"seguro\s+viagem|assist[êe]ncia\s+(?:em\s+)?viagem|pa[ií]s\s+de\s+destino|data\s+de\s+embarque|\btravel\b"
RE_RAMO_RESIDENCIAL = r"ramo:\s*14\b|seguro\s+resid|resid[êe]ncia\s+habitual|\bresidencial\b|\bresid[êe]ncia\b"
RE_RAMO_EMPRESARIAL = r"ramo:\s*18\b|empresarial|empresa\s*pme|\bpme\b|modalidade:\s*\d+\s*-\s*novo empresa"
RE_RAMO_VIDA = r"seguro\s+de\s+vida|vida\s+individual|acidentes\s+pessoais\s+individual"


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
    # O cabeçalho é mais confiável que o texto todo: um seguro empresarial cita "residência" nas condições gerais,
    # mas o título diz "EMPRESARIAL".
    cabecalho = texto_completo[:1500]
    for trecho, ordem in ((cabecalho, ("Viagem", "Vida", "Empresarial", "Residencial")),
                          (texto_completo, ("Viagem", "Residencial", "Empresarial", "Vida"))):
        for ramo in ordem:
            padrao = {"Viagem": RE_RAMO_VIAGEM, "Residencial": RE_RAMO_RESIDENCIAL,
                      "Empresarial": RE_RAMO_EMPRESARIAL, "Vida": RE_RAMO_VIDA}[ramo]
            if re.search(padrao, trecho, re.IGNORECASE):
                return ramo
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
    r"(\d{3}\.?\d{3}\.?\d{3}-\d{2})"               # CPF formatado ("123.456.789-01" ou "123456789-01")
    r"|(\d{2}\.?\d{3}\.?\d{3}/\d{4}-\d{2})"        # CNPJ formatado ("12.345.678/0001-90" ou "12345678/0001-90")
    r"|CPF\s*[:\-]?\s*(\d{11})\b"                  # CPF sem pontuação, logo após o rótulo
    r"|CNPJ\s*[:\-]?\s*(\d{14})\b"                 # CNPJ sem pontuação, logo após o rótulo
    r"|(?:F[íi]sica|Jur[íi]dica)\s+(\d{11}|\d{14})\b",   # Suhai: "ROGER ... Física 12345678901"
    re.IGNORECASE,
)

# Linhas que pertencem à SEGURADORA (rodapé/cabeçalho com o CNPJ dela) — documento nessas linhas não é do cliente
RE_LINHA_SEGURADORA = re.compile(r"segurador[ao]|seguros\s*s[./]?a|cia\.?\s*de\s*seguros|companhia\s*de\s*seguros"
                                 r"|^\s*CNPJ:\s*\d{14}\s+Data:", re.IGNORECASE)


def extrair_documento_segurado(texto_completo):
    """
    Procura o CPF/CNPJ perto dos rótulos "Segurado" / "Proponente" (evita pegar o CNPJ da seguradora
    ou da corretora). Prefere CPF; só usa CNPJ se não houver CPF. Todo número passa pelo dígito verificador.
    """
    cpfs, cnpjs = [], []
    rotulos = r"\b(?:segurad[oa](?!r)|proponente|nome\s*(?:completo)?\s*:|raz[ãa]o\s+social)"
    for m_rotulo in re.finditer(rotulos, texto_completo, re.IGNORECASE):
        janela = texto_completo[m_rotulo.start(): m_rotulo.start() + 300]
        for m in RE_DOCUMENTO.finditer(janela):
            inicio = janela.rfind("\n", 0, m.start()) + 1
            fim = janela.find("\n", m.end())
            if RE_LINHA_SEGURADORA.search(janela[inicio: fim if fim != -1 else None]):
                continue   # ex.: "Tokio Marine Seguradora S.A. - CNPJ 33.164.021/0001-00"
            doc = so_digitos(next(g for g in m.groups() if g))
            if len(doc) == 11 and cpf_valido(doc):
                cpfs.append(doc)
            elif len(doc) == 14 and cnpj_valido(doc) and doc not in CNPJS_CORRETORA:
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
# LEITURA DO PDF, TELEFONES E CONTATOS
# =======================================================
def _texto_parece_colado(texto):
    """Detecta PDFs em que as palavras vêm grudadas ("CARTÃODECRÉDITO"), comum em Yelum/Aliro."""
    palavras = texto.split()
    if not palavras:
        return False
    longas = sum(1 for p in palavras if len(p) > 22 and not re.fullmatch(r"[\d\.\-/,]+", p))
    return longas / len(palavras) > 0.03


def ler_texto_pdf(pdf_bytes):
    def extrair(**opcoes):
        texto = ""
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for pagina in pdf.pages:
                texto_pagina = pagina.extract_text(**opcoes)
                if texto_pagina:
                    texto += texto_pagina + "\n"
        return texto

    texto = extrair()
    # Só relê com tolerância menor quando o texto veio colado, para não mudar a leitura dos demais PDFs
    if _texto_parece_colado(texto):
        texto = extrair(x_tolerance=1.5)
    return texto


def pdf_sem_texto(texto):
    """PDF que é só imagem/print (ex.: 'Salvar como PDF' do navegador): não há o que ler sem OCR."""
    util = "\n".join(l for l in texto.splitlines() if "chrome-extension" not in l and "Documento.pdf" not in l)
    return len(re.sub(r"\s", "", util)) < 400


# Dados da própria corretora que aparecem nos PDFs e NÃO podem ser confundidos com os do cliente
TELEFONES_CORRETORA = {"51997588855", "5197588855", "51994447479", "5133529012",   # celulares e fixo da Capse
                       "51992572895"}                                               # celular da AEV
CNPJS_CORRETORA = {"44392817000128"}
DOMINIOS_CORRETORA = ("capse", "aevseguros")   # e-mails da corretora (Capse e AEV) nunca são do cliente
DDDS_VALIDOS = {11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38,
                41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69,
                71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99}
PALAVRAS_LINHA_NAO_CLIENTE = r"capse|\baev\b|corretor|susep|222132731|sac\b|0800|ouvidoria|sucursal|atendimento|assist[êe]ncia"


def normalizar_telefone(valor):
    """Devolve DDD + número (10 ou 11 dígitos) ou "" se não for um telefone brasileiro plausível."""
    d = so_digitos(valor).lstrip("0")
    if len(d) in (12, 13) and d.startswith("55"):
        d = d[2:]
    if len(d) == 10 and d[2] in "6789":       # celular antigo sem o 9 na frente
        d = d[:2] + "9" + d[2:]
    if len(d) not in (10, 11) or int(d[:2]) not in DDDS_VALIDOS or len(set(d)) <= 2:
        return ""
    if len(d) == 11 and d[2] != "9":
        return ""
    if d in TELEFONES_CORRETORA:
        return ""
    return d


def encontrar_telefone(texto_completo):
    """Procura primeiro nos rótulos (Celular/Telefone/Fone), ignorando linhas da corretora/seguradora."""
    def linha_de(pos_ini, pos_fim):
        inicio = texto_completo.rfind("\n", 0, pos_ini) + 1
        fim = texto_completo.find("\n", pos_fim)
        return texto_completo[inicio: fim if fim != -1 else None]

    def primeiro_valido(padrao):
        for m in re.finditer(padrao, texto_completo, re.IGNORECASE):
            if re.search(PALAVRAS_LINHA_NAO_CLIENTE, linha_de(m.start(), m.end()), re.IGNORECASE):
                continue
            tel = normalizar_telefone(m.group(1))
            if tel:
                return tel
        return ""

    # (?<!\d): o número não pode começar no meio de outro (ex.: final do código SUSEP "...31 99050177")
    numero = r"(?<!\d)(\(?\+?\d{2}\)?[\s\-]*\(?\d{2}\)?[\s\-]*9?\d{3,5}[\s\-]?\d{4}|\(?\d{2}\)?[\s\-]*9?\d{4}[\s\-]?\d{4})"
    # 1. Rótulo e número na mesma linha: "Celular: (51) 99999-9999"
    tel = primeiro_valido(r"\b(?:celular|telefone|fone|tel\.?)[^\d\n]{0,25}" + numero)
    if tel:
        return tel

    # 2. "Telefone" como título de coluna e o número na linha de baixo
    linhas = texto_completo.splitlines()
    for i, l in enumerate(linhas[:-1]):
        if re.search(r"\b(?:celular|telefone)\b", l, re.IGNORECASE) and not re.search(r"\d{8,}", l):
            seguinte = linhas[i + 1]
            if re.search(PALAVRAS_LINHA_NAO_CLIENTE, seguinte, re.IGNORECASE):
                continue
            validos = [t for t in (normalizar_telefone(c) for c in
                                   re.findall(r"(?<!\d)\(?\d{2}\)?[\s\-]?9?\d{4}-?\d{4}", seguinte)) if t]
            if validos:   # "RESIDENCIAL CELULAR COMERCIAL": prefere o celular (11 dígitos)
                return next((t for t in validos if len(t) == 11), validos[0])

    # 3. Sem rótulo: só aceita número formatado com parênteses ou hífen (evita RG, Renavam, protocolos)
    return primeiro_valido(r"(\(\d{2}\)\s*9?\d{4}-?\d{4}|\b\d{2}\s?9\d{4}-\d{4}\b)")


def extrair_contatos_universais(texto_completo, dados):
    """Placa, telefone e e-mail por regex genérica (os extratores específicos podem sobrescrever)."""
    m_placa = re.search(r"\b([A-Z]{3}-?[0-9][A-Z0-9][0-9]{2}|[A-Z]{3}-?\d{4})\b", texto_completo)
    if m_placa: dados["placa"] = m_placa.group(1).replace("-", "").upper()

    dados["telefone"] = encontrar_telefone(texto_completo)

    for e in re.findall(r"[\w\.-]+@[\w\.-]+\.\w+", texto_completo):
        if not any(c in e.lower() for c in DOMINIOS_CORRETORA):
            dados["email"] = e.lower()
            break

# =======================================================
# PLANILHA E DRIVE
# =======================================================
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


def baixar_pdf(drive_service, file_id):
    from googleapiclient.http import MediaIoBaseDownload
    request = drive_service.files().get_media(fileId=file_id)
    fh = io.BytesIO()
    downloader = MediaIoBaseDownload(fh, request)
    done = False
    while not done:
        _, done = downloader.next_chunk()
    return fh.getvalue()



def listar_pdfs(drive_service, pasta_id):
    """Lista todos os PDFs de uma pasta do Drive (com paginação)."""
    query = f"'{pasta_id}' in parents and mimeType='application/pdf' and trashed=false"
    arquivos, token = [], None
    while True:
        resp = drive_service.files().list(q=query, fields="nextPageToken, files(id, name)",
                                          pageSize=100, pageToken=token).execute()
        arquivos.extend(resp.get("files", []))
        token = resp.get("nextPageToken")
        if not token:
            return arquivos


def ainda_na_pasta(drive_service, file_id, pasta_id):
    """Proteção contra duas execuções ao mesmo tempo: se o arquivo já saiu da pasta, outra execução o processou."""
    pais = drive_service.files().get(fileId=file_id, fields="parents").execute().get("parents", [])
    return pasta_id in pais


def nome_pasta_cliente(nome):
    """Nome padronizado da pasta do cliente: maiúsculas, sem espaços duplos e sem caracteres proibidos."""
    nome = re.sub(r"[\/:*?\"<>|']", " ", (nome or "").upper())
    return re.sub(r"\s+", " ", nome).strip() or "SEM NOME"


def pasta_do_cliente(drive_service, pasta_pai_id, nome_cliente, cache):
    """
    "Ficha do cliente": devolve o ID da subpasta com o nome do cliente dentro de pasta_pai_id,
    criando-a se ainda não existir. cache = dict reaproveitado durante a execução.
    """
    nome = nome_pasta_cliente(nome_cliente)
    if (pasta_pai_id, nome) in cache:
        return cache[(pasta_pai_id, nome)]
    query = (f"'{pasta_pai_id}' in parents and name='{nome}' "
             "and mimeType='application/vnd.google-apps.folder' and trashed=false")
    existentes = drive_service.files().list(q=query, fields="files(id)", pageSize=1).execute().get("files", [])
    if existentes:
        pasta_id = existentes[0]["id"]
    else:
        pasta_id = drive_service.files().create(
            body={"name": nome, "mimeType": "application/vnd.google-apps.folder", "parents": [pasta_pai_id]},
            fields="id").execute()["id"]
        print(f"📁 Pasta do cliente criada: {nome}")
    cache[(pasta_pai_id, nome)] = pasta_id
    return pasta_id


def mover_arquivo(drive_service, file_id, de_pasta_id, para_pasta_id):
    drive_service.files().update(fileId=file_id, addParents=para_pasta_id, removeParents=de_pasta_id,
                                 fields="id, parents").execute()


def mover_para_ficha_do_cliente(drive_service, file_id, de_pasta_id, pasta_processados_id, nome_cliente, cache):
    """Move para Processados/<NOME DO CLIENTE>/. Se a pasta do cliente falhar, move para Processados mesmo."""
    destino = pasta_processados_id
    if nome_cliente:
        try:
            destino = pasta_do_cliente(drive_service, pasta_processados_id, nome_cliente, cache)
        except Exception as e:
            print(f"⚠️ Não foi possível usar a pasta do cliente '{nome_cliente}': {e}")
    mover_arquivo(drive_service, file_id, de_pasta_id, destino)


def chave_nome(nome):
    """Nome reduzido para comparar clientes entre abas: 'João  da Silva' == 'JOAO DA SILVA'."""
    return re.sub(r"[^A-Z ]", "", re.sub(r"\s+", " ", remover_acentos(nome or "").upper())).strip()


def ler_data(texto):
    """'18/11/2026' -> date; qualquer outra coisa -> None."""
    m = re.search(r"(\d{1,2})/(\d{1,2})/(\d{4})", str(texto or ""))
    if not m:
        return None
    try:
        return date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
    except ValueError:
        return None


def hoje():
    try:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo("America/Sao_Paulo")).date()
    except Exception:
        return date.today()
