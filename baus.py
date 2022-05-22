#! /usr/bin/env python3
import requests
from pprint import pprint

MIN_LATITUDE = -15.82755
MIN_LONGITUDE = -47.92618
MAX_LATITUDE = -15.82089
MAX_LONGITUDE = -47.91872

# verifica se o veículo está na área retangular definida no início do programa
def na_area(veiculo):

    if veiculo['localizacao']['latitude'] > MAX_LATITUDE or \
       veiculo['localizacao']['longitude'] > MAX_LONGITUDE:
                return False

    if veiculo['localizacao']['latitude'] < MIN_LATITUDE or \
       veiculo['localizacao']['longitude'] < MIN_LONGITUDE:
                return False

    return True

def get_veiculos():
    # cria a requisição http
    req = requests.get('https://www.sistemas.dftrans.df.gov.br/service/gps/operacoes')

    # cria uma lista de veículos a ser populada
    veiculos = list()

    # pprint (req.json())

    # percorre o json, organizado como um dict para cada operadora:
    for operadora in req.json():
        print(operadora['operadora'])
        sigla_operadora = operadora['operadora']['sigla']
        # print(operadora['veiculos'][0].keys())

        # percorre a lista de veículos de cada operadora
        # se estiver na área definida,
        # inclui a sigla da operadora e coloca o veículo na lista geral
        for veiculo in operadora['veiculos']:
            if na_area(veiculo):
                veiculo['operadora'] = sigla_operadora
                veiculos.append(veiculo)

    return veiculos
