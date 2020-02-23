#!/usr/bin/env node
try {
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
        .option("--wipe-db", "Wipes Database before importing")
        .action(async () => {
            if (program.commands[0].wipeDb) {
                util.log("This will wipe the database contents. Sleeping 5 Seconds.");
                await Tellschn.sleep(5000);
                await Tellschn.sqlQuery("DELETE FROM users;");
                await Tellschn.sqlQuery("DELETE FROM tells;")

                await Tellschn.sqlQuery("DELETE FROM attachment_media;")
                await Tellschn.sqlQuery("DELETE FROM user_access_sharing;")

                await Tellschn.sqlQuery("DELETE FROM user_notification_services;")
                await Tellschn.sqlQuery("DELETE FROM answers;")
            }
            let sqlConf = {
                "host": program.commands[0].sourceDbHost,
                "user": program.commands[0].sourceDbUser,
                "password": program.commands[0].sourceDbPassword,
                "database": program.commands[0].sourceDbName
            }
            Tellschn.dbg(sqlConf)

            let sqlConnection = mysql.createConnection(sqlConf);
            async function sqlQuery(query, data) {
                return new Promise((resolve, reject) => {
                    let sqlQueryObejct = sqlConnection.query(query, data, function (error, result) {

                        if (error) {
                            reject(error);
                            return
                        } else {
                            resolve(result);
                        }
                    })
                    if (Tellschn.appconf.debug) {
                        util.log(sqlQueryObejct.sql);
                    }
                })
            }
            await Tellschn.sleep(10000);
            let rows_tells = await sqlQuery("SELECT * FROM tells");
            let rows_images = await sqlQuery("SELECT * FROM images");
            let rows_users = await sqlQuery("SELECT * FROM users");
            util.log("Got " + rows_tells.length + " tells", rows_tells.length);
            util.log("Got %s images", rows_images.length);
            util.log("Got %s users", rows_users.length);

            util.log("Starting to migrate all users");
            let atUser = 0;
            console.time("user_migration");
            rows_users.forEach(async (currentUser) => {
                await Tellschn.sleep(1000);
                atUser++;
                if (atUser / 50 == Math.floor(atUser / 50)) {
                    util.log("At User " + atUser);
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
                await Tellschn.sqlQuery("INSERT INTO users (twitter_id, twitter_handle, joined, profile_pic_original_link, profile_pic_small_link, oauth_token, oauth_secret, custom_configuration) VALUES (?)", [[
                    newData.twitter_id,
                    newData.twitter_handle,
                    newData.joined,
                    newData.profile_pic_original_link,
                    newData.profile_pic_small_link,
                    newData.oauth_token,
                    newData.oauth_secret,
                    JSON.stringify({
                        "sharetw": true,
                        "shareloc": true,
                        "shareimgtw": true,
                        "shareimgloc": true
                    })
                ]])
                if (currentUser.telegram_chat_id != null) {
                    // Found Telegram Chat ID
                    await Tellschn.sqlQuery("INSERT INTO user_notification_services (twitter_id, platform, address, recipient_name) VALUES (?)", [[
                        newData.twitter_id,
                        "telegram",
                        currentUser.telegram_chat_id,
                        newData.twitter_handle
                    ]])
                }
            })
            console.timeEnd("user_migration");
            let atTell = 0;
            console.time("tell_migration");
            rows_tells.forEach(async currentTell => {
                atTell++;
                if (atTell / 50 == Math.floor(atTell / 50)) {
                    util.log("At Tell " + atUser);
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
                        console.log(image_data);
                        image_uuid = image_data.uniqid;
                        let splitURL = image_data.imageurl.split("/");
                        let fileName = splitURL[splitURL.length -1];
                        Tellschn.dbg("File name " + splitURL)
                        await Tellschn.sqlQuery("INSERT INTO attachment_media (media_uuid, is_mp4, timestamp, cdn_path) VALUES (?)", [[

                            image_data.uniqid,
                            image_data.video,
                            image_data.timestamp,
                            fileName

                        ]])

                    }
                };
                let insertQuery = await Tellschn.sqlQuery("INSERT INTO tells (for_user_id, timestamp, deleted, media_attachment, content, do_not_share) VALUES (?)", [[
                    currentTell.for_uid,
                    currentTell.timestamp,
                    currentTell.deleted,
                    image_uuid,
                    currentTell.content,
                    (currentTell.tweetable == 1) ? 0 : 1
                ]]).catch((e) => {
                    throw e;
                })
                if (currentTell.reply != null) {
                    //found reply
                    await Tellschn.sqlQuery("INSERT INTO answers (for_tell_id, timestamp, content, show_public) VALUES (?)", [[
                        insertQuery.insertId,
                        currentTell.reply_timestamp,
                        currentTell.reply,
                        true
                    ]])
                }


            })
            console.timeEnd("tell_migration")

        });
    program.command("media-database-calculate-size")
        .description("Will add all unknown file sizes to the media database")
        .option("-a", "--all", "Recalculate the size of all media in the database")
        .action(async () => {
            let sql = "SELECT * FROM attachment_media WHERE size = 0 OR size IS NULL";
            if (program.commands[0].all) {
                sql = "SELECT * FROM attachment_media"
            }
            try {
            let media_rows = await Tellschn.sqlQuery(sql);
            util.log("Found " + media_rows.length + " Images");
            
            media_rows.forEach(async currentFile => {
                let size = fs.statSync("cdn/" + currentFile.cdn_path)["size"];
                await Tellschn.sqlQuery("UPDATE attachment_media SET size = ? WHERE id = ?", [size, currentFile.id]);
            })
            util.log("Done");

            } catch (e) {
                throw e;
            }
        })
    program.command("stats_media")
        .description("Get Stats about the Database")
        .option("-m", "media_size", "Returns the total size of the media database, read from MySQL. To ensure the accuarcy, use media-database-calculate-size first.")
        .action(async () => {
            Tellschn.appconf.debug = false;
            let size = await Tellschn.sqlQuery("SELECT SUM(size) AS size FROM attachment_media");
            console.log(size[0]["size"]);
            process.exit(0);
        });
    program.command("downloadMedia <url>")
    .description("Download a File and add it to the Media Database")
    .action(async (url) => {
        const tellschnmedia = new tellschnModule.tellschnMedia();
        console.log(await tellschnmedia.downloadMediaToDatabase(url));
    })
    program.parse(process.argv);
} catch (e) {
    throw e;
}