module.exports = function(host, username, password, database, table){


	var sequelize = require("./sequelize")(host, database, username, password, "crawl1");

	var clusterDistribution = require("clusterDistribution");


	var insertQueue = [];
	function enqueue(rows){

		// IF array
		if( rows instanceof Array ){ return rows.forEach(enqueue); }

		// Ignore if not string
		if( typeof rows !== "string" ){ return false; }


		insertQueue.push(rows);

		setTimeout(function(){

			var spliced = insertQueue.splice(0, insertQueue.length);
			if( spliced.length === 0 ){ return; }

			sequelize.Schemas.then(function(){

				sequelize.Schemas.queue.bulkCreate(
					spliced.map(function(row){
						return {
							url: row,
							parentId: null,
							level: 1
						};
					}),
					{
						ignoreDuplicates: true
					}
				)
				.complete(function(err, rows){
					if( err ){ throw new Error(err); }
					// console.log("Bulk created", arguments);
				});

			});

		}, 100);
	}

	function startCrawling(options){
		return function(){
			clusterDistribution(
				options.workers,
				require("./master")(sequelize),
				require("./worker")
			);
		};
	}

	return function(options, importer){

		// Start import
		importer(enqueue, startCrawling(options));
	};
};

if( require.main === module ){

	var read = require("read");

	function check( prompt, value, callback ){
		if( value === undefined ){
			read({ prompt: prompt+": " }, function(err, answer){
				if( err ){ return callback(err); }
				else{ return callback(null, answer); }
			});
		}else{
			// Return
			console.log(prompt+":", value);
			callback(null, value);
		}
	}

	// Get commandline arguments
	var args = process.argv.slice(2);

	// Else, prompt user
	check("Host", args[0], function(err, host){

	if( err ){ throw err; }
	check("Username", args[1], function(err, username){

	if( err ){ throw err; }
	check("Password", args[2], function(err, password){

	if( err ){ throw err; }
	check("Database", args[3], function(err, database){

	if( err ){ throw err; }
	check("Table", args[4], function(err, table){

	if( err ){ throw err; }

		module.exports(host, username, password, database, table);

	}); }); }); }); });
}