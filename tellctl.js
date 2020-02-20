#!/usr/bin/env node

const program = require('commander');
const tellschnModule = require("./tellschn_classes.js");
const Tellschn = new tellschnModule.Tellschn();
const mysql = require("mysql");
const util = require("util");
const fs = require("fs");

program
    .command("v1migrate")
    .description("Migrate old TellschnV1 Database to the new format. Expects the Picdrop table to be in the database as 'images'. Please move all files from the picdrop instance to cdn/")
    .requiredOption("--source-db-name <dbname>", "Name of the source database for migrations")
        .requiredOption("--source-db-host <dbhost>", "Host of the source database for migrations")
        .requiredOption("--source-db-user <dbuser>", "User of the source database for migrations")
        .requiredOption("--source-db-password <dbpasswsord>", "Password of the source database for migrations")
    .action(() => {
        let sqlConnection = mysql.createConnection({
            "host": programm.sourceDbName,
            "user": programm.sourceDbUser,
            "password": programm.sourceDbPassword,
            "database": programm.sourceDbName
        });
        let rows_tells = sqlConnection.query("SELECT * FROM tells");
        let rows_images = sqlConnection.query("SELECT * FROM images");
        let rows_users = sqlConnection.query("SELECT * FROM users");
        util.log("Got %s tells", rows_tells.length);
        util.log("Got %s images", rows_images.length);
        util.log("Got %s users", rows_users.length);

        util.log("Starting to migrate all users");
        let atUser = 0;
        console.time("user_migration");
        rows_users.forEach((currentUser) => {
            atUser++;
            if (atUser/50 == Math.floor(atUser/50)) {
                util.log("At User " +atUser);
            }
            let newData = {
                "twitter_id": currentUser.oauth_uid,
                "twitter_handle": currentUser.username,
                "joined": currentUser.created,
                "profile_pic_original_link": currentUser.picture,
                "profile_pic_small_link": currentUser.picture,
                "oauth_token": currentUser.oauth_token,
                "oauth_secret": currentUser.oauth_secret
            }
            let query = await Tellschn.sqlQuery("INSERT INTO users (twitter_id, twitter_handle, oined, profile_pic_original_link, profile_pic_small_link, oauth_token, oauth_secret) VALUES ?", [
                newData.twitter_id,
                newData.twitter_handle,
                newData.joined,
                newData.profile_pic_original_link,
                newData.profile_pic_small_link,
                newData.oauth_token,
                newData.oauth_secret
            ])
            if (currentUser.telegram_chat_id != null) {
                // Found Telegram Chat ID
                await Tellschn.sqlQuery("INSERT INTO user_notification_services (twitter_id, platform, address, recipient_name) VALUES ?", [
                    newData.twitter_id,
                    "telegram",
                    currentUser.telegram_chat_id,
                    newData.twitter_handle
                ])
            }
        })
        console.timeEnd("user_migration");
        let atTell = 0;
        console.time("tell_migration");
        rows_tells.forEach(currentTell => {
            atTell++;
            if (atTell/50 == Math.floor(atTell/50)) {
                util.log("At User " +atUser);
            }
            let image_uuid = null;
            if (currentTell.image != null && currentTell.image != "") {
                //tell with image
                let tell_image_uid = currentTell.image.replace("https://sharepic.moe/", "").replace("/raw", "");
                let image_data = null;
                rows_images.forEach(currentImage => {
                    if (currentImage.uniqid == tell_image_uid) {
                        // found it
                        image_data = currentImage;
                    }
                })
                if (image_data != null) {
                    image_uuid = image_data.uniqid;
                    let splitURL = image_data.imageurl.split("/");
                    let fileName = splitURL[splitURL.length];
                    let size = fs.statSync("cdn/"+fileName)["size"];
                    await Tellschn.sqlQuery("INSERT INTO attachment_media (media_uuid, is_mp4, size, timestamp, cdn_path) VALUES ?" [
                        image_data.uniqid,
                        image_data.video,
                        size,
                        image_data.timestamp,
                        fileName
                    ])
                    
                }
                let insertQuery = await Tellschn.sqlQuery("INSERT INTO tells (for_user_id, timestamp, deleted, media_attachment, content, do_not_share) VALUES ?", [
                    currentTell.for_uid,
                    currentTell.timestamp,
                    currentTell.deleted,
                    image_uuid,
                    currentTell.content,
                    (currentTell.tweetable == 1) ? 0 : 1
                ])
                if (currentTell.reply != null) {
                    //found reply
                    await Tellschn.sqlQuery("INSERT INTO answers (for_tell_id, timestamp, content, show_public) VALUES ?", [
                        insertQuery.insertId,
                        currentTell.reply_timestamp, 
                        currentTell.content,
                        true
                    ])
                }
            }

        })
        console.timeEnd("tell_migration")

    });



program.parse(process.argv);