"""
ROBÔ DE CONEXÃO — monta a aba "Renovações".

Lê as abas mensais (apólices/propostas/endossos) e a aba "Orçamentos" e, para cada seguro emitido,
calcula a data de renovação (início da vigência + 12 meses) e o status:

    Vigente            -> faltam mais de 30 dias e ainda não há orçamento
    A renovar          -> faltam 30 dias ou menos e NÃO há orçamento        (o dashboard grita)
    Orçamento enviado  -> já existe orçamento do mesmo cliente/ramo/placa
    Renovado           -> chegou proposta/apólice nova do mesmo cliente/ramo/placa
    Não renovado       -> venceu e não chegou proposta nova
    Cancelado          -> houve endosso de cancelamento durante a vigência

Os DIAS RESTANTES não são gravados aqui (ficariam velhos entre uma execução e outra):
calcule no Data Studio com DATE_DIFF(Data Renovação, TODAY()).

Uso:
    python renovacoes.py                        -> roda na planilha (GitHub Actions)
    python renovacoes.py --local <arquivo.xlsx> -> simula com uma exportação da planilha, sem acessar o Google
"""
import os
import sys
import csv
from datetime import timedelta

from comum import *  # noqa: F401,F403

DIAS_ALERTA = 30                 # a partir de quantos dias antes do vencimento vira "A renovar"
JANELA_ORCAMENTO_ANTES = 60      # orçamento feito até 60 dias antes do vencimento conta para a renovação
JANELA_ORCAMENTO_DEPOIS = 30     # ...e até 30 dias depois (cliente que renovou atrasado)
JANELA_RENOVACAO_ANTES = 60      # proposta nova até 60 dias antes do vencimento = renovação
JANELA_RENOVACAO_DEPOIS = 30     # ...e até 30 dias depois
AGRUPAR_MESMA_VIGENCIA = 60      # proposta + apólice + endossos a menos de 60 dias = mesmo seguro
RAMOS_SEM_RENOVACAO = {"Viagem"}

# Posição das colunas nas abas mensais (pela ordem do CABECALHO_MENSAL, não pelo título,
# porque os títulos A..M da planilha podem ter sido escritos à mão)
COL = {nome: i for i, nome in enumerate(CABECALHO_MENSAL)}


# =======================================================
# LEITURA DAS LINHAS
# =======================================================
def _celula(linha, nome):
    i = COL[nome]
    return str(linha[i]).strip() if i < len(linha) and linha[i] is not None else ""


def data_completa_da_linha(linha):
    """Coluna U (Data Vigência). Linhas antigas, sem a coluna U, têm a data dentro da Chave (coluna S)."""
    return ler_data(_celula(linha, "Data Vigência")) or ler_data(_celula(linha, "Chave"))


def registro_de_apolice(linha):
    """Transforma uma linha da aba mensal num dicionário. Devolve None se não der para usar."""
    segurado = _celula(linha, "Segurado")
    data = data_completa_da_linha(linha)
    if not segurado or not data:
        return None
    ramo = _celula(linha, "Tipo de Seguro") or ("Auto" if _celula(linha, "Placa") else "Não Identificado")
    return {
        "data": data,
        "segurado": segurado,
        "nome": chave_nome(segurado),
        "id": _celula(linha, "ID Cliente"),
        "ramo": ramo,
        "placa": _celula(linha, "Placa").replace("-", "").upper() if ramo == "Auto" else "",
        "detalhe": _celula(linha, "Observações"),
        "seguradora": _celula(linha, "Seguradora"),
        "premio": _celula(linha, "Prêmio Total"),
        "movimento": _celula(linha, "Movimento") or "Emissão",
        "telefone": _celula(linha, "Telefone"),
        "email": _celula(linha, "E-mail"),
    }


def registro_de_orcamento(item):
    """item = dict {título da coluna: valor} da aba Orçamentos."""
    segurado = str(item.get("Segurado") or "").strip()
    data = ler_data(item.get("Data Orçamento")) or ler_data(item.get("Processado em"))
    if not segurado or not data:
        return None
    ramo = str(item.get("Tipo de Seguro") or "").strip()
    return {
        "data": data,
        "nome": chave_nome(segurado),
        "id": str(item.get("ID Cliente") or "").strip(),
        "ramo": ramo,
        "placa": str(item.get("Placa") or "").replace("-", "").upper().strip() if ramo == "Auto" else "",
        "seguradora": str(item.get("Seguradora") or "").strip(),
        "premio": str(item.get("Prêmio Total") or "").strip(),
    }


def mesmo_cliente(a, b):
    """Mesmo ID Cliente (CPF) OU o mesmo nome. O nome vale mesmo com IDs diferentes, porque às vezes o PDF
    traz o CPF de outra pessoa (condutor, pagador) e o nome do arquivo é padronizado pela equipe."""
    return bool(a["id"] and a["id"] == b["id"]) or a["nome"] == b["nome"]


def mesmo_bem(a, b, exigir_placa=True):
    """Mesmo cliente + mesmo ramo; no Auto, também a mesma placa (cliente com mais de um carro)."""
    if not mesmo_cliente(a, b) or a["ramo"] != b["ramo"]:
        return False
    if a["ramo"] == "Auto" and exigir_placa and a["placa"] and b["placa"]:
        return a["placa"] == b["placa"]
    return True


def somar_um_ano(d):
    try:
        return d.replace(year=d.year + 1)
    except ValueError:      # 29/02
        return d.replace(year=d.year + 1, day=28)


# =======================================================
# CÁLCULO
# =======================================================
def agrupar_vigencias(apolices):
    """
    Junta Proposta + Apólice + endossos do mesmo seguro numa única vigência.
    Devolve a lista de vigências: cada uma com o registro principal (a emissão mais antiga) e os cancelamentos.
    """
    emissoes = sorted((a for a in apolices if a["movimento"] == "Emissão"), key=lambda a: a["data"])
    vigencias = []
    for e in emissoes:
        for v in vigencias:
            if mesmo_bem(v["principal"], e) and abs((e["data"] - v["principal"]["data"]).days) <= AGRUPAR_MESMA_VIGENCIA:
                # a Apólice costuma ter prêmio/seguradora mais confiáveis que a Proposta: guarda os dados mais recentes
                for campo in ("seguradora", "premio", "telefone", "email", "id", "detalhe"):
                    v["principal"][campo] = e[campo] or v["principal"][campo]
                break
        else:
            vigencias.append({"principal": dict(e)})

    for v in vigencias:
        p = v["principal"]
        p["renovacao"] = somar_um_ano(p["data"])
        v["cancelado"] = any(a["movimento"] == "Cancelamento" and mesmo_bem(p, a)
                             and p["data"] <= a["data"] < p["renovacao"] for a in apolices)
    return vigencias


def proxima_vigencia(v, vigencias):
    """A vigência seguinte do mesmo bem (= renovação). Se trocou de carro, aceita outra placa no mesmo período."""
    p = v["principal"]
    inicio = p["renovacao"] - timedelta(days=JANELA_RENOVACAO_ANTES)
    fim = p["renovacao"] + timedelta(days=JANELA_RENOVACAO_DEPOIS)
    candidatas = [o["principal"] for o in vigencias if o is not v and inicio <= o["principal"]["data"] <= fim]
    for exigir_placa in (True, False):
        for c in sorted(candidatas, key=lambda c: c["data"]):
            if mesmo_bem(p, c, exigir_placa=exigir_placa):
                return c
    return None


def orcamentos_da_vigencia(v, orcamentos):
    p = v["principal"]
    inicio = p["renovacao"] - timedelta(days=JANELA_ORCAMENTO_ANTES)
    fim = p["renovacao"] + timedelta(days=JANELA_ORCAMENTO_DEPOIS)
    return [o for o in orcamentos if inicio <= o["data"] <= fim and mesmo_bem(p, o)]


def chave_renovacao(p):
    return "|".join([p["id"] or p["nome"], p["ramo"], p["placa"], p["data"].strftime("%d/%m/%Y")])


def calcular_renovacoes(apolices, orcamentos, manuais, data_hoje):
    """
    apolices / orcamentos: listas de registros (registro_de_apolice / registro_de_orcamento)
    manuais: {chave renovação: {coluna manual: valor}} — o que a equipe já digitou
    Devolve as linhas da aba Renovações (sem o cabeçalho), da renovação mais próxima para a mais distante.
    """
    apolices = [a for a in apolices if a["ramo"] not in RAMOS_SEM_RENOVACAO]
    vigencias = agrupar_vigencias(apolices)
    linhas = []
    for v in vigencias:
        p = v["principal"]
        dias = (p["renovacao"] - data_hoje).days
        orcs = orcamentos_da_vigencia(v, orcamentos)
        nova = proxima_vigencia(v, vigencias)

        if nova:
            status = "Renovado"
        elif v["cancelado"]:
            status = "Cancelado"
        elif dias < 0:
            status = "Não renovado"
        elif orcs:
            status = "Orçamento enviado"
        elif dias <= DIAS_ALERTA:
            status = "A renovar"
        else:
            status = "Vigente"

        com_valor = [o for o in orcs if valor_para_numero(o["premio"]) is not None]
        melhor = min(com_valor, key=lambda o: valor_para_numero(o["premio"])) if com_valor else None
        chave = chave_renovacao(p)
        manual = manuais.get(chave, {})
        linhas.append([
            p["renovacao"].strftime("%d/%m/%Y"),
            status,
            p["segurado"],
            p["ramo"],
            p["placa"],
            p["detalhe"],
            p["seguradora"],
            p["premio"],
            p["data"].strftime("%d/%m/%Y"),
            len(orcs),
            melhor["premio"] if melhor else "",
            melhor["seguradora"] if melhor else "",
            max(o["data"] for o in orcs).strftime("%d/%m/%Y") if orcs else "",
            nova["seguradora"] if nova else "",
            p["telefone"],
            p["email"],
            p["id"],
            *[manual.get(c, "") for c in COLUNAS_MANUAIS_RENOVACAO],
            chave,
            agora_texto(),
        ])
    linhas.sort(key=lambda l: ler_data(l[0]))
    return linhas


# =======================================================
# PLANILHA
# =======================================================
def ler_manuais(linhas_atuais):
    """Guarda o que a equipe digitou nas colunas manuais, indexado pela Chave Renovação."""
    if not linhas_atuais:
        return {}
    cab = linhas_atuais[0]
    if "Chave Renovação" not in cab:
        return {}
    i_chave = cab.index("Chave Renovação")
    idx = {c: cab.index(c) for c in COLUNAS_MANUAIS_RENOVACAO if c in cab}
    manuais = {}
    for l in linhas_atuais[1:]:
        if i_chave < len(l) and l[i_chave]:
            valores = {c: l[i] for c, i in idx.items() if i < len(l) and str(l[i]).strip()}
            if valores:
                manuais[l[i_chave]] = valores
    return manuais


def processar_renovacoes():
    _, gc = conectar_google()
    planilha_doc = gc.open_by_key(SPREADSHEET_ID)
    titulos = {ws.title for ws in planilha_doc.worksheets()}

    abas_mes = [m for m in MAPA_MESES.values() if m in titulos]
    respostas = planilha_doc.values_batch_get([f"'{m}'!A2:U" for m in abas_mes]).get("valueRanges", [])
    apolices, sem_data = [], 0
    for r in respostas:
        for linha in r.get("values", []):
            reg = registro_de_apolice(linha)
            if reg:
                apolices.append(reg)
            elif _celula(linha, "Segurado"):
                sem_data += 1

    orcamentos = []
    if ABA_ORCAMENTOS in titulos:
        orcamentos = [o for o in map(registro_de_orcamento, planilha_doc.worksheet(ABA_ORCAMENTOS).get_all_records()) if o]

    aba = abrir_ou_criar_aba(planilha_doc, ABA_RENOVACOES, CABECALHO_RENOVACOES)
    manuais = ler_manuais(aba.get_all_values())
    linhas = calcular_renovacoes(apolices, orcamentos, manuais, hoje())

    if aba.col_count < len(CABECALHO_RENOVACOES):
        aba.add_cols(len(CABECALHO_RENOVACOES) - aba.col_count)
    if aba.row_count < len(linhas) + 1:
        aba.add_rows(len(linhas) + 1 - aba.row_count)
    aba.clear()
    # USER_ENTERED: o Sheets converte as datas e os valores em data/número de verdade (bom para o Data Studio)
    aba.update(range_name="A1", values=[CABECALHO_RENOVACOES] + linhas, value_input_option="USER_ENTERED")
    try:
        aba.set_basic_filter(f"A1:{gspread.utils.rowcol_to_a1(len(linhas) + 1, len(CABECALHO_RENOVACOES))}")
        aba.freeze(rows=1)
    except Exception:
        pass

    contagem = {}
    for l in linhas:
        contagem[l[1]] = contagem.get(l[1], 0) + 1
    print(f"Renovações: {len(linhas)} seguros | {contagem} | {len(orcamentos)} orçamentos lidos")
    if sem_data:
        print(f"⚠️ {sem_data} linha(s) sem data completa (sem colunas U/S) ficaram de fora das renovações.")


# =======================================================
# TESTE LOCAL com uma exportação .xlsx da planilha
# =======================================================
def testar_local(caminho_xlsx):
    import openpyxl
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    wb = openpyxl.load_workbook(caminho_xlsx, read_only=True, data_only=True)
    apolices, sem_data = [], 0
    for mes in MAPA_MESES.values():
        if mes not in wb.sheetnames:
            continue
        for linha in list(wb[mes].iter_rows(values_only=True))[1:]:
            linha = [("" if c is None else c.strftime("%d/%m/%Y") if hasattr(c, "strftime") else str(c)) for c in linha]
            reg = registro_de_apolice(linha)
            if reg:
                apolices.append(reg)
            elif _celula(linha, "Segurado"):
                sem_data += 1
    orcamentos = []
    if ABA_ORCAMENTOS in wb.sheetnames:
        dados = list(wb[ABA_ORCAMENTOS].iter_rows(values_only=True))
        orcamentos = [o for o in (registro_de_orcamento(dict(zip(dados[0], l))) for l in dados[1:]) if o]

    data_hoje = ler_data(os.environ.get("HOJE", "")) or hoje()
    linhas = calcular_renovacoes(apolices, orcamentos, {}, data_hoje)
    saida = os.path.join(os.path.dirname(os.path.abspath(__file__)), "amostras", "renovacoes_teste.csv")
    os.makedirs(os.path.dirname(saida), exist_ok=True)
    with open(saida, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(CABECALHO_RENOVACOES)
        w.writerows(linhas)

    contagem = {}
    for l in linhas:
        contagem[l[1]] = contagem.get(l[1], 0) + 1
    print(f"Hoje = {data_hoje:%d/%m/%Y} | {len(apolices)} linhas lidas | {sem_data} sem data completa")
    print(f"{len(linhas)} seguros: {contagem}")
    print("\nPróximos 10 a renovar:")
    for l in [l for l in linhas if l[1] in ("A renovar", "Orçamento enviado", "Vigente")][:10]:
        print(f"  {l[0]}  {l[1]:18} {l[2][:30]:30} {l[3]:12} {l[4]:8} {l[6]}")
    print(f"\nTabela completa: {saida}")


if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "--local":
        testar_local(sys.argv[2])
    else:
        processar_renovacoes()
