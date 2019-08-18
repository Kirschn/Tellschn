
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
const port = process.argv[2] || appconf.express_port;
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
    secret: accessconf.cookie_secret,
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
    consumerKey: accessconf.twitter["consumer_key"],
    consumerSecret: accessconf.twitter["consumer_secret"],
    callback: accessconf.twitter["redirection_url"]
});
accessconf.mysql.encoding = 'utf8';
accessconf.mysql.charset = 'utf8mb4';
var mysql = require('mysql');
var connection = mysql.createConnection(accessconf.mysql);
var token_secret_index = [];

function nocache(req, res, next) {
    res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.header('Expires', '-1');
    res.header('Pragma', 'no-cache');
    next();
}

app.use("/assets", express.static("./webview/assets"));

app.get("/", function (req, res) {

    util.log(port, " /");
    res.send(JSON.stringify(req.session));
    res.status(200).end();
});

// twitter API Auth callback
app.get("/login/twitter_callback", function (req, res) {
    util.log(port, " /twitter_callback hit");
    if (req.query.oauth_token == null || req.query.oauth_verifier == null || req.session.requestSecret == undefined) {
        res.status(400).end("Query Parameters not set");
        return;
    }
    // verify user login
    util.log("Processing Login Verification for " + req.query.oauth_token);
    twitter.getAccessToken(req.query.oauth_token, req.session.requestSecret, req.query.oauth_verifier, function (err, accessToken, accessSecret) {
        if (err)
            throw err;
        else
            twitter.verifyCredentials(accessToken, accessSecret, function (err, user) {
                if (err) {
                    throw err;
                } else {
                    user.status = null;
                    user.entities = null;
                    connection.query("SELECT * FROM users WHERE `twitter_id` = ?", user.id_str,
                        function (err, sqlsearchres) {
                            if (err) throw err;
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
                                    "profile_pic_small_uuid": "PENDING"

                                }

                                connection.query("INSERT INTO `users` SET ?", data,
                                    function (err, sqlres) {
                                        if (err) throw err;
                                        util.log("Inserted data into Table, building Session");

                                        req.session.userpayload = data;
                                        req.session.requestSecret = undefined;
                                        util.log("Done with User Verify: new user");

                                        req.session.save(function(err) {
                                            res.redirect("/" + user.screen_name);
                                        })

                                    }

                                );
                            } else {
                                util.log("Found User in Database!")
                                connection.query("UPDATE `users` SET `oauth_token` = ?, `oauth_secret` = ?, `twitter_handle` = ?, `set_name` = ? WHERE `twitter_id` = ?",
                                    [accessToken, accessSecret, user.screen_name, user.name, user.id_str], function (err) {
                                        if (err) throw err;
                                        sqlsearchres[0]["oauth_token"] = accessToken;
                                        sqlsearchres[0]["oauth_secret"] = accessSecret;
                                        sqlsearchres[0]["twitter_handle"] = user.screen_name;
                                        sqlsearchres[0]["set_name"] = user.id_str;
                                        
                                        util.log("Storing to session...")
                                        req.session.userpayload = JSON.stringify(sqlsearchres[0]);
                                        req.session.save(function(err) {
                                            if (err) throw err;
                                        })
                                            res.redirect("/" + user.screen_name);
                                            res.end();
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
            req.session.requestSecret = requestSecret;
            req.session.save(function(err){});
            res.redirect("https://api.twitter.com/oauth/authenticate?oauth_token=" + requestToken);
        }
    });
});


app.listen(port, function () {
    util.log(port, 'Webserver online on Port ' + port + '!');
  });

app.get("/api/:endpoint", nocache, function(req, res) {
    if (req.params.endpoint == "") {

    } else if (req.params.endpoint === "logoff") {
        req.session.destroy(function() {
            res.redirect("/");
        });


    }
});

app.get("/:userpage", nocache, function(req, res) {

});