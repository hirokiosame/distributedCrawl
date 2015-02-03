module.exports = function(sequelize){

	var async = require("async"),
		url = require("url"),
		querystring = require("querystring");

	// var statusCache = {};
	function getStatus(statusName, callback){

		if( typeof statusName !== "string" ){
			throw new Error("getStatus accepts a string");
		}

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
		});
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

		// Get form - only real forms with destinations
		var form = forms.pop();

		// Validate form
		var valUrl = url.parse(url.resolve(base, form.action));

		// If there is a query, parse and add to inputs
		if( valUrl.query ){
			var parsedQuery = querystring.parse(valUrl.query);
			for( var key in parsedQuery ){
				form.params.push({
					name: key,
					value: parsedQuery[key]
				});
			}
		}

		valUrl.hash = null;
		valUrl.query = null;
		valUrl.search = null;
		valUrl.href = null;

		// Parse to extract any get parameters
		form.action = url.format(valUrl);

		return sequelize.Schemas.aggForms
		.findOrInitialize({
			where: {
				// pageId: id,
				formHash: sequelize.hash(form.action)
			},
			defaults: {
				pageId: id,
				method: (typeof form.method === "string" && form.method.toUpperCase()) === "POST" ? "POST" : "GET",
				action: form.action
			},
			transaction: transaction
		})
		.then(function(fetchedForms){

			// Save
			var trans = fetchedForms[0].save({ transaction: transaction });

			// Filter inputs
			form.params = filterInputs(form.params);

			// If the form has parameters
			if( form.params instanceof Array && form.params.length > 0 ){

				return trans.then(function(insForm){
					return insertInputs(transaction, id, insForm.formId, form.params);
				});
			}

			// Go to next
			else{
				return ( forms.length === 0 ) ? trans : trans.then(function(){
					return insertForms(transaction, id, base, forms);
				});
			}
		});
	}

	function insertInputs(transaction, id, formId, inputs){

		var input = inputs.pop();

		input.value = input.value || null;
		input.type = input.type || null;

		return sequelize.Schemas.aggInputs
		.findOrInitialize({
			where: {
				// pageId: id,
				// formId: formId,
				inputHash: sequelize.hash(id + (formId || "") + input.name + input.value)
			},
			defaults: {
				pageId: id,
				formId: formId,
				type: input.type || null,
				name: input.name,
				value: input.value
			},
			transaction: transaction
		}).then(function(fetchedInputs){

			// Found, ignore
			// if( fetchedInputs[1] === false ){ return; }

			// Save
			var trans = fetchedInputs[0].save({ transaction: transaction });

			return ( inputs.length === 0 ) ? trans : trans.then(function(){
				return insertInputs(transaction, id, formId, inputs);
			});
		});
	}

	function insertLinks(transaction, id, level, links){

		var link = links.pop();

		return sequelize.Schemas.queue
		.findOrInitialize({
			where: {
				urlHash: sequelize.hash(link)
			},
			defaults: {
				url: link,
				parentId: id,
				level: level
			}
		})
		.then(function(fetchedLink){

			// Save
			var trans = fetchedLink[0].save({ transaction: transaction });

			return ( links.length === 0 ) ? trans : trans.then(function(){
				return insertLinks(transaction, id, level, links);
			});
		});
	}


	function validURL(uri, base, sameHost){

		// If there is a base, resolve it
		if( typeof base === "string" ){ uri = url.resolve(base, uri); }

		// Resolve URL
		var resolvedUrl = url.parse(uri);

		// Validate protocol
		if( resolvedUrl.protocol !== "http:" && resolvedUrl.protocol !== "https:" ){ return null; }

		// Validate same host
		if( typeof base === "string" && sameHost ){

			var parsedBase = url.parse(base);
			if( parsedBase.host !== resolvedUrl.host ){ return null; }
		}

		// Remove unneeded
		resolvedUrl.hash = null;
		resolvedUrl.port = null;

		return url.format(resolvedUrl);
	}


	function filterForms(forms, base){
		var newForms = [];

		forms.forEach(function(form){
			if( form.hasOwnProperty("action") && (form.action = validURL(form.action, base, 1)) ){
				newForms.push(form);
			}
		});

		return newForms;
	}

	function filterInputs(inputs){
		return inputs.filter(function(input){
			return input.hasOwnProperty("name");
		});
	}

	function filterLinks(links, base){
		var set = {};
		links.forEach(function(link){
			( link = validURL(link.href, base, 1)) && ( set[link] = 1 );
		});

		return Object.keys(set);
	}
	
	return function(callback){
		return function(result){

			var status;

			if(!result){
				console.log("No result...", result);
			}

			var _result = JSON.stringify(result, 0, 4);

			// Check for errors
			if( result.hasOwnProperty("error") ){
				status = result.error;
			}else{

				// Make sure it has data
				if(
					!result.hasOwnProperty("data") ||
					!result.data
				){
					console.log(result);
					throw new Error("No error or data");
				}

				if( result.data.status ){
					status = "HTTP " + result.data.status;
				}else{
					console.log("No status", _result);
				}
			}


			var id = result.queueId;

			sequelize.transaction(function(transaction){

				// Get status code
				return getStatus(status)
				.then(function(s){

					// Update status
					var trans = updateStatus(transaction, id, s[0].statusId);

					if( result.error ){ return trans; }

					return trans

					// Insert headers
					.then(function(){

						if( result.data.headers.length > 0 ){
							return insertHeaders(transaction, id, result.data.headers);
						}
					})

					// Insert Forms
					.then(function(){

						// Filter forms
						result.data.extracted.forms = filterForms(result.data.extracted.forms, result.data.url);

						// Insert forms
						if( result.data.extracted.forms.length > 0 ){
							return insertForms(transaction, id, result.url, result.data.extracted.forms);
						}
					})

					// Insert Inputs
					// .then(function(){

					// 	// Filter Inputs
					// 	result.data.extracted.inputs = filterInputs(result.data.extracted.inputs);

					// 	// Insert Inputs
					// 	if( result.data.extracted.inputs.length > 0 ){
					// 		return insertInputs(transaction, id, null, result.data.extracted.inputs);
					// 	}
					// })

					// Insert Links
					.then(function(){

						// Filter links
						result.data.extracted.links = filterLinks(result.data.extracted.links, result.data.url);

						if( result.data.extracted.links.length > 0 ){
							return insertLinks(transaction, id, result.level+1, result.data.extracted.links);
						}
					});
				});

			})
			.complete(function(err, success){
				// console.log(id, "transaction completed");
				if(err){
					console.log(err);
					delete result.data.extracted.links;
					console.log(_result);
				}
				// }else{
				// 	console.log("complete", arguments);	
				// }
				callback();
			});
		};
	};
};