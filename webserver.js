
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
var bodyParser     =        require("body-parser");
var app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
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
var mustache = require("mustache");
var templates = {
    "landing": fs.readFileSync("./webview/landing.html", "utf8"),
    "send_tells": fs.readFileSync("./webview/send_tells.html", "utf8"),
    "get_tells": fs.readFileSync("./webview/get_tells.html", "utf8"),
    "view_tells": fs.readFileSync("./webview/assets/view_tells.html", "utf8")
}
var connection = mysql.createConnection(accessconf.mysql);
var token_secret_index = [];
function nocache(req, res, next) {
    res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.header('Expires', '-1');
    res.header('Pragma', 'no-cache');
    next();
}

app.use("/assets", express.static("./webview/assets"));
app.use("/cdn", express.static("./cdn"));
app.get("/", function (req, res) {
    var debug = "";
    if (appconf.debug) {
        debug = JSON.stringify(req.session, null, 4).replace(new RegExp("[\n]+"), "\n<br>");
    }
    res.send(mustache.render(templates.landing, {"debug": debug}));
    res.status(200).end();
});
function uuid() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}


var get_own_tells_sqlstmt = "SELECT tells.id AS tell_id, tells.timestamp AS timestamp, tells.content AS tell_content, tells.do_not_share AS do_not_share,"
+ " attachment_media.is_mp4 AS is_mp4, attachment_media.size AS filesize, attachment_media.cdn_path AS cdn_path, IF(attachment_media.cdn_path IS NULL, FALSE, TRUE) AS has_media, "
+ " IF(answers.content IS NULL, FALSE, TRUE) AS was_answered, answers.content AS answer_content, answers.show_public AS answer_show_public,"
+ " answers.tweet_id AS answer_tweet_id, answers.show_media_public AS answer_show_media_public FROM `tells`"
+ " LEFT JOIN `attachment_media` ON tells.media_attachment = attachment_media.media_uuid"
+ " LEFT JOIN `answers` ON tells.id = answers.for_tell_id WHERE deleted = 0 AND tells.for_user_id = ? ORDER BY tells.id DESC LIMIT ?,10";
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
                                    "profile_pic_original_link": user.profile_image_url_https,
                                    "profile_pic_small_link": user.profile_image_url_https // TODO: DOWNSCALE!

                                }

                                connection.query("INSERT INTO `users` SET ?", data,
                                    function (err, sqlres) {
                                        if (err) throw err;
                                        util.log("Inserted data into Table, building Session");

                                        req.session.userpayload = data;
                                        req.session.requestSecret = undefined;
                                        util.log("Done with User Verify: new user");

                                        req.session.save(function(err) {
                                            if (err) throw err;
                                            res.redirect("/" + user.screen_name);
                                            res.end();
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
                                        req.session.userpayload = sqlsearchres[0];
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
    if (req.params.endpoint === "session_info") {
        // return general information about the logged in user

        //check if user is logged in, if not return error
        if (req.session.userpayload == undefined) {
            res.send(JSON.stringify({
                "err": "NOT_LOGGED_IN"
            }));
            res.end();
        }
        req.session.token = uuid();
        res.write(JSON.stringify({
            "payload": req.session.userpayload,
            "token": req.session.token}));
        res.end();
    } else if (req.params.endpoint === "user_info" && req.query.user != undefined && req.query.user != "") {
        // return info about user req.query.user
        var sql = "SELECT "
    } else if (req.params.endpoint === "logoff") {
        req.session.destroy(function() {
            res.redirect("/");
            return;
        });
        


    } else if (req.query.token !== req.session.token) {
        // Token Invalid, Abort Request
        console.log("Invalid token: ", req.query.token, req.session.token );
        res.write(JSON.stringify({
            "err": "TOKEN_INVALID"
        }));
        res.end();
        return;
    } 
    if (req.params.endpoint == "get_own_tells") {
        if (req.session.userpayload !== undefined && req.session.userpayload.twitter_id !== undefined) {
            if (req.query.page == undefined) {
                res.end("Es ist einer Fehler aufgetreten.");
            }
            var request = connection.query(get_own_tells_sqlstmt,
                [req.session.userpayload.twitter_id, parseInt(req.query.page*appconf.tells_per_page)], function (err, tells) {
                    if (err) throw err; console.log(request.sql);
                    res.send(mustache.render(templates.view_tells, {
                        "tells": tells
                    }));
                    res.end();
                })
        } else {
            res.end("Es ist ein Fehler aufgetreten.")
        }
    } 
});


app.post("/api/:endpoint", nocache, function(req, res) {
   
    if (req.query.token !== req.session.token) {
        // Token Invalid, Abort Request
        res.write(JSON.stringify({
            "err": "TOKEN_INVALID"
        }));
        res.end();
        return;
    }
    if (req.params.endpoint == "send_tell") {
        if (req.body.for_user_id !== undefined &&
            req.body.content !== undefined &&
            req.body.do_not_share !== undefined) {
                if (req.body.image_uid == undefined) {
                    req.body.image_uid = null;
                }
                if (req.body.by_user_id == undefined) {
                    req.body.by_user_id = null;
                }
                // routine to insert into database
                // sanity checks: length and check if the user id exists, etc.
                if (req.body.content.length > 9999) {
                    res.json({"err": "CONTENT_TOO_LONG", "status": "failed"});
                    res.end();
                }
                connection.query("SELECT twitter_id, twitter_handle, im_config FROM users WHERE twitter_id = ?", req.body.for_user_id, 
                    function (err, sanity_1) {
                        if (err) throw err;
                        if (sanity_1[0] == undefined) {
                            // user id not found
                            res.json({"err": "USER_ID_NOT_FOUND", "status": "failed"});
                            res.end();
                            return;
                        }
                        console.log(req.body, (req.body.do_not_share === "true") ? true : false)
                        connection.query("INSERT INTO tells (for_user_id, by_user_id, content, media_attachment, do_not_share) VALUES (?)", [[
                            req.body.for_user_id,
                            req.body.by_user_id,
                            req.body.content,
                            req.body.media_attachment,
                            (req.body.do_not_share === "true") ? true : false
                        ]], function(err) {
                            if (err) throw err;
                            // Insert Successful: 
                            // 1) Give Feedback to the user
                            // 2) Start Job to check if the user has IM Notifications activated
                            res.json({"err": null, "status": "success"});
                            res.end();
                            queue.create("send_instant_msg_notification", {
                                "twitter_id": sanity_1[0].twitter_id,
                                "twitter_handle": sanity_1[0].twitter_handle,
                                "im_config": sanity_1[0].im_config
                                
                            });
                            return;
                        });
                    });
            }
    } else if (req.params.endpoint == "give_answer") {
        if (req.body.for_tell_id !== undefined &&
            req.body.content !== undefined &&
            req.body.reply_config !== undefined) {
                
                // routine to insert into database
                // sanity checks: length and check if the user id exists, etc.
                if (req.body.content.length > 9999) {
                    res.json({"err": "CONTENT_TOO_LONG", "status": "failed"});
                    res.end();
                }
                connection.query("SELECT for_user_id FROM tells WHERE id = ?", req.body.for_tell_id, 
                    function (err, sanity_1) {
                        if (err) throw err;
                        if (sanity_1[0] == undefined) {
                            // user id not found
                            res.json({"err": "USER_ID_NOT_FOUND", "status": "failed"});
                            res.end();
                            return;
                        }
                        if (req.session.userpayload !== undefined && req.session.userpayload.twitter_id !== sanity_1[0]["for_user_id"]) {
                            // user tries to reply to a tell that is not their own
                            
                            res.json({"err": "WRONG_TELL_OWNER", "status": "failed"});
                            res.end();
                            return;
                        }
                        var replyconfig = [];
                        try {
                            replyconfig = JSON.parse(req.body.reply_config);
                        } catch (e) {
                            // invalid JSON
                            res.json({"err": "INVALID_SHARE_CONFIG", "status": "failed"});
                            res.end();
                            return;
                        }

                        connection.query("INSERT INTO answers (for_tell_id, content, show_public, show_media_public) VALUES (?)", [[
                            req.body.for_tell_id,
                            req.body.content,
                            replyconfig.show_on_page,
                            replyconfig.show_image_page
                        ]], function(err) {
                            if (err) throw err;
                            // Insert Successful: 
                            // 1) Give Feedback to the user
                            // 2) Start Job to check if the user has IM Notifications activated
                            res.json({"err": null, "status": "success"});
                            res.end();
                            if (replyconfig.send_tweet) {
                                queue.create("send_tweet", {
                                    "twitter_id": sanity_1[0].for_user_id,
                                    "for_tell_id": req.body.for_tell_id,
                                    "show_on_page": replyconfig.show_on_page,
                                    "content": req.body.content
                                });
                            }
                            return;
                        });
                    });
            }
    } else if (req.params.endpoint == "delete_tell") {
        if (req.body.tell_id !== undefined) {
            connection.query("UPDATE tells SET deleted = 1 WHERE id = ? and for_user_id = ?", [req.body.tell_id, req.session.userpayload.twitter_id], function(err) {
                if (err) throw err;
                res.json({"err": null, "status": "success"});
                res.end();
            })
        }
    }
});


app.get("/:userpage", nocache, function(req, res) {
    if (req.session.token == undefined) {
        req.session.token =  uuid();
    }
    if (req.session.userpayload !== undefined && req.params.userpage === req.session.userpayload.twitter_handle) {
        // show template for logged in user
        
        connection.query(get_own_tells_sqlstmt, [req.session.userpayload.twitter_id, 0], function (err, tells) {
            if (err) throw err;
            var custom_conf = JSON.parse(req.session.userpayload.custom_configuration);
            res.send(mustache.render(templates.get_tells, {
                "profile_image_url": req.session.userpayload.profile_pic_original_link,
                "display_name": req.session.userpayload.twitter_handle,
                "custom_configuration": {
                    "std_tweet": custom_conf.sharetw,
                    "std_post_feed": custom_conf.shareloc,
                    "std_tweet_image": custom_conf.shareimgtw,
                    "std_post_image": custom_conf.shareimgloc
                },
                "custom_page_text": req.session.userpayload.custom_page_text,
                "base_url": appconf.base_url,
                "token": req.session.token,
                "tells": tells
            }, {"tell_list": templates.view_tells}));
            res.end();
        })
        
    } else {
        // show template for telling a new tell
        connection.query("SELECT twitter_id, twitter_handle, profile_pic_original_link, profile_pic_small_link, custom_page_text FROM users WHERE twitter_handle = ?", req.params.userpage, function(err, result) {
            if (err) throw err;
            if (result[0] == undefined) {
                res.redirect("/");
                res.end();
                return;
            }
            res.send(mustache.render(templates.send_tells, {
                "profile_image_url": result[0].profile_pic_original_link,
                "display_name": result[0].twitter_handle,
                "custom_page_text": result[0].custom_page_text,
                "base_url": appconf.base_url,
                "twitter_id": result[0].twitter_id,
                "token": req.session.token
            }));
            res.end();
        })
        
    }
});