module.exports = function worker(listen){

	console.log(process.pid, "Worker online");


	var initPhantomCrawler = require("phantomCrawler");
	var Logger = require("logger");

	// Wait till log is prepared
	listen.on("logDir", function(logDir){

		// Worker log
		var log = new Logger(logDir + "/" + process.pid + ".log");

		log.createType("stdout", "stderr");


		var phantom;

		// Initialize socket and process
		initPhantomCrawler(function(_phantom){
			phantom = _phantom;

			// Signal ready
			listen.emit("ready");
		})

		.on("stdout", function(id, msg){
			log.stdout(msg.slice(0, -1));
		})
		.on("stderr", function(id, msg){
			log.stderr(msg.slice(0, -1));
		})
		.on("log", function(msg){
			log.log(msg);
		})
		.on("error", function(msg){
			log.error(msg);
		});


		// Wait for crawl request
		listen.recv(function(crawlReq, replyTo){

			// console.log(process.pid, "ready for", crawlReq);

			var log = new Logger(logDir + "/" + process.pid + "_phantomLogs/" + crawlReq.queueId + "_" + +(new Date()) + ".log");

			crawlReq.timeout = 60000;
			crawlReq.imagePath = "";

			phantom.req(
				crawlReq ,
				function(err, result){

					// Close log
					log.close();

					if( err ){
						crawlReq.error = err.message;
						result = crawlReq;
					}

					// Return to master
					replyTo(result);
				}
			)
			.on("log", function(logObj){
				log.log(logObj.time, logObj.message);
			});
		});
	});
};