function twoDigits(d) {
    if (0 <= d && d < 10) return "0" + d.toString();
    if (-10 < d && d < 0) return "-0" + (-1 * d).toString();
    return d.toString();
}

Date.prototype.toMysqlFormat = function () {
    return this.getUTCFullYear() + "-" + twoDigits(1 + this.getUTCMonth()) + "-" + twoDigits(this.getUTCDate()) + " " + twoDigits(this.getHours()) + ":" + twoDigits(this.getUTCMinutes()) + ":" + twoDigits(this.getUTCSeconds());
};

const tellschn = require("./tellschn_classes.js");
const Tellschn = new tellschn.Tellschn();
const templatingEngine = new tellschn.tellschnTemplate(Tellschn.appconf.lang);
const tellschnMailer = new tellschn.tellschnMailer(Tellschn.appconf.lang);
var fs = require("fs");
var FileType = require('file-type');
var uuid = require("uuid/v4");
var util = require("util");
var ffmpeg = require('fluent-ffmpeg');
var Jimp = require('jimp');
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
var get_public_tweet = "SELECT `answers`.id AS answer_id, `answers`.`content` AS answer_content, `answers`.tweet_id AS answer_tweet_id, " +
    "attachment_media.cdn_path AS cdn_path, answers.timestamp AS timestamp, answers.was_edited AS answer_was_edited, " +
    "IF(attachment_media.cdn_path IS NULL, FALSE, TRUE) AS has_media, attachment_media.is_mp4 AS is_mp4, " +
    " attachment_media.size AS filesize, tells.content AS tell_content, users.oauth_token AS oauth_token, users.oauth_secret AS oauth_secret, " +
    " users.twitter_handle AS twitter_handle, users.twitter_id AS twitter_id, users.profile_pic_original_link AS profile_pic_original_link " +
    " FROM answers LEFT JOIN `tells` ON answers.for_tell_id = tells.id " +
    "LEFT JOIN `attachment_media` ON attachment_media.media_uuid = tells.media_attachment " +
    "LEFT JOIN `users` ON users.twitter_id = tells.for_user_id " +
    "WHERE tells.id = ?";

queue.process("process_uploaded_file", async function (job, done) {
    util.log("Starting to process new File " + job.data.tempFileLocation);
    (async () => {
        async function addFileToDatabase(tempLocation, fileext) {
            util.log("Adding File " + tempLocation + " to Database...");
            var mediaUUID = uuid();
            var size = fs.statSync(tempLocation).size;

            fs.renameSync(tempLocation, "./cdn/" + mediaUUID + "." + fileext);
            util.log("Renamed File to " + mediaUUID + " ...");

            var isMP4 = false;
            if (fileext == "mp4") { isMP4 = true; }
            await Tellschn.sqlQuery("INSERT INTO attachment_media (media_uuid, is_mp4, size, cdn_path) VALUES (?)",
                [[mediaUUID, isMP4, size, mediaUUID + "." + fileext]])
            util.log("Added File to DB " + mediaUUID);

            done(null, mediaUUID);
            return;

        }

        var fileinfo = await FileType.fromFile(job.data.tempFileLocation);
        if (fileinfo == undefined) {
            util.log("Unsupported Type by library");
            fs.unlinkSync(job.data.tempFileLocation);

            done(new Error("Unsupported File Type"));
            return;
        }
        if (fileinfo.mime.indexOf("video") != -1) {
            util.log("Detected Video")
            if (fileinfo.mime == "video/mp4") {
                // no further processing needed
                util.log("MP4")
                addFileToDatabase(job.data.tempFileLocation, "mp4");
            } else {
                util.log("Spawning hbjs")
                // Converting Videos! Yay!
                ffmpeg(job.data.tempFileLocation).toFormat("mp4")
                    .on('end', function () {
                        util.log('Finished processing');
                        addFileToDatabase(job.data.tempFileLocation + ".mp4", "mp4");
                        return;
                    })
                    .on('progress', function (progress) {
                        util.log('Processing: ' + progress.percent + '% done');
                        job.progress(progress.percent, 100);
                    })
                    .on('error', function (err, stdout, stderr) {
                        util.log('Cannot process video: ' + err.message);
                        done(new Error(err.message));
                        return;
                    })
                    .save(job.data.tempFileLocation + ".mp4");

            }
        } else if (fileinfo.mime.indexOf("image") != -1) {
            util.log("Detected Image")
            if (fileinfo.mime == "image/png") {
                util.log("Detected PNG")

                addFileToDatabase(job.data.tempFileLocation, "png");
                return;
            } else if (fileinfo.mime == "image/jpg" || fileinfo.mime == "image/jpeg") {
                util.log("Detected JPEG")

                addFileToDatabase(job.data.tempFileLocation, "jpg");
                return;
            } else if (fileinfo.mime == "image/gif") {
                util.log("Detected GIF")

                addFileToDatabase(job.data.tempFileLocation, "gif");
                return;
            }
            util.log("Converting with JIMP")

            // Convert Image to accepted format
            Jimp.read(job.data.tempFileLocation, (err, file) => {
                if (err) done(err);
                util.log("Read Image...")

                file
                    .write(job.data.tempFileLocation + ".jpg", function (err) {
                        if (err) throw err;
                        addFileToDatabase(job.data.tempFileLocation + ".jpg", "jpg");
                    }); // save
            });
        } else {
            util.log("Unsupported File Type, deleting")

            fs.unlinkSync(job.data.tempFileLocation);
            done(new Error("Unsupported File Type"));

            return;
        }
        //=> {ext: 'mp4', mime: 'image/mp4'}
    }
    )();
});
queue.process("send_tweet", async function (job, done) {
    job.log("Send Tweet: Task Started");
    let result = await Tellschn.sqlQuery(get_public_tweet, job.data.for_tell_id);
    job.log("Send Tweet: SQL Result Successful. Generating Image");
    if (result[0].answer_content.length > 230) {
        result[0].answer_content = result[0].answer_content.substr(0, 230) + "[...]";
    }
    if (result[0].tell_content.length > 230) {
        result[0].tell_content = result[0].tell_content.substr(0, 230) + "[...]";
    }
    var html = mustache.render(templates.render_tell, {
        "profile_image_url": result[0].profile_pic_original_link,
        "display_name": result[0].twitter_handle,
        "twitter_id": result[0].twitter_id,
        "timestamp": dateFormat(result[0].timestamp, "hh:MM:ss dd.mm.yyyy"),
        "has_video": result[0].is_mp4,
        "answer_content": result[0].answer_content,
        "tell_content": result[0].tell_content,
        "base_url": appconf.base_url
    })
    job.log("HTML Rendered. Starting puppeteer");
    const browser = await puppeteer.launch({
        args: ['--no-sandbox'],
        headless: true
    });

    var page = await browser.newPage();
    job.log("Navigating to HTML");
    var randomNumber = Math.floor(Math.random() * 2000);
    fs.writeFileSync("webview/assets/temp_" + randomNumber + ".html", html, "utf8");
    await page.goto(appconf["local_path"] + "webview/assets/temp_" + randomNumber + ".html", {
        waitUntil: 'networkidle0'
    });
    var base64_tell_img = await page.screenshot({ encoding: 'base64' });

    await browser.close();
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
            async function (error, data, response) {
                if (error) {
                    console.log(error);
                } else {
                    if (data.id_str !== undefined) {
                        await Tellschn.sqlQuery("UPDATE answers SET tweet_id = ? where id = ?", [data.id_str, result[0].answer_id]);

                        done();

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


});

queue.process("send_instant_msg_notification", async (job, done) => {
    util.log("Got Job for delivering Instant Message Jobs");
    try {
        let rows = await Tellschn.sqlQuery("SELECT platform, address FROM user_notification_services WHERE twitter_id = ? AND address IS NOT NULL AND validation_token IS NULL", job.data.userpayload.twitter_id)
        rows.forEach(currentRow => {
            switch (currentRow.platform) {
                case "telegram":
                    job.data.chat_id = currentRow.address;
                    queue.create("send_telegram_notification_message", job.data).save(done);
                    break;
                case "email":
                    let data = {
                        "title": "Send Notification Mail to " + currentRow.address,
                        "to": currentRow.address,
                        "subject": templatingEngine.getTextModule("mail_subject_new_tell", job.data),
                        "text": templatingEngine.getTextModule("mail_text_new_tell", job.data)
                           
                    }
                    queue.create("send_email", data).save(done);
                    
                default:
                    done(new Error("INVALID_PLATFORM"));
                    break;
            }
        })
        done()
    } catch (e) {
        throw e;
    }
});



queue.process("send_email", async (job, done) => {
    await tellschnMailer.sendMail(job.data.to, job.data.subject, job.data.text);
    done();
})

queue.process("send_notification_registration_mail", async (job, done) => {
    await tellschnMailer.sendValidationMail(job.data.address, job.data.userpayload);
    done();
})

queue.process("send_notification_registration_success_mail", async (job, done) => {
    await tellschnMailer.sendRegistrationNotificationSuccessMail(job.data.address, job.data.userpayload);
    done();
})
    


