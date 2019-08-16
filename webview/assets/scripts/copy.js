// Remove copy button if copy to clipboard method is not allowed
// Note: Button detection is broken before Chrome 48
var copyBtn = document.querySelector('.copyBtn'); 

if (copyBtn !== null) {
 
	if( !document.queryCommandSupported('copy') ) {
		copyBtn.parentNode.removeChild(copyBtn);
	};
	
	// When .copyBtn is clicked, copy .copyToClip content to user's clipboard
	copyBtn.addEventListener('click', function(event) {  
		// Select the text  
		var copyContent = document.querySelector('.copyurl');  
		var range = document.createRange();  
		range.selectNode(copyContent);  
		window.getSelection().addRange(range);  
	
		// Now that we've selected the text, execute the copy command  
		document.execCommand('copy');  
		
		// add hint, that url got copied
		document.querySelector(".copyBtn").innerHTML = "URL kopiert!";
	
		// Remove the selections
		window.getSelection().removeAllRanges();  
	});
	
}