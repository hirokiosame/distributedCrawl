(function(){

	var enqueue = function(sequelize){

		var insertQueue = [], timeout;

		return function enqueue(rows){

			// IF array
			if( rows instanceof Array ){ return rows.forEach(enqueue); }

			// Ignore if not string
			if( typeof rows !== "string" ){ return false; }

			clearTimeout(timeout);

			insertQueue.push(rows);

			timeout = setTimeout(function(){

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
		};
	};


	function main(credentials, options, importer){

		// Validate credentials
		if( typeof credentials !== "object" || !(credentials instanceof Object) ){ throw new Error("Credentials is an invalid object"); }

		if( !["host", "user", "password", "database", "table"].every(function(prop){
			return	typeof credentials[prop] === "string" &&
					credentials[prop].length > 0;
		}) ){ throw new Error("Credentials don't have valid properties"); }

		// Validate options
		if( typeof options !== "object" || !(credentials instanceof Object) ){
			throw new Error("Options is an invalid object");
		}

		// Validate importer
		if( typeof importer !== "function" ){ throw new Error("Importer must be a function"); }


		// Connect to DB
		var sequelize = require("./sequelize")(credentials.host, credentials.database, credentials.user, credentials.password, credentials.table);

		var clusterDistribution = require("clusterDistribution");

		// Start import
		importer(enqueue(sequelize), function startCrawling(){
			clusterDistribution(
				options.workers,
				require("./master")(sequelize),
				require("./worker")
			);
		});
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

			main(host, username, password, database, table);

		}); }); }); }); });
	}else{
		module.exports = main;
	}
})();