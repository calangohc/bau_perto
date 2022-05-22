# Baú chegando!!

Este repositório contém experiências para análise dos dados sobre ônibus do Distrito Federal.

Aqui em Brasília/DF, os ônibus são popularmente conhecidos como "baús".

Veja também nossa experiência de controle social no YouTube: https://www.youtube.com/watch?v=nQy6B_6SKos

### Para subir um bot do Telegram:

   - Crie um arquivo secrets.txt e inclua uma variável BOT_TOKEN contendo um token criado pelo BotFather
   - Baixe as dependências python: pip install -r requirements.txt

### Arquivos

baus.py = Código principal. Busca dados usando requests
main_selenium.py = Estratégia inicial usando Selenium (abandonado)
requirements.txt = usado pelo pip para baixar dependências python
server.py = Pensando em subir um servidor com CORS ativado e buscar dados do json usando Javascript
tel_bot.py = Bot de Telegram

### Histórico

Pensei em fazer um acesso ao site do mapa usando Selenium, mas percebi que os dados crus estavam disponíveis em um JSON.

Com isso, pensei em subir um servidor simples e fazer tudo com Javascript no browser, por isso o arquivo server.py

Por fim, mudei de estratégia e usei a biblioteca requests para buscar os dados no JSON do GDF. Como isso me possibilitou ter os dados disponíveis em Python, criei o bot para Telegram.

