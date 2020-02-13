var block_input = false;
var at_end = false;
var page = 1;
function send_tell (to_user_id, content, media, do_not_share, cb) {
    $.post("/api/send_tell?token="+token, {
        "for_user_id": to_user_id,
        "content": content,
        "media_attachment": media,
        "do_not_share": do_not_share
    }, cb)
};

function reply_to_tell (to_tell_id, content, send_tweet, on_page, share_image_twitter, share_image_page, cb) {
    $.post("/api/give_answer?token="+token, {
        "for_tell_id": to_tell_id,
        "content": content, 
        "reply_config": JSON.stringify({
            "send_tweet": send_tweet,
            "show_on_page": on_page,
            "share_image_twtter": share_image_twitter,
            "show_image_page": share_image_page
        })
    }, (result) => {
        if (result.error != null) cb(result);
        setConfigParameter({
            "default_share_twitter": send_tweet,
            "default_share_local": on_page,
            "default_share_img_twitter": share_image_twitter,
            "default_share_img_local": share_image_page
        }, cb)
    })
}

function delete_tell (tell_id, cb) {
    $.post("/api/delete_tell?token=" + token, {
        "tell_id": tell_id
    }, cb)
}
function edit_tell(tell_id, content, on_page, share_image_page, cb) {
    $.post("/api/edit_answer?token="+token, {
        "for_tell_id": tell_id,
        "content": content,
        "sharing_conf": JSON.stringify({
        "show_on_page": on_page,
        "show_image_page": share_image_page})
        
    }, function(response) {
            cb(response);
        })
}

function scrollHandler(apinode, add) {
    if (add == undefined) {add = ""};

    window.onscroll = function (ev) {
        if ((window.innerHeight+window.scrollY) > (document.body.offsetHeight - window.innerHeight/4)) {
            // nachladen
            if (!request_in_progress && ! at_end) {
                request_in_progress = true;
                $.get("/api/"+apinode+"?token=" + token + "&page=" + page + add, function(next_page) {
                    document.getElementById("tells").innerHTML += next_page;
                    if (next_page.indexOf("keine Tells") != -1) {
                        at_end = true;
                    }
                    request_in_progress = false;
                    page++;
                })
            }
        }
    }
}

function grantUserAccess(twitter_handle, cb) {
    $.post("/api/grant_user_access?token=" + token, {"twitter_handle": twitter_handle}, function(result) {
        console.log(result);
        
        cb(result);
    });
}

function removeUserAccess(twitter_handle, cb) {
    $.post("/api/remove_user_access?token=" + token, {"twitter_handle": twitter_handle}, function(result) {
        console.log(result);
        
        cb(result);
    });
}
function setConfigParameter(settings, cb) {

    $.post("/api/change_setting?token=" + token, settings, function(response) {
        console.log(response);
        cb(response);
        return;
    })
}