const fs = require("fs");
const nodemailer = require("nodemailer");
const util = require("util");
class Tellschn {
    constructor() {
        const mysql = require("mysql");
        this.appconf = JSON.parse(fs.readFileSync("app-config.json", "utf8"));
        this.accessConf = JSON.parse(fs.readFileSync("access-config.json", "utf8"))
        this.sqlConnection = mysql.createConnection(this.accessConf.mysql);
    }
    sqlQuery(query, data) {
        return new Promise((resolve, reject) => {
            let sqlQueryObejct = this.sqlConnection.query(query, data, function(error, result) {
                
                if (error) {
                    reject(error);
                    return
                } else {
                    resolve(result);
                }
            })
            if (this.appconf.debug) {
                util.log(sqlQueryObejct.sql);
            }
        })
    }
    uuid() {
        return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }
    validateEmail(email) {
        var re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
        return re.test(String(email).toLowerCase());
    }
    dbg(logging) {
        if (this.appconf.debug) {
            util.log(logging);
        }
    }
    
}
class tellschnTemplate extends Tellschn {
    constructor (lang = "de") {
        super();
        this.mustache = require("mustache");
        this.translation = JSON.parse(fs.readFileSync("translations/translation_"+lang+".json", "utf8"));
        this.static_prop = {
            translation: this.translation,
            appconf: this.appconf,
            accessconf: this.accessConf
        }
    }
    

    
    getTextModule(moduleName, additionalMoustacheContent = {}) {
        
        var combined_prop = {...this.static_prop, ...additionalMoustacheContent};
        
        return this.mustache.render(this.translation[moduleName], combined_prop);
    }

    renderFullTranslation(additionalMoustacheContent = {}) {
        let buffer = {};
        for (var i in this.translation) {

            //check wether the string actually contains a variable, if not just copy it
            if (this.translation[i].indexOf("{{") != -1) {
                buffer[i] = this.getTextModule([i], additionalMoustacheContent);
            } else {
                buffer[i] = this.translation[i];
            }
        }
        return buffer;
    }
    exportText_modules(data = {}) {
        return {...this.static_prop, ...{"translation": this.renderFullTranslation(data)}};
    }
    
}

class tellschnMailer extends tellschnTemplate {
    constructor(lang) {
        super(lang);
        
        this.mailer = nodemailer.createTransport(this.accessConf.mail);
    }
    async sendMail(to, subject, text) {
        let info = await this.mailer.sendMail({
            "from": this.accessConf.mail.sender,
            "to": to,
            "subject": subject,
            "text": text
        });
        return info;
    }
    async sendValidationMail(address, userpayload) {
        let validation_token = this.uuid();
        await this.sqlQuery("INSERT INTO user_notification_services (twitter_id, address, validation_token, recipient_name, platform) VALUES (?)", [[
            userpayload.twitter_id,
            address,
            validation_token,
            address,
            "email"
        ]])
        this.sendMail(address,
            this.getTextModule("mail_subject_register", {"userpayload": userpayload}),
            this.getTextModule("mail_text_register", {"userpayload": userpayload, "email_token": validation_token}),    
        );
    }
    async sendRegistrationNotificationSuccessMail(address, userpayload) {
        
        this.sendMail(address,
            this.getTextModule("mail_subject_registration_success", {"userpayload": userpayload}),
            this.getTextModule("mail_text_registration_success", {"userpayload": userpayload}),    
        );
    }
}
module.exports = {Tellschn, tellschnTemplate, tellschnMailer}