const fs = require("fs");
const tellschn = require("./tellschn_classes.js");
const util = require("util");
const kue = require("kue")
, queue = kue.createQueue();
class TelegramTellschnBot extends tellschn.Tellschn {
    constructor() {
        super();
        var TelegramBot = require('node-telegram-bot-api');
        this.telegram_instance = new TelegramBot(this.accessConf.telegram.token, {polling: true});
        this.tellschnMessageProcessor = new tellschnMessageProcessor(this.appconf.lang);
    }
    async startProcessingMessages() {
        this.telegram_instance.on('message', async (msg) => {
            let returnMessage = await this.tellschnMessageProcessor.processMessage("telegram", msg);
            this.sendMessage(msg.chat.id, returnMessage);
        });
    }
    async sendMessage(chat_id, text) {
        util.log("Delivering " + text + " to " + chat_id)
        await this.telegram_instance.sendMessage(chat_id, text);
        return;
    }
}

class tellschnMessageProcessor extends tellschn.Tellschn {
    constructor(lang) {
        super();
        this.bot_commands = JSON.parse(fs.readFileSync("bot_command_sets.json", "utf8"));
        this.templatingEngine = new tellschn.tellschnTemplate(lang);
    }
    async processMessage(channel, msg) {
        return new Promise(async (resolve, reject) => {
            switch (channel) {
                case "telegram":
                    switch (msg.text) {
                        case (this.bot_commands.general_prefix + this.bot_commands.general_commands.start_bot):
                            // registration sequence
                                resolve(this.templatingEngine.getTextModule("telegram_welcome_message", {
                                    "from_username": msg.from.username
                                }) + " " + this.templatingEngine.getTextModule("telegram_registration_instructions"));
                            break;
                        default:
                            if (msg.text.length == 6) {
                                util.log("Got 6-Digit Code");
                                // probably 6-digit-code for registration
                                try {
                                let rows = await this.sqlQuery("UPDATE user_notification_connections SET validation_token = NULL, address = ? WHERE validation_token = ? AND platform = 'telegram'", [
                                    msg.chat.id,
                                    msg.text
                                ]);
                                if (rows.affectedRows == 1) {
                                    resolve(this.templatingEngine.getTextModule("telegram_registration_success"));
                                    return;
                                } else if (rows.affectedRows > 1) {
                                    // eh we fucked up. 2 users got generated with the same code. reset both.
                                    await this.sqlConnection.query("DELETE FROM user_notification_connections WHERE address = ?", msg.text);
                                    resolve(this.templatingEngine.getTextModule("telegram_code_duplicate"));
                                    return;
                                } else if (rows.affectedRows == 0) {
                                    resolve(this.templatingEngine.getTextModule("telegram_code_incorrect"));
                                    return;
                                }
                            } catch (e) {
                                throw e;
                            }
                            } else {
                                resolve(this.templatingEngine.getTextModule("telegram_invalid_command"));
                                return;
                            }

                            break;
                    }

                    break;
                    default:
                        reject(new Error("UNKNOWN_CHANNEL"));
                    break;
            }
        })

    }
    templatingEngine = this.templatingEngine;
}

var bot = new TelegramTellschnBot();
bot.startProcessingMessages();
var messageProcessor = new tellschnMessageProcessor;
queue.process("send_telegram_notification_message", async (job, done) => {
    util.log("Got Job for sending a Message...", job.data);
    try {
        bot.sendMessage(job.data.chat_id, messageProcessor.templatingEngine.getTextModule("telegram_new_tell_notification", job.data));
        done()
    } catch (e) {
        throw e;
    }
});
module.exports = {tellschnMessageProcessor, TelegramTellschnBot};