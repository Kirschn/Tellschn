<?php 
include("config.php");
if (!isset($_GET["q"]) || $_GET["q"] == "" || $_GET["q"] == "/") {
	die();
}
session_start();

//Connect databse
$link = mysqli_connect($dbServer,$dbUsername,$dbPassword,$dbName);
if(mysqli_connect_errno()){
	die("Failed to connect with MySQL");
}
if ($stmt = mysqli_prepare($link, "SELECT oauth_uid, username, description FROM users WHERE username=?")) {
	$q = substr($_GET["q"],1);
    $stmt->bind_param("s", $q);
    $stmt->execute();
    $stmt->bind_result($id, $username, $description);
    $stmt->fetch();
    $stmt->close();
    if (!isset($id)) {
    	header("Location: https://tell.kirschn.de");
    	die();
    }
    if ($id == "") {
    	header("Location: https://tell.kirschn.de");
    	die();
    }
}
if (!isset($_SESSION["sessionkey"]) || $_SESSION["sessionkey"] == "used" || $_SESSION["sessionkey"] == "") {
	$_SESSION["sessionkey"] = substr(md5(microtime()),rand(0,26),5);
}

?>

<!DOCTYPE html>
<html>
	<head>
	<meta charset="utf-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1">
	<title>Tellschn</title>
	<link rel="stylesheet" href="bootstrap.css">
	<script src="https://ajax.googleapis.com/ajax/libs/jquery/1.12.4/jquery.min.js"></script>
	<!-- Latest compiled and minified JavaScript -->
	<script src="https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/js/bootstrap.min.js" integrity="sha384-Tc5IQib027qvyjSMfHjOMaLkfuWVxZxUPnCJA7l2mCWNIpG9mGCD8wGNIcPD7Txa" crossorigin="anonymous"></script>
	<link href="https://fonts.googleapis.com/css?family=Sintony" rel="stylesheet">
	<style type="text/css">
		body {
			
			height: 100%;
			display: inline-block;
			font-size: 16px;
		}
		.elBackground {
			position: absolute;
			height: 100%;
			width: 100%;
			top: 0;
			left: 0;
			/* background: linear-gradient(rgb(200, 200, 200), white); */
//			background: #eee;
			z-index: -1;


		}
		.elHeadContainer {
			width: 100%;
			text-align: center;
			position: absolute;
			animation: fadein 2s;
			top: 4.5%;
			animation-fill-mode: forwards; 
			font-family: 'Sintony', sans-serif;
			font-weight:100;
			-webkit-font-smoothing:antialiased;
			color: #333;

		}
		.elHeadContainer h1 {
			font-size: 300%;
		}
		.inputElement {
			margin-left: 25%;
			margin-right: 25%;
			width: 50%;
			text-align: center;
			position: absolute;
			top: 35%;
			animation: fadeinContent 3s;
 		}
 		.inputElement textarea {
 		  resize: vertical; /* user can resize vertically, but width is fixed */
 		}
		@keyframes fadein {
		    from { opacity: 0; top: 2%;}

		    to   { opacity: 1; top: 17.5% - 50pt;}
		}
		@keyframes fadeinContent {
		    from { opacity: 0;}

		    to   { opacity: 1;}
		}
	</style>
	<script>
	function recalcRem() {
	document.getElementById("remaining").innerHTML = (9999 - parseInt($("#input").val().length));
	}
	</script>
	</head>
	<body>
	<div class="elBackground">&nbsp;</div>
	<div class="elHeadContainer"><h1><?php echo htmlspecialchars($username); ?></h1></div>
	<div class="inputElement">
		<div class="form-group">
		  <textarea class="form-control" rows="10" id="input" placeholder="<?php echo htmlspecialchars($description); ?>" oninput="recalcRem()"></textarea><br>
		  <span id="remaining">9999</span> Zeichen verbleibend<br><br>
            <input type="file" id="uploadFile" name="file" /><label for="uploadFile" id="uploadLabel">Anhang</label><br><br>
            <input type="checkbox" name="tweetable" id="tweetable"/><label for="tweetable"> Privat</label><br>
		  <button type="button" class="btn btn-primary" id="send" onclick="send()">Send</button>
		</div>
	</div>

	<div id="sendmodal" class="modal fade" role="dialog">
	  <div class="modal-dialog">

	    <!-- Modal content-->
	    <div class="modal-content">
	      <div class="modal-header">
	        <button type="button" class="close" data-dismiss="modal">&times;</button>
	        <h4 class="modal-title">Tell</h4>
	      </div>
	      <div class="modal-body">
	        <p id="modalbody">.</p>
	      </div>
	      <div class="modal-footer">
	        <button type="button" class="btn btn-default" data-dismiss="modal" onclick="location.reload()">Close</button>
	      </div>
	    </div>

	  </div>
	</div>
	<script>
        var sharepicLink = null;
		function send() {
			if (parseInt($("#input").val().length) <=9999) {
			$.ajax({
				type: "POST",
				url: "api.php",
				data: {
					foruid: <?php echo htmlspecialchars($id); ?>,
					content: $("textarea#input").val(),
					sessionkey: "<?php echo $_SESSION["sessionkey"]; ?>",
					tweetable: !($("#tweetable").is(":checked")),
                    image: sharepicLink
				}
			}).done(function(data) {
				document.getElementById("modalbody").innerHTML = data;
				$("#sendmodal").modal();
			});
		}
		}
		function uploadPicture() {
            var file_data = $('#uploadFile').prop('files')[0];
            var form_data = new FormData();
            form_data.append('file', file_data);
            $("#uploadLabel").html("Uploading...");
            $.ajax({
                url: 'https://sharepic.moe/upload.php', // point to server-side PHP script
                dataType: 'text',  // what to expect back from the PHP script, if anything
                cache: false,
                contentType: false,
                processData: false,
                data: form_data,
                type: 'post',
                success: function(php_script_response){
                    $("#uploadLabel").html("Upload done!");
                    console.log(php_script_response);
                    sharepicLink = "https://sharepic.moe/" + php_script_response + "/raw";
                }
            });

        }
        $("#uploadFile").on("change", uploadPicture);
		</script>
	</body>
</html>
