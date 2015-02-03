module.exports = function(sequelize){


	var parseResult = require("./parseREsult")(sequelize);

	var fs = require("fs");
	function mkDir(dirName){
		try{ fs.mkdirSync(dirName); }
		catch(err){ if (err.code == 'EEXIST'){ return 1; } }
		return 1;
	}


	function callN(counter, callback){
		return function(){
			if( !--counter ){ callback(); }
		};
	}


	var workerTabs = {};

	// gets N rows from MySQL
	function getNext(n, cb){

		if( n < 1 ){ return; }

		var except = [];
		for( var k in workerTabs ){
			workerTabs[k] && except.push( workerTabs[k].row.queueId );
		}

		sequelize.Schemas.then(function(){
			sequelize.Schemas.queue.sync().then(function(){
				sequelize.Schemas.queue.findAll({
					where: "crawlStatus IS NULL" + (except.length ? (" AND queueId NOT IN (" + except.join() + ")") : ""),
					// {
					// 	crawlStatus: null,
					// 	queueId: { not: [except] }
					// },
					limit: n,
					order: "level ASC, RAND()"
				}, { raw: true }).complete(function(err, rows){
					if( err ){ console.log(this.sql); throw err; }

					if( rows.length === 0 ){
						return console.log("Error! 0 rows returned");
					}

					rows.forEach(cb);
				});
			});
		});
	}


	function prepareLog(workers, ready){

		// Final callback
		var workerReady = callN(workers.length, ready);

		var logDate = +(new Date()),
			workerLogs = "logs_" + logDate;

		mkDir(workerLogs);

		workers.forEach(function(worker){

			// Make log directory
			mkDir(workerLogs + "/" + worker.listeningTo.process.pid + "_phantomLogs");

			worker.listeningTo.process.on("exit", function(){
				workerTabs[worker.listeningTo.process.pid] = null;
			});

			// Notify
			worker
				.emit("logDir", workerLogs)
				.on("ready", function(){
					workerReady();
				});
		});
	}


	function sec2Time(sec){
		sec = ~~(sec/1000);
		var min = ~~(sec/60);

		if( min ){ return min + ":" + ("0" + (sec%60)).slice(-2); }
		return sec%60;	
	}

	return function master(workers){

		console.log("Master online", workers.length);

		prepareLog(workers, function(){

			// Keep tabs
			setInterval(function logWorkers(){
				console.log("<-------Worker info------");
				console.log("Workers available:", workers.length);
				console.log("Worker Stats:");
				for( var i in workerTabs ){
					if( workerTabs[i] ){
						console.log(
							"\t", i, "(Elapsed " + sec2Time(new Date() - workerTabs[i].started) + ")",
							JSON.stringify(workerTabs[i].row)
						// 	"\tworker["+i+"] (Elapsed " + sec2Time((new Date()) - workerTabs[i].started) + "):",
						// 	"ID:", workerTabs[i].row.id,
						// 	"; Host:", workerTabs[i].row.host,
						// 	"; Checked:", workerTabs[i].row.checked,
						// 	"; Saved:", workerTabs[i].row.saved
						);
					}
				}
				console.log("------------------------->");
			}, 5000);

			// Fetch rows for workers
			getNext(workers.length, function each(row){

				// If no workers are available, ignore
				if( workers.length === 0 ){ return; }

				// Fetch worker
				var worker = workers.pop(),
					workerPid = worker.listeningTo.process.pid;

				// console.log("Sending worker [" + workerPid + "]: ", row.id, row.host);

				// Keep tabs
				workerTabs[workerPid] = { started: new Date(), row: row };

				// Send work
				worker.send( row, parseResult(function(){

					// Remove tab
					workerTabs[workerPid] = null;

					// Put worker back in queue
					workers.push(worker);

					// Get next row
					setImmediate(function(){
						getNext(workers.length, each);
					});
				}));
			});
		});
	};
};