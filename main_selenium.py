#! /usr/bin/env python3

from selenium import webdriver
from selenium.webdriver.firefox.service import Service
from webdriver_manager.firefox import GeckoDriverManager

# instala webdriver do Firefox e cria instância do browser
driver = webdriver.Firefox(service=Service(GeckoDriverManager().install()))

url = "https://dfnoponto.semob.df.gov.br/veiculos/onlineMap.html"
driver.get(url)

