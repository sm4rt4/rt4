const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const User = require('../models/user');
const Rider = require('../models/rider');
const values = require('./values');

module.exports = {
	getHash: (str) => {
		const salt = bcrypt.genSaltSync(10);
		return bcrypt.hashSync(str, salt);
	},
	generateToken: (data) => {
		return jwt.sign({ data }, values.secret, { expiresIn: '45d' });
	},
	verifyToken: (token, callback) => {
		jwt.verify(token, values.secret, (err, decoded) => {
			if (err) callback('Unauthorized');
			else {
				User.getAuthUser(decoded.data.phone, decoded.data.hash, (err, userDoc) => {
					if (err || userDoc == null) callback('Unauthorized');
					else callback(null, userDoc);
				});
			}
		});
	},
	verifyRiderToken: (token, callback) => {
		jwt.verify(token, values.secret, (err, decoded) => {
			if (err) callback('Unauthorized');
			else {
				Rider.getAuthUser(decoded.data.phone, decoded.data.hash, (err, userDoc) => {
					if (err || userDoc == null) callback('Unauthorized');
					else callback(null, userDoc);
				});
			}
		});
	},
	getOtp: () => {
		const min = 1100;
		const range = 8800;

		return Math.floor(Math.random() * range) + min;
	}
};