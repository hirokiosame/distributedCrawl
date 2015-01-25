module.exports = function(sequelize){

	var async = require("async"),
		url = require("url");

	var statusCache = {};
	function getStatus(statusName, callback){

		// if( typeof callback !== "function" ){ throw new Error("Callback not a function"); }

		// Check cache
		// if( statusCache.hasOwnProperty(statusName) ){
		// 	return callback(null, statusCache[statusName]);
		// }

		// Find status code
		return sequelize.Schemas.crawlStatuses.findOrCreate({
			where: {
				statusName: statusName
			}
		}); /*.complete(function(err, status){
			if( err ){ return callback(err); }

			callback(null, (statusCache[statusName] = status[0].statusId));
		});*/
	}


	function updateStatus(transaction, id, crawlStatus){

		return sequelize.Schemas.queue
		.update({
			crawlStatus: crawlStatus
		}, {
			where: {
				queueId: id
			},
			transaction: transaction
		});
	}

	function insertHeaders(transaction, id, headers){

		var header = headers.pop();

		var trans = sequelize.Schemas.aggHeaders
		.create({
			pageId: id,
			name: header.name,
			value: header.value
		}, { transaction: transaction });

		return ( headers.length === 0 ) ? trans : trans.then(function(){
			return insertHeaders(transaction, id, headers);
		});
	}

	function insertForms(transaction, id, base, forms){


		// Get form
		var form = forms.pop();

		// Validate form
		var valUrl = url.parse(url.resolve(base, form.action));
		console.log(valUrl)

		delete valUrl.hash;

		form.action = url.format(valUrl);

		var trans = sequelize.Schemas.aggForms
		.build({
			pageId: id,
			method: form.method.toUpperCase(),
			action: form.action // Parse to extract any get parameters
		})
		.hash()
		.save({ transaction: transaction });

		// console.log("ASS", trans.hash() === trans);


		form.params = [];

		// If the form has parameters
		if( form.params instanceof Array && form.params.length > 0 ){


		}else{
			return ( forms.length === 0 ) ? trans : trans.then(function(){
				return insertForms(transaction, id, base, forms);
			});
		}
	}

	function insertInputs(){

	}

	function insertLinks(){

	}



	return function(callback){
		return function(result){

			var status;

			// Check for errors
			if( result.hasOwnProperty("error") ){
				status = result.error;
			}else{

				// Make sure it has data
				if( !result.hasOwnProperty("data") ){
					console.log(result);
					throw new Error("No error or data");
				}

				status = "HTTP " + result.data.status;
			}

			console.log(result);

			var id = result.queueId;

			sequelize.transaction(function(transaction){

				// Get status code
				return getStatus(status)
				.then(function(s){

					// Update status
					return updateStatus(transaction, id, s[0].statusId)
					.then(function(){

						// Insert headers
						return insertHeaders(transaction, id, result.data.headers)
						.then(function(){

							// Insert forms
							return insertForms(transaction, id, result.url, result.data.extracted.forms);

						});
					});
				});

			})
			.complete(function(err, success){
				if(err){
					console.log(JSON.stringify(err, 0, 3));
				}else{
					console.log("complete", arguments);	
				}
				callback();
			});
			// .then(function(){
			// 	console.log("transaction", arguments);
			// })
			// .catch(function(){
			// 	console.log("catch", arguments);
			// });
		};
	};
};