const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const values = require('./values');

module.exports = {
	getHash = (str) => {
		const salt = bcrypt.genSaltSync(10);
		return bcrypt.hashSync(str, salt);
	},
	generateToken = (data) => {
		return 'JWT ' + jwt.sign({ data }, values.secret, { expiresIn: '45d' });
	}
};