const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const User = require('../models/user');
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
				User.getAuthUser(decoded.phone, decoded.hash, (err, userDoc) => {
					if (err || userDoc == null) callback('Unauthorized');
					else callback(null, userDoc);
				});
			}
		});
	}
};