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
//			background: #eee;
		}
		.elBackground {
			position: absolute;
			height: 100%;
			width: 100%;
			top: 0;
			left: 0;
			/* background: linear-gradient(rgb(200, 200, 200), white); */
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
			top: 39%;
			animation: fadeinContent 3s;
			word-wrap: break-word;

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
        .imgContainer {
            width: 100pt;
            height: 100pt;
        }
	</style>

	</head>
	<body onload="onload()">
	<div class="elBackground">&nbsp;</div>
	<div class="elHeadContainer"><h1>Tellschn</h1><br><br>Der schnelle Weg eine anonyme Meinung zu bekommen</div>
	<div class="inputElement">
		<?php
			include "config.php";
			session_start();
			if (!isset($_SESSION["tweetouttoken"]) || $_SESSION["tweetouttoken"] == "used" || $_SESSION["tweetouttoken"] == "") {
				$_SESSION["tweetouttoken"] = substr(md5(microtime()),rand(0,26),5);
			}
			$tweetouttoken = $_SESSION["tweetouttoken"];
			if(isset($_SESSION['status']) && $_SESSION['status'] == 'verified')
			{
				//Retrive variables
				$screen_name 		= $_SESSION['request_vars']['screen_name'];
				$twitter_id			= $_SESSION['request_vars']['user_id'];
				$oauth_token 		= $_SESSION['request_vars']['oauth_token'];
				$oauth_token_secret = $_SESSION['request_vars']['oauth_token_secret'];
				echo 'Hallo <strong>'.$screen_name.'</strong>! Hier ist deine URL:<br><br>';
				echo '<form>
  				<div class="input-group">
    				<input type="text" class="form-control js-copytextarea"
        				value="http://tell.kirschn.de/'.$screen_name.'" placeholder="" id="copy-input">
    				<span class="input-group-btn">
      				<button class="btn btn-default js-textareacopybtn" type="button" id="copy-button"
          				data-toggle="tooltip" data-placement="button"
          				title="Copy to Clipboard">
        				Copy
  				    </button>
  				  </span>
  				</div>
				</form><br><br>';
				echo 'Hier sind deine letzten Nachrichten:<br><br><div style="text-align: left">';
				//Connect databse
				$link = mysqli_connect($dbServer,$dbUsername,$dbPassword,$dbName);
				if(mysqli_connect_errno()){
					die("Failed to connect with MySQL");
				}
				if (isset($_GET["page"])) {
					$page = intval($_GET["page"]);
				} else {
					$page = 0;
				}
				if ($stmt = mysqli_prepare($link, "SELECT id, content, timestamp, tweetable, image FROM tells WHERE for_uid=? ORDER BY id DESC LIMIT ?,10")) {
				    $stmt->bind_param("ii", $twitter_id, $page);
				    $stmt->execute();
				    $stmt->store_result();
				    $stmt->bind_result($id, $content, $timestamp, $tweetable, $image);

				    while($stmt->fetch())
				    {
				        echo "<br><div style='text-align: right'>".DateTime::createFromFormat('Y-m-d H:i:s', $timestamp)->format('d.m.Y H:i:s')." Uhr<br><br>";
				        if ($tweetable) {
                            echo "<button type='button' class='btn btn-primary' onclick='tweetmodal($id)'>Tweet</button>";
				        } else {
				            echo "Das soll unter uns bleiben!";
				        }
                        echo "</div><br>" . htmlspecialchars($content);
				        if ($image !== null) {
				            echo "<a href='".$image."' target='_top'><div class='imgContainer'><img class='appendIMG' src='".$image."' /></div></a>";
                        }
                        echo "<hr>";
				    }


				    $stmt->close();
				}
				$link->close();
				//Show welcome message

                if ($page >= 10) {
                    echo '</div><br><br><div style="text-align=right"><a href="/index.php?page='.($page - 10).'"><button type="button" class="btn btn-info" id="prevpage">Vorherige Seite</button></a><br><br><br></div>';
                }

				echo '</div><br><br><div style="text-align=right"><a href="/index.php?page='.($page + 10).'"><button type="button" class="btn btn-info" id="nextpage">Nächste Seite</button></a><br><br><br></div>';

			}else{
				//Display login button
				echo '<a href="process.php"><button type="button" class="btn btn-primary">Sign in with Twitter</button></a>';
			}
		?>
	</div>
	<script type="text/javascript">
        jQuery.fn.resizeToParent = function(options) {
            var defaults = {
                parent: 'div'
            }

            var options = jQuery.extend(defaults, options);

            return this.each(function() {
                var o = options;
                var obj = jQuery(this);

                // bind to load of image
                obj.load(function() {
                    // dimensions of the parent
                    var parentWidth = obj.parents(o.parent).width();
                    var parentHeight = obj.parents(o.parent).height();

                    // dimensions of the image
                    var imageWidth = obj.width();
                    var imageHeight = obj.height();

                    // step 1 - calculate the percentage difference between image width and container width
                    var diff = imageWidth / parentWidth;

                    // step 2 - if height divided by difference is smaller than container height, resize by height. otherwise resize by width
                    if ((imageHeight / diff) < parentHeight) {
                        obj.css({'width': 'auto', 'height': parentHeight});

                        // set image variables to new dimensions
                        imageWidth = imageWidth / (imageHeight / parentHeight);
                        imageHeight = parentHeight;
                    }
                    else {
                        obj.css({'height': 'auto', 'width': parentWidth});

                        // set image variables to new dimensions
                        imageWidth = parentWidth;
                        imageHeight = imageHeight / diff;
                    }

                    // step 3 - center image in container
                    var leftOffset = (imageWidth - parentWidth) / -2;
                    var topOffset = (imageHeight - parentHeight) / -2;

                    obj.css({'left': leftOffset, 'top': topOffset});
                });

                // force ie to run the load function if the image is cached
                if (this.complete) {
                    obj.trigger('load');
                }
            });
        };
		function onload() {
		//	document.getElementById("remaining").addEventListener("input", recalcRemaining);
            $('.appendIMG').resizeToParent();
            $(window).resize(function() {
                $('.appendIMG').resizeToParent();
            });
		}
		var copyTextareaBtn = document.querySelector('.js-textareacopybtn');

		copyTextareaBtn.addEventListener('click', function(event) {
		  var copyTextarea = document.querySelector('.js-copytextarea');
		  copyTextarea.select();

		  try {
		    var successful = document.execCommand('copy');
		    var msg = successful ? 'successful' : 'unsuccessful';
		    console.log('Copying text command was ' + msg);
		  } catch (err) {
		    console.log('Oops, unable to copy');
		  }
		});
		function tweetmodal(id) {

			document.getElementById("tellid").value = id;
			document.getElementById("tweettext").value = " #Tellschn";
			recalcRemaining();
			$("#tweetmodal").modal();

		}
		function send() {
			if ((140 - parseInt($("#tweettext").val().length)) >= 0) {
				$.post("api.php?tweetouttoken=<?php echo $_SESSION["tweetouttoken"]; ?>&tweetout=" + $("#tellid").val(), {
					"tweettext": $("#tweettext").val().substr(0,140)
				}, function (res) {
					console.log(res);
					console.log("Tweeted!");
				})
			}
		}
		function recalcRemaining() {
			document.getElementById("remaining").innerHTML= 140 - parseInt($("#tweettext").val().length);
		}
	</script>
	<div id="tweetmodal" class="modal fade" role="dialog">
	  <div class="modal-dialog">

	    <!-- Modal content-->
	    <div class="modal-content">
	      <div class="modal-header">
	        <button type="button" class="close" data-dismiss="modal">&times;</button>
	        <h4 class="modal-title">Tweet</h4>
	      </div>
	      <div class="modal-body">
	        <p id="modalbody">
	        	<div class="form-group">
	        	  <label for="tweettext">Tweet:</label>
	        	  <input type="text" class="form-control" id="tweettext" oninput="recalcRemaining()"><br>
	        	  <span id="remaining">140</span>
	        	  <input type="hidden" value="" id="tellid"><br>
	        	  Ein Bild mit der Nachricht wird Automatisch an den Tweet angehangen.
	        	</div>
	        </p>
	      </div>
	      <div class="modal-footer">
	      <button type="button" class="btn btn-default" data-dismiss="modal" onclick="send()">Tweet</button>
	        <button type="button" class="btn btn-default" data-dismiss="modal">Close</button>
	      </div>
	    </div>

	  </div>
	</div>
	</body>
</html>
