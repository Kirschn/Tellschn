function twoDigits(d){
    if(0 <= d && d < 10) return "0" + d.toString();
    if(-10 < d && d < 0) return "-0" + (-1 * d).toString();
    return d.toString();
}

Date.prototype.toMysqlFormat = function(){
    return this.getUTCFullYear() + "-" + twoDigits(1 + this.getUTCMonth()) + "-" + twoDigits(this.getUTCDate()) + " " + twoDigits(this.getHours()) + ":" + twoDigits(this.getUTCMinutes()) + ":" + twoDigits(this.getUTCSeconds());
};
const tellschnModule = require("./tellschn_classes.js");
const Tellschn = new tellschnModule.Tellschn();
const tellschnTemplate = new tellschnModule.tellschnTemplate();
const tellschnMetrics = new tellschnModule.tellschnMetrics();
const tellschnMedia = new tellschnModule.tellschnMedia();
var fs = require("fs");
var util = require("util");
var accessconf = JSON.parse(fs.readFileSync("access-config.json", "utf8"));
var appconf = JSON.parse(fs.readFileSync("app-config.json", "utf8"));
const port = process.argv[2] || appconf.express_port;
var express = require('express');
var bodyParser = require("body-parser");
const fileUpload = require('express-fileupload');
var app = express();
app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());
var dateFormat = require("dateformat");
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
    cookie: {secure: false, maxAge: 86400000},
    store: new redisStore({host: 'localhost', port: 6379, client: redisClient, ttl: 864000}),
}));
app.use(fileUpload());
app.use((req, res, next) => {
    tellschnMetrics.increment("webserver-hit")
    next();
})
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
var mustache = require("mustache");
var templates = {
    "landing": fs.readFileSync("./webview/landing.html", "utf8"),
    "send_tells": fs.readFileSync("./webview/send_tells.html", "utf8"),
    "get_tells": fs.readFileSync("./webview/get_tells.html", "utf8"),
    "view_tells": fs.readFileSync("./webview/assets/view_tells.html", "utf8"),
    "render_tell": fs.readFileSync("./webview/assets/image_render_tell_template.html", "utf8"),
    "settings_page": fs.readFileSync("./webview/settings.html", "utf8")
}
var token_secret_index = [];

function nocache(req, res, next){
    res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.header('Expires', '-1');
    res.header('Pragma', 'no-cache');
    next();
}

app.use("/cdn", express.static("./cdn"));
app.use("/assets", express.static("./webview/assets"));

app.get("/", function(req, res){
    if(req.session.userpayload != undefined){
        res.redirect("/" + req.session.userpayload.twitter_handle);
        res.end();
        return;
    }
    tellschnMetrics.webHit("landing")
    var debug = "";
    if(appconf.debug){
        debug = JSON.stringify(req.session, null, 4).replace(new RegExp("[\n]+"), "\n<br>");
    }
    res.send(mustache.render(templates.landing, {"debug": debug}));
    res.status(200).end();
});

function uuid(){
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}


var get_own_tells_sqlstmt = "SELECT tells.id AS tell_id, tells.timestamp AS timestamp, tells.content AS tell_content, tells.do_not_share AS do_not_share,"
    + " attachment_media.is_mp4 AS is_mp4, attachment_media.size AS filesize, attachment_media.cdn_path AS cdn_path, IF(attachment_media.cdn_path IS NULL, FALSE, TRUE) AS has_media, "
    + " IF(answers.content IS NULL, FALSE, TRUE) AS was_answered, answers.content AS answer_content, answers.show_public AS answer_show_public, answers.was_edited AS answer_was_edited,"
    + " answers.tweet_id AS answer_tweet_id, answers.show_media_public AS answer_show_media_public FROM `tells`"
    + " LEFT JOIN `attachment_media` ON tells.media_attachment = attachment_media.media_uuid"
    + " LEFT JOIN `answers` ON tells.id = answers.for_tell_id WHERE deleted = 0 AND (tells.for_user_id = ? OR answers.id = ?) ORDER BY tells.timestamp DESC LIMIT ?,10";
var get_public_answers = "SELECT `answers`.`content` AS answer_content, `answers`.tweet_id AS answer_tweet_id, attachment_media.cdn_path AS cdn_path, answers.timestamp AS timestamp, answers.was_edited AS answer_was_edited, IF(attachment_media.cdn_path IS NULL, FALSE, TRUE) AS has_media, attachment_media.is_mp4 AS is_mp4, attachment_media.size AS filesize, tells.content AS tell_content FROM answers LEFT JOIN `tells` ON answers.for_tell_id = tells.id LEFT JOIN `attachment_media` ON attachment_media.media_uuid = tells.media_attachment WHERE tells.deleted = 0 AND tells.for_user_id = ? AND answers.show_public = 1 ORDER BY answers.timestamp DESC LIMIT ?,10";

function mysql_result_time_to_string(result_object, date_key){
    let bufferObject = [];
    result_object.forEach((currentObject) => {
        currentObject[date_key] = dateFormat(currentObject[date_key], "dd.mm.yyyy HH:MM") + " Uhr";
        bufferObject.push(currentObject);
    });
    return bufferObject;
}

// twitter API Auth callback
app.get("/login/twitter_callback", function(req, res){
    tellschnMetrics.webHit("twitter_login");
    util.log(port, " /twitter_callback hit");
    if(req.query.oauth_token == null || req.query.oauth_verifier == null || req.session.requestSecret == undefined){
        res.status(400).end("Query Parameters not set");
        return;
    }
    // verify user login
    util.log("Processing Login Verification for " + req.query.oauth_token);
    twitter.getAccessToken(req.query.oauth_token, req.session.requestSecret, req.query.oauth_verifier, function(err, accessToken, accessSecret){
        if(err){
            res.status(401)
            res.send("Es ist ein Fehler aufgetreten").end();
        } else{
            twitter.verifyCredentials(accessToken, accessSecret, async function(err, user){
                if(err) throw err;

                user.status = null;
                user.entities = null;
                let sqlsearchres = await Tellschn.sqlQuery("SELECT users.*, attachment_media.cdn_path AS profile_pic_cdn_link FROM users LEFT JOIN attachment_media ON attachment_media.media_uuid = users.profile_pic_uuid WHERE `twitter_id` = ?", user.id_str);
                Tellschn.dbg(sqlsearchres)
                if(sqlsearchres[0] == undefined){
                    let profile_pic_uuid = await tellschnMedia.downloadMediaToDatabase(user.profile_image_url_https);
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
                        "profile_pic_small_link": user.profile_image_url_https, // TODO: DOWNSCALE!
                        "profile_pic_uuid": profile_pic_uuid

                    }

                    await Tellschn.sqlQuery("INSERT INTO `users` SET ?", data);
                    util.log("Inserted data into Table, building Session");
                    req.session.own_twitter_id = user.id_str;
                    req.session.userpayload = data;
                    req.session.own_userpayload = data;
                    req.session.requestSecret = undefined;
                    util.log("Done with User Verify: new user");

                    req.session.save(function(err){
                        if(err) throw err;
                        res.redirect("/" + user.screen_name);
                        res.end();
                    })


                } else{
                    util.log("Found User in Database!")
                    let sql = "UPDATE `users` SET `oauth_token` = ?, `oauth_secret` = ?, `twitter_handle` = ?, `set_name` = ?, `profile_pic_original_link` = ?, `profile_pic_small_link` = ? ";
                    let value_sql = [accessToken, accessSecret, user.screen_name, user.name, user.profile_image_url_https, user.profile_image_url_https];
                    if(sqlsearchres[0].profile_pic_original_link != user.profile_image_url_https){
                        util.log("Profile Pic Updated");
                        sql += ", profile_pic_uuid = ? "
                        let uuid = await tellschnMedia.downloadMediaToDatabase(user.profile_image_url_https);
                        user.profile_pic_uuid = uuid;
                        let profilePicCdnLink = await Tellschn.sqlQuery("SELECT cdn_path FROM attachment_media WHERE media_uuid = ?", user.profile_pic_uuid);

                        sqlsearchres[0]["profile_pic_cdn_link"] = profilePicCdnLink[0].cdn_path;

                        value_sql.push(uuid);
                    }
                    sql += "WHERE `twitter_id` = ?"
                    value_sql.push(user.id_str);
                    await Tellschn.sqlQuery(sql, value_sql);

                    sqlsearchres[0]["oauth_token"] = accessToken;
                    sqlsearchres[0]["oauth_secret"] = accessSecret;
                    sqlsearchres[0]["twitter_handle"] = user.screen_name;
                    sqlsearchres[0]["set_name"] = user.id_str;
                    sqlsearchres[0]["profile_pic_original_link"] = user.profile_image_url_https;
                    sqlsearchres[0]["profile_pic_small_link"] = user.profile_image_url_https;


                    util.log("Storing to session...")
                    req.session.userpayload = sqlsearchres[0];
                    req.session.own_twitter_id = user.id_str;
                    req.session.own_userpayload = sqlsearchres[0];
                    req.session.save(function(err){
                        if(err) throw err;
                    })
                    res.redirect("/" + user.screen_name);
                    res.end();


                }


            });
        }
    });

})

// redirect user to 
app.get("/login/request-token", function(req, res){

    util.log(port, " /request-token hit");
    twitter.getRequestToken(function(err, requestToken, requestSecret){
        if(err){
            res.status(500).send("Ein Fehler ist aufgetreten. Kontaktiere bitte @theKirschn oder @nope_js.").end();
            console.log(err);
        } else{
            req.session.requestSecret = requestSecret;
            req.session.save(function(err){
            });
            res.redirect("https://api.twitter.com/oauth/authenticate?oauth_token=" + requestToken);
        }
    });
});


app.listen(port, function(){
    util.log(port, 'Webserver online on Port ' + port + '!');
});

app.get("/telegram_code", nocache, async(req, res) => {
    if(req.session.own_twitter_id == undefined){
        res.redirect("/");
        res.end();
        return;
    }
    let token = String(Math.floor(Math.random() * 999999));
    while(token.length < 6){
        token = "0" + token
    }
    ;
    await Tellschn.sqlQuery("INSERT INTO user_notification_services (twitter_id, platform, validation_token) VALUES (?)", [[
        req.session.userpayload.twitter_id,
        "telegram",
        token
    ]]);
    res.end(token);
});

app.get("/confirm_email", nocache, async(req, res) => {
    if(req.query.token != undefined){

        let rows = await Tellschn.sqlQuery("SELECT address, users.twitter_handle FROM user_notification_services, users WHERE users.twitter_id = user_notification_services.twitter_id AND validation_token = ?", req.query.token);

        if(rows.length == 1){
            await Tellschn.sqlQuery("UPDATE user_notification_services SET validation_token = NULL WHERE validation_token = ?", req.query.token);
            // success
            // send notifiction mail 
            queue.create("send_notification_registration_success_mail", {
                "title": "Send Notification Registration Success Mail",
                "address": rows[0].address,
                "userpayload": rows[0]
            }).save();
            res.redirect("/" + req.session.userpayload.twitter_handle).end();
        } else{
            // no success
            res.end("Es ist leider ein Fehler aufgetreten. Bitte versuche es erneut.");

        }
    }
});

app.get("/settings", nocache, async(req, res) => {
    tellschnMetrics.webHit("settings")
    if(req.session.own_twitter_id == undefined){
        res.redirect("/");
        res.end();
        return;
    }
    try{
        let has_access_to = await Tellschn.sqlQuery("SELECT users.twitter_id AS shared_twitter_id, users.twitter_handle AS shared_display_name, attachment_media.cdn_path AS profile_pic_cdn_link FROM users LEFT JOIN user_access_sharing ON user_access_sharing.from_user_id = users.twitter_id LEFT JOIN attachment_media ON attachment_media.media_uuid = users.profile_pic_uuid WHERE user_access_sharing.to_user_id = ?", req.session.own_twitter_id)

        let allowed_account_results = await Tellschn.sqlQuery("SELECT users.twitter_id AS to_twitter_id, users.twitter_handle AS to_user_screen_name, users.profile_pic_original_link AS profile_image_url, user_access_sharing.granted_at AS granted_at FROM users, user_access_sharing WHERE " +
            "user_access_sharing.to_user_id = users.twitter_id AND user_access_sharing.from_user_id = ?",
            [req.session.own_twitter_id, req.session.own_twitter_id]);

        allowed_account_results = mysql_result_time_to_string(allowed_account_results, "granted_at");

        let notification_registrations = await Tellschn.sqlQuery("SELECT id, platform, recipient_name, timestamp FROM user_notification_services WHERE twitter_id = ?", req.session.userpayload.twitter_id);

        notification_registrations = mysql_result_time_to_string(notification_registrations, "timestamp");
        let templateFiller = {
            "userpayload": req.session.userpayload,
            "is_own_account": (req.session.userpayload.twitter_id == req.session.own_twitter_id),
            "base_url": appconf.base_url,
            "token": req.session.token,
            "edit_tools": true,
            "user_access_sharing": allowed_account_results,
            "account_pool": has_access_to,
            "base_user": {
                "profile_image_url": appconf.cdn_path + req.session.own_userpayload.profile_pic_cdn_link,
                "display_name": req.session.own_userpayload.twitter_handle,
                "twitter_id": req.session.own_twitter_id
            },
            "notification_registrations": notification_registrations
        }
        templateFiller = {...templateFiller, ...tellschnTemplate.exportText_modules(templateFiller)};
        res.send(mustache.render(templates.settings_page, templateFiller));
        res.end();
    } catch(e){
        throw e;
    }
    return;


})

app.get("/api/:endpoint", nocache, async function(req, res){
    if(appconf.debug && req.params.endpoint == "debug"){
        res.json(req.session).end();
        console.log(req.session)
    }
    tellschnMetrics.webHit("api_get");
    if(req.params.endpoint === "session_info"){
        // return general information about the logged in user

        //check if user is logged in, if not return error
        if(req.session.userpayload == undefined){
            res.send(JSON.stringify({
                "err": "NOT_LOGGED_IN"
            }));
            res.end();
        }
        req.session.token = uuid();
        res.write(JSON.stringify({
            "payload": req.session.userpayload,
            "token": req.session.token
        }));
        res.end();
    } else if(req.params.endpoint === "logoff"){
        req.session.destroy(function(){
            res.redirect("/");
            return;
        });


    } else if(req.query.token !== req.session.token){
        // Token Invalid, Abort Request
        console.log("Invalid token: ", req.query.token, req.session.token);
        res.write(JSON.stringify({
            "err": "TOKEN_INVALID"
        }));
        res.end();
        return;
    }
    if(req.params.endpoint == "get_own_tells"){
        if(req.session.userpayload !== undefined && req.session.userpayload.twitter_id !== undefined){
            if(req.query.page == undefined){
                res.end("Es ist einer Fehler aufgetreten.");
            }
            let tells = await Tellschn.sqlQuery(get_own_tells_sqlstmt,
                [req.session.userpayload.twitter_id, null, parseInt(req.query.page * appconf.tells_per_page)])
            tells = mysql_result_time_to_string(tells, "timestamp")

            Tellschn.dbg("Showing " + tells.length + " more Tells");
            if(tells.length == 0){

                res.status(404);
            }

            let templateFiller = {
                "edit_tools": true,
                "tells": tells
            }
            templateFiller = {...templateFiller, ...tellschnTemplate.exportText_modules(templateFiller)};

            res.send(mustache.render(templates.view_tells, templateFiller));
            res.end();

        } else{
            res.end("Es ist ein Fehler aufgetreten.")
        }
    }
    if(req.params.endpoint == "get_public_tells"){
        if(req.query.page == undefined || req.query.twitter_id == undefined){
            res.end("Es ist einer Fehler aufgetreten.");
            return;

        }
        if((parseInt(req.query.page) - 1) == NaN){
            res.end("Es ist einer Fehler aufgetreten.");
            return;
        }
        let tells = await Tellschn.sqlQuery(get_public_answers,
            [req.query.twitter_id, parseInt(req.query.page) * appconf.tells_per_page]);
        tells = mysql_result_time_to_string(tells, "timestamp")
        Tellschn.dbg("Showing " + tells.length + " more Tells");
        if(tells.length == 0){

            res.status(404);
        }
        tells.has_answer = true;
        tells.edit_tools = false;

        let templateFiller = {
            "tells": tells
        };
        templateFiller = {...templateFiller, ...tellschnTemplate.exportText_modules(templateFiller)};

        res.send(mustache.render(templates.view_tells, templateFiller));
        res.end();

    } else if(req.params.endpoint == "switch_user"){
        function shiftUserPayload(payload){
            req.session.userpayload = payload;
            req.session.save(function(err){
                if(err) throw err;
            })
            res.redirect("/" + req.session.userpayload.screen_name);
            res.end();
        }

        if(req.query.twitter_id == req.session.own_twitter_id){
            // switch back to own account
            shiftUserPayload(req.session.own_userpayload);

        } else if(req.query.twitter_id != undefined && req.query.twitter_id != null){
            var sql = "SELECT users.* FROM users, user_access_sharing WHERE user_access_sharing.from_user_id = users.twitter_id " +
                "AND user_access_sharing.from_user_id = ? AND user_access_sharing.to_user_id = ?";
            let result = await Tellschn.sqlQuery(sql, [req.query.twitter_id, req.session.own_twitter_id]);

            if(result[0] == undefined){
                res.end("Leider hast du keinen Zugriff auf diesen Benutzer. ");
                console.log("Failed Switch: ", req.query.twitter_id, req.session.own_twitter_id)
                return;
            }

            shiftUserPayload(result[0]);
        }


    } else if(req.params.endpoint == "upload_status"){
        if(req.session.latestUpload == undefined){
            res.json({err: "NO_UPLOAD"}).end();
        } else{
            res.json(req.session.latestUpload).end();
        }
    }
});


app.post("/api/:endpoint", nocache, async function(req, res){
    tellschnMetrics.webHit("api_post")
    Tellschn.dbg("POST ENDPOINT " + req.params.endpoint)
    if(req.query.token !== req.session.token){
        // Token Invalid, Abort Request
        res.write(JSON.stringify({
            "err": "TOKEN_INVALID"
        }));
        res.end();
        return;
    }
    if(req.params.endpoint == "send_tell"){
        if(req.body.for_user_id !== undefined &&
            req.body.content !== undefined &&
            req.body.do_not_share !== undefined){
            if(req.body.image_uid == undefined){
                req.body.image_uid = null;
            }
            if(req.body.by_user_id == undefined){
                req.body.by_user_id = null;
            }
            // routine to insert into database
            // sanity checks: length and check if the user id exists, etc.
            if(req.body.content.length > 9999){
                res.json({"err": "CONTENT_TOO_LONG", "status": "failed"});
                res.end();
            }
            let sanity_1 = await Tellschn.sqlQuery("SELECT * FROM users WHERE twitter_id = ?", req.body.for_user_id);
            if(sanity_1[0] == undefined){
                // user id not found
                res.json({"err": "USER_ID_NOT_FOUND", "status": "failed"});
                res.end();
                return;
            }
            await Tellschn.sqlQuery("INSERT INTO tells (for_user_id, by_user_id, content, media_attachment, do_not_share) VALUES (?)", [[
                req.body.for_user_id,
                req.body.by_user_id,
                req.body.content,
                req.body.media_attachment,
                (req.body.do_not_share === "true") ? true : false
            ]]);
            // Insert Successful: 
            // 1) Give Feedback to the user
            // 2) Start Job to check if the user has IM Notifications activated
            res.json({"err": null, "status": "success"});
            res.end();
            queue.create("send_instant_msg_notification", {
                "userpayload": sanity_1[0],
                "title": "Send instant msg notifications for new Tell @" + sanity_1[0].twitter_handle

            }).save(function(err){
                if(err) throw err;
            });
            return;


        }
    } else if(req.params.endpoint == "give_answer"){
        if(req.body.for_tell_id !== undefined &&
            req.body.content !== undefined &&
            req.body.reply_config !== undefined){

            // routine to insert into database
            // sanity checks: length and check if the user id exists, etc.
            if(req.body.content.length > 9999){
                res.json({"err": "CONTENT_TOO_LONG", "status": "failed"});
                res.end();
            }
            let sanity_1 = await Tellschn.sqlQuery("SELECT for_user_id FROM tells WHERE id = ?", req.body.for_tell_id);
            if(sanity_1[0] == undefined){
                // user id not found
                res.json({"err": "USER_ID_NOT_FOUND", "status": "failed"});
                res.end();
                return;
            }
            if(req.session.userpayload !== undefined && req.session.userpayload.twitter_id !== sanity_1[0]["for_user_id"]){
                // user tries to reply to a tell that is not their own

                res.json({"err": "WRONG_TELL_OWNER", "status": "failed"});
                res.end();
                return;
            }
            var replyconfig = [];
            try{
                replyconfig = JSON.parse(req.body.reply_config);
            } catch(e){
                // invalid JSON
                res.json({"err": "INVALID_SHARE_CONFIG", "status": "failed"});
                res.end();
                return;
            }

            await Tellschn.sqlQuery("INSERT INTO answers (for_tell_id, content, show_public, show_media_public) VALUES (?)", [[
                req.body.for_tell_id,
                req.body.content,
                replyconfig.show_on_page,
                replyconfig.show_image_page
            ]]);
            // Insert Successful: 
            // 1) Give Feedback to the user
            // 2) Start Job to check if the user has IM Notifications activated
            res.json({"err": null, "status": "success"});
            res.end();
            console.log("Replyconfig:");
            console.log(replyconfig)
            if(replyconfig.send_tweet){
                util.log("Trigger Job to send Tweet")
                let job_data = {
                    "title": "Send Answer-Tweet for Tell " + req.body.for_tell_id,
                    "twitter_id": sanity_1[0].for_user_id,
                    "for_tell_id": req.body.for_tell_id,
                    "share_image_twitter": replyconfig.share_image_twitter
                };
                console.log("Job Data", job_data)
                queue.create("send_tweet", job_data).save(function(err){
                    if(err) throw err;
                });
            } else{
                util.log("Not sending Tweet because of " + replyconfig.send_tweet)
            }
            return;


        }
    } else if(req.params.endpoint == "delete_tell"){
        if(req.body.tell_id !== undefined){
            await Tellschn.sqlQuery("UPDATE tells SET deleted = 1 WHERE id = ? and for_user_id = ?", [req.body.tell_id, req.session.userpayload.twitter_id]);

            res.json({"err": null, "status": "success"});
            res.end();

        }
    } else if(req.params.endpoint == "edit_answer"){
        if(req.body.for_tell_id !== undefined &&
            req.body.content !== undefined){

            // routine to insert into database
            // sanity checks: length and check if the user id exists, etc.
            if(req.body.content.length > 9999){
                res.json({"err": "CONTENT_TOO_LONG", "status": "failed"});
                res.end();
            }
            let sanity_1 = await Tellschn.sqlQuery("SELECT tells.for_user_id, answers.id AS answer_id FROM tells INNER JOIN answers ON answers.for_tell_id = tells.id WHERE tells.id = ?", req.body.for_tell_id);

            if(sanity_1[0] == undefined){
                // user id not found
                res.json({"err": "USER_ID_NOT_FOUND", "status": "failed"});
                res.end();
                return;
            }
            if(req.session.userpayload !== undefined && req.session.userpayload.twitter_id !== sanity_1[0]["for_user_id"]){
                // user tries to reply to a tell that is not their own

                res.json({"err": "WRONG_TELL_OWNER", "status": "failed"});
                res.end();
                return;
            }
            try{
                var sharing_conf = JSON.parse(req.body.sharing_conf);
            } catch(e){
                console.log(e);
                res.json({"err": "INVALID_JSON", "status": "failed"});
                res.end();
                return;
            }
            await Tellschn.sqlQuery("UPDATE answers SET for_tell_id = ?, content = ?, show_public =?, show_media_public = ?, was_edited = 1 WHERE id = ?", [
                req.body.for_tell_id,
                req.body.content,
                sharing_conf.show_on_page,
                sharing_conf.show_image_page,
                sanity_1[0]["answer_id"]
            ]);
            // Insert Successful: 
            // 1) Give Feedback to the user
            // 2) Start Job to check if the user has IM Notifications activated
            res.json({"err": null, "status": "success"});
            res.end();

            return;


        }
    } else if(req.params.endpoint == "grant_user_access"){
        Tellschn.dbg("Granting Access Request")
        // endpoint to grant access from another account to your own
        if(req.body.twitter_handle == undefined){
            res.json({"err": "INVALID_HANDLE", "status": "failed"});
            res.end();
            return;
        }
        var sql = "SELECT twitter_id FROM users WHERE twitter_handle = ?";
        let id_result = await Tellschn.sqlQuery(sql, req.body.twitter_handle);
        if(id_result[0] == undefined){
            res.json({"err": "INVALID_HANDLE", "status": "failed"});
            res.end();
            return;
        }
        var sql = "INSERT INTO user_access_sharing (from_user_id, to_user_id) VALUES (?)";
        await Tellschn.sqlQuery(sql, [[req.session.userpayload.twitter_id, id_result[0].twitter_id]]);
        res.json({"err": null, "status": "success"});
        res.end();


    } else if(req.params.endpoint == "remove_user_access"){

        // endpoint to grant access from another account to your own
        if(req.body.twitter_handle == undefined){
            Tellschn.dbg("No twitter_handle in request body found")
            res.json({"err": "INVALID_HANDLE", "status": "failed"});
            res.end();
            return;
        }
        var sql = "SELECT twitter_id FROM users WHERE twitter_handle = ?";
        let id_result = await Tellschn.sqlQuery(sql, req.body.twitter_handle);
        if(id_result[0] == undefined){
            res.json({"err": "INVALID_HANDLE", "status": "failed"});
            res.end();
            return;
        }
        var sql = "DELETE FROM user_access_sharing WHERE from_user_id = ? AND to_user_id = ?";
        await Tellschn.sqlQuery(sql, [req.session.userpayload.twitter_id, id_result[0].twitter_id]);
        res.json({"err": null, "status": "success"});
        res.end();


    } else if(req.params.endpoint == "upload_media"){
        util.log("Media Upload");
        if(!req.files || req.files.media == undefined){
            return res.status(400).send({"err": "NO_FILE_UPLOADED"});
        }
        var random = Math.floor(Math.random() * 1000);
        req.files.media.mv("./tmp/" + random + req.files.media.name, function(error){
            if(error) throw error;
            res.json({"err": null, "status": "success"}).end();
            Tellschn.dbg("Created Job for uploading Media");
            var processUploadJob = queue.create("process_uploaded_file", {
                "tempFileLocation": "./tmp/" + random + req.files.media.name,
                "title": "Process Uploaded File " + random + req.files.media.name
            }).save();
            req.session.latestUpload = {
                uuid: null,
                progress: 0,
                error: null
            }
            req.session.save();
            processUploadJob.on('complete', function(result){
                console.log('Job completed with data ', result);
                req.session.latestUpload = {
                    uuid: result,
                    progress: 100,
                    error: null
                }
                req.session.save();
            }).on('failed', function(errorMessage){
                console.log('Job failed', errorMessage);
                req.session.latestUpload.error = "ERR_CONVERTING_VIDEO";
                req.session.save();
            }).on('progress', function(progress, data){
                console.log('\r  job #' + processUploadJob.id + ' ' + progress + '% complete with data ', data);
                req.session.latestUpload = {
                    "progress": Math.round(parseFloat(progress)),
                    error: null,
                    uuid: null
                }
                req.session.save();
            });
        });
    } else if(req.params.endpoint == "change_setting"){

        /* Params: String custom_page_text Bools: default_share_twitter/local default_share_img_local/twitter*/
        if(typeof req.body.custom_page_text == "string"){
            console.log("API SETTING CHANGE: CUSTOM PAGE TEXT")
            if(req.body.custom_page_text.length > 1000){
                res.json({"err": "CUSTOM_PAGE_TEXT_TOO_LONG", status: "failed"}).end();
                return;
            }
            // change Custom Page Text (MySQL Field in user table)
            var sql = "UPDATE users SET custom_page_text = ? WHERE twitter_id = ?";
            await Tellschn.sqlQuery(sql, [req.body.custom_page_text, req.session.userpayload.twitter_id]);

            req.session.userpayload.custom_page_text = req.body.custom_page_text;


        }
        let sqlRes = await Tellschn.sqlQuery("SELECT custom_configuration FROM users WHERE twitter_id = ?", req.session.userpayload.twitter_id);
        var customConfig = JSON.parse(sqlRes[0].custom_configuration);
        if(typeof req.body.default_share_twitter == "string"){
            if(req.body.default_share_twitter == "true"){
                req.body.default_share_twitter = true;
            } else{
                req.body.default_share_twitter = false;
            }
            console.log("API SETTING CHANGE: DEFAULT SHARE TWITTER")
            // change default value (value in config field JSON)

            customConfig.sharetw = req.body.default_share_twitter;


        }
        if(typeof req.body.default_share_local == "string"){
            if(req.body.default_share_local == "true"){
                req.body.default_share_local = true;
            } else{
                req.body.default_share_local = false;
            }
            console.log("API SETTING CHANGE: DEFAULT SHARE LOCAL")
            // change default value (value in config field JSON)

            customConfig.shareloc = req.body.default_share_local;


        }
        if(typeof req.body.default_share_img_local == "string"){
            if(req.body.default_share_img_local == "true"){
                req.body.default_share_img_local = true;
            } else{
                req.body.default_share_img_local = false;
            }
            console.log("API SETTING CHANGE: DEFAULT SHARE IMG LOCAL")
            // change default value (value in config field JSON)

            customConfig.shareimgloc = req.body.default_share_img_local;

        }
        if(typeof req.body.default_share_img_twitter == "string"){
            if(req.body.default_share_img_twitter == "true"){
                req.body.default_share_img_twitter = true;
            } else{
                req.body.default_share_img_twitter = false;
            }
            console.log("API SETTING CHANGE: DEFAULT SHARE IMAGE TWITTER")

            customConfig.shareimgtw = req.body.default_share_img_twitter;


        }
        customConfig = JSON.stringify(customConfig)
        var sql = "UPDATE users SET custom_configuration = ? WHERE twitter_id = ?";
        await Tellschn.sqlQuery(sql, [customConfig, req.session.userpayload.twitter_id]);
        req.session.userpayload.custom_configuration = customConfig;
        req.session.save(() => {
            res.json({"err": null, "status": "success"});
            res.end();
        })


    } else if(req.params.endpoint == "remove_notification_service"){
        if(req.body.id != undefined){
            try{
                let rows = await Tellschn.sqlQuery("DELETE FROM user_notification_services WHERE id = ? AND twitter_id = ?", [req.body.id, req.session.userpayload.twitter_id]);
                if(rows.affectedRows == 0){
                    res.json({"err": "SERVICE_NOT_FOUND"}).end();
                    return;
                }
                res.json({"err": null, "status": "success"}).end();
                return;
            } catch(e){
                throw e;
            }
        }
    } else if(req.params.endpoint == "add_email_notification"){
        if(Tellschn.validateEmail(req.body.email_address)){

            queue.create("send_notification_registration_mail", {
                "address": req.body.email_address,
                "userpayload": req.session.userpayload
            }).save();
            res.json({"err": null, "status": "success"}).end();
        } else{
            res.json({"err": "MALFORMED_EMAIL_ADDRESS", "status": "failed"}).end();

        }
    }
});


app.get("/:userpage", nocache, preProcessTellShowbox);
app.get("/:userpage/:tell", nocache, preProcessTellShowbox);


async function preProcessTellShowbox(req, res){
    if(appconf.debug) console.log(req.session);
    if(req.params.userpage == "cdn"){
        // Express static middleware used next() -> 404
        res.status(404).end("Not Found");
        return;
    } else if(req.params.tell != undefined && parseInt(req.params.tell) != NaN){
        let sqlRes = await Tellschn.sqlQuery(get_own_tells_sqlstmt, [null, req.params.tell, 0]);
        sqlRes = mysql_result_time_to_string(sqlRes, "timestamp")
        if(sqlRes[0] == undefined){
            usrlandHandler(req, res, null);
            return;
        }
        console.log("Giving Object: ", sqlRes[0])
        let templateFiller = {
            "tells": sqlRes
        };
        templateFiller = {...templateFiller, ...tellschnTemplate.exportText_modules(templateFiller)};

        usrlandHandler(req, res, mustache.render(templates.view_tells, templateFiller));
        return;

    } else{
        usrlandHandler(req, res, null);
        console.log("No Tell ID given")
    }
}

async function usrlandHandler(req, res, tell_showbox_html){
    console.log(tell_showbox_html);
    if(req.session.token == undefined){
        req.session.token = uuid();
    }


    if(req.session.userpayload !== undefined && req.params.userpage === req.session.userpayload.twitter_handle && req.session.own_twitter_id !== undefined){
        // show template for logged in 
        tellschnMetrics.webHit("logged_in_user")
        let has_access_to = await Tellschn.sqlQuery("SELECT users.twitter_id AS shared_twitter_id, users.twitter_handle AS shared_display_name, attachment_media.cdn_path AS profile_pic_cdn_link FROM users LEFT JOIN user_access_sharing ON user_access_sharing.from_user_id = users.twitter_id LEFT JOIN attachment_media ON attachment_media.media_uuid = users.profile_pic_uuid WHERE user_access_sharing.to_user_id = ?", req.session.own_twitter_id)


        let tells = await Tellschn.sqlQuery(get_own_tells_sqlstmt, [req.session.userpayload.twitter_id, null, 0])
        tells = mysql_result_time_to_string(tells, "timestamp")


        var custom_conf = JSON.parse(req.session.userpayload.custom_configuration);
        /*
        
        let allowed_account_results = await Tellschn.sqlQuery("SELECT users.twitter_id AS twitter_id, users.twitter_handle AS twitter_handle, users.profile_pic_original_link AS profile_image_url FROM users, user_access_sharing WHERE " +
            "user_access_sharing.to_user_id = users.twitter_id AND (user_access_sharing.from_user_id = ? OR users.twitter_id = ?)",
            [req.session.own_twitter_id, req.session.own_twitter_id]);
        */
        let templateFiller = {
            "profile_image_url": appconf.cdn_path + req.session.userpayload.profile_pic_cdn_link,
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
            "tells": tells,
            "edit_tools": true,
            "showcase": tell_showbox_html,
            "account_pool": has_access_to,
            "base_user": {
                "profile_image_url": appconf.cdn_path + req.session.own_userpayload.profile_pic_cdn_link,
                "display_name": req.session.own_userpayload.twitter_handle,
                "twitter_id": req.session.own_twitter_id
            }
        }
        templateFiller = {...templateFiller, ...tellschnTemplate.exportText_modules(templateFiller)};

        res.send(mustache.render(templates.get_tells, templateFiller, {"tell_list": templates.view_tells}));
        res.end();
        return;


    } else{
        // show template for telling a new tell
        tellschnMetrics.webHit("send_tell_page")
        let result = await Tellschn.sqlQuery("SELECT twitter_id, twitter_handle, profile_pic_original_link, profile_pic_small_link, custom_page_text FROM users WHERE twitter_handle = ?", req.params.userpage);
        if(result[0] == undefined){
            res.redirect("/");
            res.end();
            return;
        }

        let tells = await Tellschn.sqlQuery(get_public_answers, [result[0].twitter_id, 0]);
        tells = mysql_result_time_to_string(tells, "timestamp")
        let templateFiller = {
            "profile_image_url": result[0].profile_pic_original_link,
            "display_name": result[0].twitter_handle,
            "custom_page_text": result[0].custom_page_text,
            "base_url": appconf.base_url,
            "twitter_id": result[0].twitter_id,
            "token": req.session.token,
            "edit_tools": false,
            "tells": tells,
            "was_answered": true,
            "showcase": tell_showbox_html
        }
        templateFiller = {...templateFiller, ...tellschnTemplate.exportText_modules(templateFiller)};
        res.send(mustache.render(templates.send_tells, templateFiller, {"publicanswers": templates.view_tells}));
        res.end();


    }
}
