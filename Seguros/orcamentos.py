"""
ROBÔ DE ORÇAMENTOS — lê os PDFs da pasta "Orçamentos" do Drive e grava na aba "Orçamentos".

Padrão do nome do arquivo: "Orçamento NOME DO CLIENTE %.pdf"   (1 orçamento por PDF)

Nesta primeira versão a leitura do PDF reaproveita os extratores das apólices (main.py):
seguradora, ramo, prêmios, placa, veículo, telefone, e-mail e CPF. Quando chegarem os PDFs de exemplo,
os layouts específicos de orçamento entram aqui.

Uso:
    python orcamentos.py                   -> roda no Drive/planilha (GitHub Actions)
    python orcamentos.py --local [pasta]   -> testa com os PDFs de Seguros/amostras/orcamentos
"""
import os
import re
import sys
import csv

import main as leitor_apolices
from comum import *  # noqa: F401,F403

FOLDER_ORCAMENTOS_ID = os.environ.get("FOLDER_ORCAMENTOS_ID", "1j5hIXdFL8ivh-vVQwdyuBwrh2K9K5GsB")
FOLDER_ORCAMENTOS_PROCESSADOS_ID = os.environ.get("FOLDER_ORCAMENTOS_PROCESSADOS_ID", "10CYwXNkQox-kwohHj3QrFp-ncVpI39Wt")

RE_DATA_ORCAMENTO = (r"(?:data\s*(?:do|da|de)?\s*(?:c[áa]lculo|cota[çc][ãa]o|or[çc]amento|emiss[ãa]o)"
                     r"|(?:c[áa]lculo|cota[çc][ãa]o|or[çc]amento)\s*(?:gerad[oa]|realizad[oa]|emitid[oa])\s*em)"
                     r"\s*:?\s*(\d{2}/\d{2}/\d{4})")
RE_FRANQUIA = r"franquia[^\n\d]{0,40}?R?\$?\s*(\d{1,3}(?:\.\d{3})*,\d{2})"


def extrair_orcamento(pdf_bytes, nome_arquivo, texto_pronto=None):
    """Devolve o dicionário do orçamento, ou None se o PDF não puder ser lido."""
    if texto_pronto is None:
        try:
            texto_pronto = ler_texto_pdf(pdf_bytes)
        except Exception:
            print(f"⚠️ ARQUIVO IGNORADO (Protegido por Senha ou Corrompido): {nome_arquivo}")
            return None
    dados = leitor_apolices.extrair_dados_pdf(None, nome_arquivo, texto_pronto=texto_pronto)
    if dados is None:
        return None

    info = interpretar_nome_arquivo(nome_arquivo)
    m_data = re.search(RE_DATA_ORCAMENTO, texto_pronto, re.IGNORECASE)
    dados["data_orcamento"] = m_data.group(1) if m_data else hoje().strftime("%d/%m/%Y")
    m_franquia = re.search(RE_FRANQUIA, texto_pronto, re.IGNORECASE)
    dados["franquia"] = formatar_valor(m_franquia.group(1)) if m_franquia else ""

    pendencias = []
    if info["tipo_documento"] != "Orçamento":
        pendencias.append('nome não começa com "Orçamento"')
    if dados["seguradora"] == "Não Identificada":
        pendencias.append("seguradora")
    if dados["tipo_seguro"] == "Não Identificado":
        pendencias.append("tipo de seguro")
    if not dados["premio_total"]:
        pendencias.append("prêmio total")
    if dados["tipo_seguro"] == "Auto" and not dados["placa"] and not dados["modelo_carro"]:
        pendencias.append("veículo")
    if not m_data:
        pendencias.append("data do orçamento (usada a data de leitura)")
    dados["conferencia"] = "OK" if not pendencias else "Revisar: " + ", ".join(pendencias)

    dados["chave"] = "|".join([
        "ORC", remover_acentos(dados["seguradora"]).upper(), chave_nome(dados["segurado"]).replace(" ", ""),
        dados["tipo_seguro"], dados["placa"], so_digitos(dados["premio_total"]),
    ])
    return dados


def montar_linha_orcamento(d):
    """Mesma ordem de CABECALHO_ORCAMENTOS."""
    return [
        d["data_orcamento"], d["segurado"], d["seguradora"], d["tipo_seguro"], d["placa"], d["observacoes"],
        d["premio_total"], d["premio_liquido"], d["comissao_pct"], d["franquia"], d["pagamento"],
        d["id_cliente"], d["telefone"], d["email"], d["conferencia"], d["chave"], d["arquivo"], agora_texto(),
    ]


def processar_orcamentos():
    drive_service, gc = conectar_google()
    planilha_doc = gc.open_by_key(SPREADSHEET_ID)
    aba = abrir_ou_criar_aba(planilha_doc, ABA_ORCAMENTOS, CABECALHO_ORCAMENTOS)
    i_chave = CABECALHO_ORCAMENTOS.index("Chave") + 1
    chaves = set(aba.col_values(i_chave)[1:])
    aba_clientes = abrir_ou_criar_aba(planilha_doc, ABA_CLIENTES, CABECALHO_CLIENTES, oculta=True)
    documentos_cadastrados = set(aba_clientes.col_values(2)[1:])

    pastas_clientes = {}
    resumo = {"lançados": 0, "duplicados": 0, "ignorados": 0, "erros": 0}
    for arq in listar_pdfs(drive_service, FOLDER_ORCAMENTOS_ID):
        file_id, file_name = arq["id"], arq["name"]
        print(f"Processando orçamento: {file_name}")
        try:
            if not ainda_na_pasta(drive_service, file_id, FOLDER_ORCAMENTOS_ID):
                resumo["duplicados"] += 1
                continue
            dados = extrair_orcamento(baixar_pdf(drive_service, file_id), file_name)
            if dados is None or not dados["segurado"]:
                resumo["ignorados"] += 1
                continue

            if dados["chave"] in chaves:
                print(f"⏭️ Orçamento duplicado (já lançado antes): {file_name}")
                resumo["duplicados"] += 1
            else:
                aba.append_row(montar_linha_orcamento(dados))
                chaves.add(dados["chave"])
                if dados["cpf_cnpj"] and dados["cpf_cnpj"] not in documentos_cadastrados:
                    aba_clientes.append_row([dados["id_cliente"], dados["cpf_cnpj"], dados["segurado"],
                                             agora_texto(), file_name])
                    documentos_cadastrados.add(dados["cpf_cnpj"])
                resumo["lançados"] += 1
                print(f"✅ {dados['seguradora']} | {dados['tipo_seguro']} | {dados['premio_total']} | {dados['conferencia']}")

            mover_para_ficha_do_cliente(drive_service, file_id, FOLDER_ORCAMENTOS_ID,
                                        FOLDER_ORCAMENTOS_PROCESSADOS_ID, dados["segurado"], pastas_clientes)
        except Exception as e:
            print(f"❌ Erro ao processar {file_name}: {e}")
            resumo["erros"] += 1
    print(f"Resumo orçamentos: {resumo}")


def testar_local(pasta):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    leitor_apolices.VERBOSO = False
    if not os.path.isdir(pasta):
        print(f"Pasta não encontrada: {pasta}\nCrie a pasta e coloque os PDFs de orçamento dentro dela.")
        return
    pdfs = sorted(f for f in os.listdir(pasta) if f.lower().endswith(".pdf"))
    pasta_textos = os.path.join(pasta, "_textos")
    os.makedirs(pasta_textos, exist_ok=True)
    linhas = []
    for nome in pdfs:
        try:
            with open(os.path.join(pasta, nome), "rb") as f:
                texto = ler_texto_pdf(f.read())
        except Exception as e:
            print(f"❌ {nome}: não abriu ({e!r})")
            continue
        with open(os.path.join(pasta_textos, nome[:-4] + ".txt"), "w", encoding="utf-8") as f:
            f.write(texto)
        d = extrair_orcamento(None, nome, texto_pronto=texto)
        if d is None:
            print(f"❌ {nome}: PDF sem texto")
            continue
        linhas.append(montar_linha_orcamento(d))
        print(f"{'✅' if d['conferencia'] == 'OK' else '⚠️'} {d['seguradora']:13} {d['tipo_seguro']:12} "
              f"{d['premio_total']:>10} {d['segurado'][:28]:28} {d['conferencia']}")
    saida = os.path.join(pasta, "resultado_orcamentos.csv")
    with open(saida, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(CABECALHO_ORCAMENTOS)
        w.writerows(linhas)
    print(f"\n{len(linhas)} orçamento(s) lidos. Tabela: {saida}")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--local":
        padrao = os.path.join(os.path.dirname(os.path.abspath(__file__)), "amostras", "orcamentos")
        testar_local(sys.argv[2] if len(sys.argv) > 2 else padrao)
    else:
        processar_orcamentos()
