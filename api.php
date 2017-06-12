<?php
include("config.php");
if (isset($_POST["content"]) && isset($_POST["sessionkey"])) {
	session_start();
	if ($_POST["sessionkey"] == $_SESSION["sessionkey"] && $_SESSION["sessionkey"] !== "used") {
		//$_SESSION["sessionkey"] = "used";

		//Connect databse
		$link = mysqli_connect($dbServer,$dbUsername,$dbPassword,$dbName);
		if(mysqli_connect_errno()){
			die("Failed to connect with MySQL");
		}
		$tweetable = 0;
		if ($_POST["tweetable"] == "true") {
			$tweetable = 1;
		}
        if ($_POST["image"] == "") {$_POST["image"] = null;}
		if (strpos($_POST["image"], "https://sharepic.moe/") == 0 && strpos($_POST["image"], "/raw") !== false || $_POST["image"] == null) {

        } else {
		    echo "Nope.";
		    die();
		    //manipulated request!

        }
		if ($stmt = mysqli_prepare($link, "INSERT INTO tells (for_uid, content, tweetable, image) VALUES (?, ?, ?, ?)")) {
		    $stmt->bind_param("isis", $_POST["foruid"], substr($_POST["content"],0,9000), $tweetable, $_POST["image"]);
		    $stmt->execute();
//		    echo var_dump($stmt);
		    $stmt->close();
            if ($stmt = mysqli_prepare($link, "SELECT username FROM users WHERE oauth_uid = ?")) {
                $stmt->bind_param("i", $_POST["foruid"]);
                $stmt->execute();
                $stmt->bind_result($username);
                $stmt->fetch();
                $stmt->close();
                include_once('codebird.php');
                \Codebird\Codebird::setConsumerKey(CONSUMER_KEY, CONSUMER_SECRET);
                $cb = \Codebird\Codebird::getInstance();
                $cb->setToken($updateToken, $updateSecret);
                $cb->statuses_update(array('status' => "@" . $username . " Du hast eine neue Nachricht https://tell.kirschn.de #Tellschn".rand(0, 999)));
            }



		    echo 'Gesendet!';


		}
	} else {
		echo '{"error": true, "reason": "fuck you"}';
		die();
	}
} elseif (isset($_GET["tweetout"]) && isset($_GET["tweetouttoken"]) && isset($_POST["tweettext"])) {
	session_start();
	include_once("config.php");
	if ($_GET["tweetouttoken"] == $_SESSION["tweetouttoken"] && $_SESSION["tweetouttoken"] !== "used") {
		$screen_name 		= $_SESSION['request_vars']['screen_name'];
		$twitter_id			= $_SESSION['request_vars']['user_id'];
		$oauth_token 		= $_SESSION['request_vars']['oauth_token'];
		$oauth_token_secret = $_SESSION['request_vars']['oauth_token_secret'];
		//$_SESSION["tweetouttoken"] = "used";
		//Connect databse
		$link = mysqli_connect($dbServer,$dbUsername,$dbPassword,$dbName);
		if(mysqli_connect_errno()){
			die("Failed to connect with MySQL");
		}
		if ($stmt = mysqli_prepare($link, "SELECT content, image FROM tells WHERE id = ? AND for_uid = ?")) {
			if(isset($_SESSION['status']) && $_SESSION['status'] == 'verified')
			{
				$screen_name 		= $_SESSION['request_vars']['screen_name'];
				$twitter_id			= $_SESSION['request_vars']['user_id'];
				$oauth_token 		= $_SESSION['request_vars']['oauth_token'];
				$oauth_token_secret = $_SESSION['request_vars']['oauth_token_secret'];
			$twout = $_GET["tweetout"];
		    $stmt->bind_param("ii", $twout, $twitter_id);
		    $stmt->execute();
		    $stmt->bind_result($text, $image);
		    $stmt->fetch();
		    $stmt->close();
		    if ($image == "") {
		        $image = null;
            }
		    $im = imagecreatetruecolor(600, 400);
		    $black = imagecolorallocate($im, 238, 238, 238);
		    $grey = imagecolorallocate($im, 128, 128, 128);
		    $white = imagecolorallocate($im, 0, 0, 0);
		    imagefilledrectangle($im, 0, 0, 599, 399, $white);
		    $font = '/var/www/tellschn/sintony.ttf';
		    imagettftext($im, 20, 0, 30, 40, $black, $font, wordwrap($text, 35, "\n"));
		    imagepng($im, "/var/tellschnimg/".$twout.".png");
		    if ($stmt = mysqli_prepare($link, "SELECT oauth_token, oauth_secret, username FROM users WHERE oauth_uid = ?")) {
		    		$twout = $_GET["tweetout"];
		    	    $stmt->bind_param("i", $twitter_id);
		    	    $stmt->execute();
		    	    $stmt->bind_result($token, $token_secret, $username);
		    	    $stmt->fetch();
		    	    $stmt->close();
		    	include_once('codebird.php');
		        \Codebird\Codebird::setConsumerKey(CONSUMER_KEY, CONSUMER_SECRET);
		        $cb = \Codebird\Codebird::getInstance();
		        $cb->setToken($token, $token_secret);
		        $status = substr($_POST["tweettext"],0,140);
		        $filename = "/var/tellschnimg/".$twout.".png";

		        $media_files = [$filename]; // TODO: Add image included in tell here
		        $media_ids = [];
				foreach ($media_files as $file) {
				  $reply = $cb->media_upload([
				    'media' => $file
				  ]);
				  $media_ids[] = $reply->media_id_string;
				}
				$media_ids = implode(',', $media_ids);
				$reply = $cb->statuses_update([
				  'status' => $status,
				  'media_ids' => $media_ids
				]);

		        echo "ok";
		    imagedestroy($im);
		}

		    }
		}
		$link->close();
	}
}
