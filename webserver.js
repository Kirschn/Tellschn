const port = process.argv[2] || 8084;
function twoDigits(d) {
    if (0 <= d && d < 10) return "0" + d.toString();
    if (-10 < d && d < 0) return "-0" + (-1 * d).toString();
    return d.toString();
}
Date.prototype.toMysqlFormat = function () {
    return this.getUTCFullYear() + "-" + twoDigits(1 + this.getUTCMonth()) + "-" + twoDigits(this.getUTCDate()) + " " + twoDigits(this.getHours()) + ":" + twoDigits(this.getUTCMinutes()) + ":" + twoDigits(this.getUTCSeconds());
};
var fs = require("fs");
var util = require("util");
var accessconf = JSON.parse(fs.readFileSync("access-config.json", "utf8"));
var appconf = JSON.parse(fs.readFileSync("app-config.json", "utf8"));
var express = require('express');
var app = express();

const session = require('express-session');
const redis = require('redis');
const redisClient = redis.createClient();
const redisStore = require('connect-redis')(session);
redisClient.on('error', (err) => {
    console.log('Redis error: ', err);
});
app.use(session({
    secret: conf.cookie_secret,
    name: '_TellschnV2',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false },
    store: new redisStore({ host: 'localhost', port: 6379, client: redisClient, ttl: 86400 }),
}));
var kue = require('kue')
    , queue = kue.createQueue();
var Twitter = require("node-twitter-api");
var twitter = new Twitter({
    consumerKey: accessconf.twitter["consumer-key"],
    consumerSecret: accessconf.twitter["consumer-secret"],
    callback: accessconf.twitter["redirection_url"]
});
conf.mysql.encoding = 'utf8';
conf.mysql.charset = 'utf8mb4';
var mysql = require('mysql');
var connection = mysql.createConnection(accessconf.mysql);


function nocache(req, res, next) {
    res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.header('Expires', '-1');
    res.header('Pragma', 'no-cache');
    next();
}

app.use("/assets", express.static("./webview/assets"));

app.get("/", function (req, res) {

    util.log(port, " /");
    res.send(info.filledTemplates.index);
    res.status(200).end();
});

// twitter API Auth callback
app.get("/login/twitter_callback", function (req, res) {
    util.log(port, " /twitter_callback hit");
    if (req.query.oauth_token == null || req.query.oauth_verifier == null || token_secret_index[req.query.oauth_token] == undefined) {
        res.status(400).end("Query Parameters not set");
        return;
    }
    // verify user login
    util.log("Processing Login Verification for " + req.query.oauth_token);
    twitter.getAccessToken(req.query.oauth_token, req.query.request_secret, req.query.oauth_verification, function (err, accessToken, accessSecret) {
        if (err)
            return done(err);
        else
            twitter.verifyCredentials(accessToken, accessSecret, function (err, user) {
                if (err) {
                    return done(err);
                } else {
                    user.status = null;
                    user.entities = null;
                    connection.query("SELECT * FROM users WHERE `twitter_id` = ?", user.id_str,
                        function (err, sqlsearchres) {
                            if (err) { done(err); return; }
                            if (sqlsearchres[0] == undefined) {
                                util.log("Couldn't find User with ID " + user.id_str + " in user table, inserting new...");
                                var data = {
                                    "oauth_token": accessToken,
                                    "oauth_secret": accessSecret,
                                    "twitter_handle": user.screen_name,
                                    "twitter_id": user.id_str,
                                    "custom_configuration": JSON.stringify({
                                        "sharetw": true,
                                        "shareloc": true,
                                        "shareimgtw": true,
                                        "shareimgloc": true
                                    }),
                                    "profile_pic_large_uuid": "PENDING",
                                    "profile_pic_large_uuid": "PENDING"

                                }

                                connection.query("INSERT INTO `users` SET ?", data,
                                    function (err, sqlres) {
                                        if (err) throw err;
                                        util.log("Inserted data into Table, building Session");

                                        req.session.userpayload = JSON.stringify(data);
                                        util.log("Done with User Verify: new user");

                                        //TODO REDIRECT TO USER
                                        res.redirect("/" + user.screen_name)


                                    }

                                );
                            } else {
                                util.log("Found User in Database!")
                                connection.query("UPDATE `users` SET `oauth_token` = ?, `oauth_secret` = ?, `twitter_handle` = ?, `set_name` = ? WHERE `acc-id` = ?",
                                    [accessToken, accessSecret, user.screen_name, user.name, user.id_str], function (err) {
                                        if (err) throw err;
                                        var data = {
                                            "oauth-token": accessToken,
                                            "secret": accessSecret,
                                            "handle": user.screen_name,
                                            "acc-id": user.id_str,
                                            "userinfo": JSON.stringify(user)
                                        };
                                        util.log("Storing to session...")
                                        req.session.userpayload = JSON.stringify(data);
                                        res.redirect("/" + user.screen_name);
                                    });


                            }
                        })

                }
            });
    });
})

// redirect user to 
app.get("/login/request-token", function (req, res) {

    util.log(port, " /request-token hit");
    twitter.getRequestToken(function (err, requestToken, requestSecret) {
        if (err) {
            res.status(500).send("Ein Fehler ist aufgetreten. Kontaktiere bitte @theKirschn oder @nope_js.").end();
            console.log(err);
        } else {
            token_secret_index[requestToken] = requestSecret;
            res.redirect("https://api.twitter.com/oauth/authenticate?oauth_token=" + requestToken);
        }
    });
});