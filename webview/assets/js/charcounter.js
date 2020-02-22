function checkTextAreaMaxLength(textBox){
    var maxLength = parseInt(textBox.dataset.length);

    var rest = maxLength - textBox.value.length;

    document.querySelector(".counter").innerHTML =
        rest;

    if(rest === maxLength || rest < 0){
        disableSendButton()
    } else{
        activateSendButton()
    }

    return true;
}

function disableSendButton(){
    document.querySelector(".send").disabled = true
}

function activateSendButton(){
    document.querySelector(".send").disabled = false
}


