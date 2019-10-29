var block_input = false;
function send_tell (to_user_id, content, media, do_not_share, cb) {
    $.post("/api/send_tell?token="+token, {
        "for_user_id": to_user_id,
        "content": content,
        "image_uid": media,
        "do_not_share": do_not_share
    }, cb)
};

function reply_to_tell (to_tell_id, content, send_tweet, on_page, cb) {
    $.post("/api/give_answer?token="+token, {
        "for_tell_id": to_tell_id,
        "content": content, 
        "reply_config": JSON.stringify({
            "send_tweet": send_tweet,
            "show_on_page": on_page
        })
    }, cb)
}
function delete_tell (tell_id, cb) {
    $.post("/api/delete_tell?token=" + token, {
        "tell_id": tell_id
    }, cb)
}