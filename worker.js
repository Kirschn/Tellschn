function twoDigits(d) {
    if(0 <= d && d < 10) return "0" + d.toString();
    if(-10 < d && d < 0) return "-0" + (-1*d).toString();
    return d.toString();
}
 
Date.prototype.toMysqlFormat = function() {
    return this.getUTCFullYear() + "-" + twoDigits(1 + this.getUTCMonth()) + "-" + twoDigits(this.getUTCDate()) + " " + twoDigits(this.getHours()) + ":" + twoDigits(this.getUTCMinutes()) + ":" + twoDigits(this.getUTCSeconds());
};
var fs = require("fs");
var util = require("util");
var accessconf = JSON.parse(fs.readFileSync("access-config.json", "utf8"));
var appconf = JSON.parse(fs.readFileSync("app-config.json", "utf8"));
var kue = require('kue')
, queue = kue.createQueue();
var Twitter = require("node-twitter-api");
var twitter = new Twitter({
    consumerKey: accessconf.twitter["consumer_key"],
    consumerSecret: accessconf.twitter["consumer_secret"],
    callback: accessconf.twitter["redirection_url"]
});
var dateFormat = require("dateformat");
accessconf.mysql.encoding = 'utf8';
accessconf.mysql.charset = 'utf8mb4';
var mysql      = require('mysql');
var connection = mysql.createConnection(accessconf.mysql);
const session = require('express-session');
const redis = require('redis');
const redisClient = redis.createClient();

const redisStore = require('connect-redis')(session);
redisClient.on('error', (err) => {
    console.log('Redis error: ', err);
  });
var mustache = require("mustache");
var puppeteer = require("puppeteer");
var templates = {
    "landing": fs.readFileSync("./webview/landing.html", "utf8"),
    "send_tells": fs.readFileSync("./webview/send_tells.html", "utf8"),
    "get_tells": fs.readFileSync("./webview/get_tells.html", "utf8"),
    "view_tells": fs.readFileSync("./webview/assets/view_tells.html", "utf8"),
    "render_tell": fs.readFileSync("./webview/assets/image_render_tell_template.html", "utf8"),
    "global_stylesheet": fs.readFileSync("./webview/assets/stylesheets/stylesheet.css", "utf8")
}
var get_public_tweet = "SELECT `answers`.id AS answer_id, `answers`.`content` AS answer_content, `answers`.tweet_id AS answer_tweet_id, "+
"attachment_media.cdn_path AS cdn_path, answers.timestamp AS timestamp, answers.was_edited AS answer_was_edited, "+
"IF(attachment_media.cdn_path IS NULL, FALSE, TRUE) AS has_media, attachment_media.is_mp4 AS is_mp4, "+
" attachment_media.size AS filesize, tells.content AS tell_content, users.oauth_token AS oauth_token, users.oauth_secret AS oauth_secret, "+ 
" users.twitter_handle AS twitter_handle, users.twitter_id AS twitter_id, users.profile_pic_original_link AS profile_pic_original_link " +
" FROM answers LEFT JOIN `tells` ON answers.for_tell_id = tells.id "+
"LEFT JOIN `attachment_media` ON attachment_media.media_uuid = tells.media_attachment "+
"LEFT JOIN `users` ON users.twitter_id = tells.for_user_id "+
"WHERE tells.id = ?";

queue.process("ffmpeg-file", function(job, done) {
    
});
queue.process("send_tweet", async function(job, done) {
    job.log("Send Tweet: Task Started");
    connection.query(get_public_tweet, job.data.for_tell_id, async function(err, result) {
        
        if (err) throw err;
        job.log("Send Tweet: SQL Result Successful. Generating Image");
        var html = mustache.render(templates.render_tell, {
            "profile_image_url": result[0].profile_pic_original_link,
            "display_name": result[0].twitter_handle,
            "twitter_id": result[0].twitter_id,
            "timestamp": dateFormat(result[0].timestamp, "hh:MM:ss dd.mm.yyyy"),
            "has_video": result[0].is_mp4,
            "answer_content": result[0].answer_content,
            "tell_content": result[0].tell_content
        })
        job.log("HTML Rendered. Starting puppeteer");
        const browser = await puppeteer.launch({
            args: ['--no-sandbox'],
            headless: false
        });
    
        var page = await browser.newPage();
        job.log("Navigating to HTML");
        var randomNumber = Math.floor(Math.random()*2000);
        fs.writeFileSync("webview/assets/temp_" + randomNumber + ".html", html, "utf8");
        await page.goto(appconf["local_path"] + "webview/assets/temp_" + randomNumber + ".html", {
            waitUntil: 'networkidle0'
        });
        var base64_tell_img = await page.screenshot({encoding: 'base64'});

        //await browser.close();
        fs.unlinkSync("webview/assets/temp_" + randomNumber + ".html");
        function uploadTweetImage(uploadData, cb) {
            twitter.uploadMedia(uploadData, result[0].oauth_token, result[0].oauth_secret, function (error, media_1_data, media_1_response) {
                console.log(media_1_data);
                cb(media_1_data.media_id_string)
                
            });
        }
        function tweetOut(media) {
            
            twitter.statuses("update", {
                status: appconf.base_url + "/" + result[0].twitter_handle + "/" + result[0].answer_id,
                "media_ids": media
            },
            result[0].oauth_token,
            result[0].oauth_secret,
            function(error, data, response) {
                if (error) {
                    console.log(error);
                } else {
                    if (data.id_str !== undefined) {
                        connection.query("UPDATE answers SET tweet_id = ? where id = ?", [data.id_str, result[0].answer_id], function (err) {
                            if (err) throw err;
                            done();
                        })
                    }
                }
            }
        );
        }
        uploadTweetImage({
            media: base64_tell_img,
            isBase64: true
        }, function (textImgID) {
            if (result[0].has_media && !result[0].is_mp4 && job.data.share_image_twitter) {
                console.log("Has another Image Attached, uploading...");
                uploadTweetImage({
                    media: fs.readFileSync("./cdn/" + result[0].cdn_path),
                    isBase64: false
                }, function (appendedMediaID) {
                    tweetOut(textImgID + "," + appendedMediaID);
                })
            } else {
                tweetOut(textImgID)
            }
        })
        
    })
});