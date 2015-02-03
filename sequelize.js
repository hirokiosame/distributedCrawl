module.exports = function(host, database, username, password, prefix){

	// Credentials
	var Sequelize = require('sequelize'),
		sequelize = new Sequelize(database, username, password, {
			logging: false,
			dialect: "mysql",
			host: host,
			define: {
				engine: "INNODB"
			}
		});

	// Authenticate
	sequelize
	.authenticate()
	.complete(function(err) {
		if (!!err) {
			console.log('Unable to connect to the database:', err)
		} else {
			console.log('Connection has been established successfully.')
		}
	});


	var crypto = require('crypto');

	function sha1(str){
		return crypto.createHash('sha1').update(str).digest('hex');
	}
	sequelize.hash = sha1;

	// Declare Schemas
	sequelize.Schemas = {};

	sequelize.Schemas.crawlStatuses = sequelize.define((prefix ? prefix + '_' : '') + 'crawlStatuses', {
		statusId: {
			type: Sequelize.INTEGER,
			allowNull: false,
			autoIncrement: true,
			primaryKey: true
		},
		statusName: {
			type: Sequelize.STRING,
			allowNull: false,
			unique: true
		}
	});


	sequelize.Schemas.queue = sequelize.define((prefix ? prefix + '_' : '') + 'queue', {
		queueId: {
			type: Sequelize.INTEGER,
			allowNull: false,
			autoIncrement: true,
			primaryKey: true
		},
		url: {
			type: Sequelize.STRING(1000),
			allowNull: false
		},
		// title: {
		// 	type: Sequelize.STRING
		// },
		urlHash: {
			type: Sequelize.CHAR(40),
			allowNull: false,
			unique: true
		},
		parentId: {
			type: Sequelize.INTEGER,
			allowNull: true,
			references: sequelize.Schemas.queue,
			referencesKey: "queueId"
		},
		crawlStatus: {
			type: Sequelize.INTEGER,
			references: sequelize.Schemas.crawlStatuses,
			referencesKey: "statusId",
			allowNull: true
		},
		level: {
			type: Sequelize.INTEGER,
			allowNull: false
		}
	},
	{
		instanceMethods: {
			hash: function(v){
				this.urlHash = sha1(this.url);
				return this;
			}
		},
		hooks: {
			beforeBulkCreate: function(rows){
				rows.forEach(function(row){
					row.hash();
				});
			}
		}
	});

	sequelize.Schemas.aggForms = sequelize.define((prefix ? prefix + '_' : '') + 'aggForms', {
		formId: {
			type: Sequelize.INTEGER,
			allowNull: false,
			autoIncrement: true,
			primaryKey: true
		},
		pageId: {
			type: Sequelize.INTEGER,
			allowNull: false,
			references: sequelize.Schemas.queue,
			referencesKey: "queueId"
		},
		method: {
			type: Sequelize.ENUM('GET', 'POST')
		},
		action: {
			type: Sequelize.STRING
		},
		formHash: {
			type: Sequelize.CHAR(40),
			allowNull: false,
			unique: true
		}
	},
	{
		instanceMethods: {
			hash: function(v){
				this.formHash = sha1(this.action);
				return this;
			}
		},
		// hooks: {
		// 	beforeBulkCreate: function(rows){
		// 		rows.forEach(function(row){
		// 			row.hash();
		// 		});
		// 	}
		// }
	});

	sequelize.Schemas.aggInputs = sequelize.define((prefix ? prefix + '_' : '') + 'aggInputs', {
		pageId: {
			type: Sequelize.INTEGER,
			allowNull: false,
			references: sequelize.Schemas.queue,
			referencesKey: "queueId"
		},
		formId: {
			type: Sequelize.INTEGER,
			allowNull: true,
			references: sequelize.Schemas.aggForms,
			referencesKey: "formId"
		},
		type: {
			type: Sequelize.STRING
		},
		name: {
			type: Sequelize.STRING
		},
		value: {
			type: Sequelize.STRING
		},
		inputHash: {
			type: Sequelize.CHAR(40),
			allowNull: false,
			unique: true
		}
	},
	{
		instanceMethods: {
			hash: function(v){
				this.inputHash = sha1(this.pageId + this.fromId + this.name + this.value);
				return this;
			}
		}
	});

	sequelize.Schemas.aggHeaders = sequelize.define((prefix ? prefix + '_' : '') + 'aggHeaders', {
		pageId: {
			type: Sequelize.INTEGER,
			allowNull: false,
			references: sequelize.Schemas.queue,
			referencesKey: "queueId"
		},
		name: {
			type: Sequelize.STRING
		},
		value: {
			type: Sequelize.TEXT
		}
	});


	var sync = sequelize.sync({ force: true });
	sequelize.Schemas.then = function(cb){
		sync.then(cb);
	};

	return sequelize;
};