const fs = require("fs");
const nodemailer = require("nodemailer");
const util = require("util");
const Lynx = require("lynx");
const request = require("request");
const git = require('git-last-commit');

class Tellschn {
    constructor() {
        const mysql = require("mysql");
        this.appconf = JSON.parse(fs.readFileSync("app-config.json", "utf8"));
        this.accessConf = JSON.parse(fs.readFileSync("access-config.json", "utf8"))
        this.sqlConnection = mysql.createConnection(this.accessConf.mysql);
        git.getLastCommit((err, commit) => {
            if (err) throw err
            this.appconf.lastCommit = commit;
        })
    }
    sqlQuery(query, data) {
        return new Promise((resolve, reject) => {
            let sqlQueryObejct = this.sqlConnection.query(query, data, function (error, result) {

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
    async sleep(time) {
        setTimeout(() => {
            Promise.resolve()
        }, time)
    }
    
}
class tellschnTemplate extends Tellschn {
    constructor(lang = "de") {
        super();
        this.mustache = require("mustache");
        this.translation = JSON.parse(fs.readFileSync("translations/translation_" + lang + ".json", "utf8"));
        this.static_prop = {
            translation: this.translation,
            appconf: this.appconf,
            accessconf: this.accessConf
        }
    }



    getTextModule(moduleName, additionalMoustacheContent = {}) {

        var combined_prop = { ...this.static_prop, ...additionalMoustacheContent };

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
        return { ...this.static_prop, ...{ "translation": this.renderFullTranslation(data) } };
    }

}

class tellschnMailer extends tellschnTemplate {
    constructor(lang) {
        super(lang);

        this.mailer = nodemailer.createTransport(this.accessConf.mail);
        this.metrics = new tellschnMetrics();
    }
    async sendMail(to, subject, text) {
        let info = await this.mailer.sendMail({
            "from": this.accessConf.mail.sender,
            "to": to,
            "subject": subject,
            "text": text
        });
        this.metrics.increment("emails-sent");
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
            this.getTextModule("mail_subject_register", { "userpayload": userpayload }),
            this.getTextModule("mail_text_register", { "userpayload": userpayload, "email_token": validation_token }),
        );
    }
    async sendRegistrationNotificationSuccessMail(address, userpayload) {

        this.sendMail(address,
            this.getTextModule("mail_subject_registration_success", { "userpayload": userpayload }),
            this.getTextModule("mail_text_registration_success", { "userpayload": userpayload }),
        );
    }
}

class tellschnMetrics extends Tellschn {
    constructor(service_name = "tellschn") {
        super();
        this.service_name = service_name;
        if (this.accessConf.metrics.enabled) {
            this.metrics = new Lynx(this.accessConf.metrics.statsd_host, this.accessConf.metrics.statsd_port);
        }
    }
    increment(value) {
        if (this.accessConf.metrics.enabled) {
            this.metrics.increment(this.service_name + '.' + value);
        }
        return;
    }
    webHit(endpoint) {
        this.increment("tellschnweb_" + endpoint.replace("/", "-"));
    }
}
class tellschnMedia extends Tellschn {
    constructor() {
        super();
    }
    async addMediaFromTempDir(filename) {
        return new Promise((resolve, reject) => {
            var kue = require('kue')
                , queue = kue.createQueue();
            var processUploadJob = queue.create("process_uploaded_file", {
                "tempFileLocation": filename,
                "title": "Process Uploaded File " + filename
            }).save();
            processUploadJob.on('complete', function (result) {
                console.log('Job completed with data ', result);
                resolve(result);
                return result;
            }).on('failed', function (errorMessage) {
                console.log('Job failed', errorMessage);
                reject(new Error("ERR_CONVERTING_VIDEO"));
            }).on('progress', function (progress, data) {
                console.log('\r  job #' + processUploadJob.id + ' ' + progress + '% complete with data ', data);

            });
        })

    }
    async downloadMediaToDatabase(url) {
        return new Promise((resolve, reject) => {
            let urlSplit = url.split("/");
            let random = Math.floor(Math.random() * 1000);
            let filename = 'tmp/' + random + "-" + urlSplit[urlSplit.length - 1]

            request.get(url, { "encoding": null }, async function (err, response) {
                if (err) reject(err);
                fs.writeFileSync(filename, Buffer.from(response.body), "utf8");
                let UUID = await (new tellschnMedia).addMediaFromTempDir(filename);
                resolve(UUID);
            })
        });
    }
}

module.exports = { Tellschn, tellschnTemplate, tellschnMailer, tellschnMetrics, tellschnMedia }