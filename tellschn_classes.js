const fs = require("fs");
class Tellschn {
    constructor() {
        const mysql = require("mysql");
        this.appconf = JSON.parse(fs.readFileSync("app-config.json", "utf8"));
        this.accessConf = JSON.parse(fs.readFileSync("access-config.json", "utf8"))
        this.sqlConnection = mysql.createConnection(this.accessConf.mysql);
    }
    sqlQuery(query, data) {
        return new Promise((resolve, reject) => {
            this.sqlConnection.query(query, data, function(error, result) {
                if (error) {
                    reject(error);
                    return
                } else {
                    resolve(result);
                }
            })
        })
    }
    
}
class tellschnTemplate extends Tellschn {
    constructor (lang = "de") {
        super();
        this.mustache = require("mustache");
        this.text_modules = JSON.parse(fs.readFileSync("translations/translation_"+lang+".json", "utf8"));
        this.static_prop = {
            text_modules: this.text_modules,
            appconf: this.appconf
        }
    }
    

    
    getTextModule(moduleName, additionalMoustacheContent = {}) {
        
        var combined_prop = {...this.static_prop, ...additionalMoustacheContent};
        
        return this.mustache.render(this.text_modules[moduleName], combined_prop);
    }

    renderFullTranslation(additionalMoustacheContent = {}) {
        let buffer = {};
        for (var i in this.text_modules) {

            //check wether the string actually contains a variable, if not just copy it
            if (this.text_modules[i].indexOf("{{") != -1) {
                buffer[i] = this.getTextModule([i], additionalMoustacheContent);
            } else {
                buffer[i] = this.text_modules[i];
            }
        }
        return buffer;
    }
    exportText_modules(data = {}) {
        return {...this.static_prop, ...this.renderFullTranslation(data)};
    }
}

module.exports = {Tellschn, tellschnTemplate}