// Remove copy button if copy to clipboard method is not allowed
// Note: Button detection is broken before Chrome 48
var copyBtn = document.querySelector('.copyBtn');

if(copyBtn !== null){

    if(!document.queryCommandSupported('copy')){
        copyBtn.parentNode.removeChild(copyBtn);
    }
    ;

    // When .copyBtn is clicked, copy .copyToClip content to user's clipboard
    copyBtn.addEventListener('click', function(event){
        /* Get the text field */
        var copyText = document.getElementById("url");

        /* Select the text field */
        copyText.select();

        // Now that we've selected the text, execute the copy command  
        document.execCommand('copy');

        // add hint, that url got copied
        document.querySelector(".copyBtn").innerHTML = "Kopiert!";

        // Remove the selections
        window.getSelection().removeAllRanges();
    });

}