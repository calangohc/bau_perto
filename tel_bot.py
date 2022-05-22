import secrets
import baus
from telegram import Update
from telegram.ext import CallbackContext, CommandHandler, Updater

def start(update: Update, context: CallbackContext):
    context.bot.send_message(chat_id=update.effective_chat.id, text="Oi! Eu estou no Calango vigiando os baús!")

def perto(update: Update, context: CallbackContext):
    context.bot.send_message(chat_id=update.effective_chat.id, text="Deixa eu ver se tem algum baú por perto...")
    veiculos = baus.get_veiculos()
    if len(veiculos) > 0:
        context.bot.send_message(chat_id=update.effective_chat.id, text="Achei %d baús!!" % len(veiculos))
        for veiculo in veiculos:
            context.bot.send_message(chat_id=update.effective_chat.id, text=veiculo)
    else:
        context.bot.send_message(chat_id=update.effective_chat.id, text="Agora não tem nenhum... ;(")

if __name__ == '__main__':
    # conecta ao Telegram usando o Token definido no arquivos secrets.py
    updater = Updater(token=secrets.BOT_TOKEN, use_context=True)
    dispatcher = updater.dispatcher
    dispatcher.add_handler(CommandHandler('start', start))
    dispatcher.add_handler(CommandHandler('perto', perto))

    # aguarda comandos
    updater.start_polling()
